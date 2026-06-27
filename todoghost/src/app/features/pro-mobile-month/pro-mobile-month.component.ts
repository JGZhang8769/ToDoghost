import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns';
// @ts-ignore — pure JS lib, no types shipped
import { getLunar } from 'chinese-lunar-calendar';

import { TaskService, Task } from '../../core/services/task.service';
import { CategoryService, Category } from '../../core/services/category.service';
import { WorkspaceService, Workspace } from '../../core/services/workspace.service';
import { SwipeBackDirective } from '../../core/directives/swipe-back.directive';

type Grain = 'month' | 'week';
const HOUR_PX = 56;

interface MonthCell {
  dateStr: string;
  dayNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  hasTasks: boolean;
  hasUrgent: boolean;
  lunarLabel: string;
  isSolarTerm: boolean;
}

interface WeekTimedBlock {
  task: Task;
  top: number;
  height: number;
  col: number;
  totalCols: number;
}

interface WeekColumn {
  dateStr: string;
  dayNum: number;
  dayName: string;
  isToday: boolean;
  isSelected: boolean;
  allDay: Task[];
  timed: WeekTimedBlock[];
}

/**
 * Full-screen month / week calendar for Pro Mobile.
 *
 * - Month grain: 6-row grid of day cells, each cell shows day number,
 *   optional lunar / solar-term label, and a dot if it has tasks.
 *   Tapping a cell selects + shows that day's task list below the grid.
 *
 * - Week grain: Apple Calendar style — 7-column header + all-day row
 *   + 24-hour timeline with absolutely-positioned events that pack into
 *   side-by-side columns when they overlap.
 *
 * Either grain has navigation arrows (prev/next period) and a 「今天」 chip.
 */
@Component({
  selector: 'app-pro-mobile-month',
  standalone: true,
  imports: [CommonModule, FormsModule, SwipeBackDirective],
  templateUrl: './pro-mobile-month.component.html',
  styleUrl: './pro-mobile-month.component.scss',
})
export class ProMobileMonthComponent implements OnInit, OnDestroy {
  private taskService = inject(TaskService);
  private categoryService = inject(CategoryService);
  private workspaceService = inject(WorkspaceService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  // ----- Data -----
  currentWorkspace: Workspace | null = null;
  tasks: Task[] = [];
  categories: Category[] = [];

  // ----- View state -----
  grain = signal<Grain>('month');
  currentDate = signal(new Date());
  selectedDateStr = signal(format(new Date(), 'yyyy-MM-dd'));

  // ----- Built data -----
  monthCells = signal<MonthCell[]>([]);
  weekCols = signal<WeekColumn[]>([]);
  currentTitle = signal('');
  dayHours = Array.from({ length: 24 }, (_, i) => i);
  hourPx = HOUR_PX;
  /** Y-coordinate of the now line in the week timeline. */
  nowLineTop = signal(0);
  private nowTimer: any;

  private static readonly SOLAR_TERM_TW: Record<string, string> = {
    '立春': '立春', '雨水': '雨水', '惊蛰': '驚蟄', '春分': '春分',
    '清明': '清明', '谷雨': '穀雨', '立夏': '立夏', '小满': '小滿',
    '芒种': '芒種', '夏至': '夏至', '小暑': '小暑', '大暑': '大暑',
    '立秋': '立秋', '处暑': '處暑', '白露': '白露', '秋分': '秋分',
    '寒露': '寒露', '霜降': '霜降', '立冬': '立冬', '小雪': '小雪',
    '大雪': '大雪', '冬至': '冬至', '小寒': '小寒', '大寒': '大寒',
  };

  ngOnInit() {
    const savedGrain = localStorage.getItem('pmob-month:grain') as Grain | null;
    if (savedGrain === 'month' || savedGrain === 'week') this.grain.set(savedGrain);

    this.workspaceService.currentWorkspace$.pipe(takeUntil(this.destroy$)).subscribe(ws => {
      if (!ws) { this.router.navigate(['/workspaces']); return; }
      this.currentWorkspace = ws;
      this.taskService.getTasks(ws.id).pipe(takeUntil(this.destroy$)).subscribe(tasks => {
        this.tasks = tasks;
        this.rebuild();
      });
      this.categoryService.getCategories(ws.id).pipe(takeUntil(this.destroy$)).subscribe(cats => {
        this.categories = cats.sort((a, b) => a.order - b.order);
      });
    });

    this.rebuild();
    this.updateNowLine();
    this.nowTimer = setInterval(() => this.updateNowLine(), 60_000);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.nowTimer) clearInterval(this.nowTimer);
  }

  // ----- Navigation -----
  back() { this.router.navigate(['/pro']); }

  setGrain(g: Grain) {
    this.grain.set(g);
    localStorage.setItem('pmob-month:grain', g);
    this.rebuild();
  }

  prevPeriod() {
    const next = this.grain() === 'month' ? subMonths(this.currentDate(), 1) : subWeeks(this.currentDate(), 1);
    this.currentDate.set(next);
    this.rebuild();
  }
  nextPeriod() {
    const next = this.grain() === 'month' ? addMonths(this.currentDate(), 1) : addWeeks(this.currentDate(), 1);
    this.currentDate.set(next);
    this.rebuild();
  }
  goToToday() {
    this.currentDate.set(new Date());
    this.selectedDateStr.set(format(new Date(), 'yyyy-MM-dd'));
    this.rebuild();
  }

  selectCell(dateStr: string) {
    this.selectedDateStr.set(dateStr);
    this.rebuild();
  }

  openDayList() {
    this.router.navigate(['/pro/list', 'date-' + this.selectedDateStr()]);
  }

  openTask(task: Task) {
    this.router.navigate(['/pro/task', task.id]);
  }

  openCreate() {
    this.router.navigate(['/pro/new'], { queryParams: { date: this.selectedDateStr() } });
  }

  // ----- Build -----
  private rebuild() {
    if (this.grain() === 'month') this.buildMonth();
    else this.buildWeek();
  }

  private buildMonth() {
    const cd = this.currentDate();
    const monthStart = startOfMonth(cd);
    const monthEnd = endOfMonth(cd);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const sel = this.selectedDateStr();
    const cells: MonthCell[] = [];
    let d = gridStart;
    while (d <= gridEnd) {
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayTasks = this.tasks.filter(t => t.date === dateStr && t.status !== 'completed');
      const lunar = this.lunarLabelFor(dateStr);
      cells.push({
        dateStr,
        dayNum: d.getDate(),
        isCurrentMonth: isSameMonth(d, cd),
        isToday: dateStr === todayStr,
        isSelected: dateStr === sel,
        hasTasks: dayTasks.length > 0,
        hasUrgent: dayTasks.some(t => t.isUrgent),
        lunarLabel: lunar.label,
        isSolarTerm: lunar.isSolarTerm,
      });
      d = addDays(d, 1);
    }
    this.monthCells.set(cells);
    this.currentTitle.set(format(cd, 'yyyy 年 M 月'));
  }

  private buildWeek() {
    const cd = this.currentDate();
    const start = startOfWeek(cd, { weekStartsOn: 1 });
    const end = endOfWeek(cd, { weekStartsOn: 1 });
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const sel = this.selectedDateStr();
    const names = ['一', '二', '三', '四', '五', '六', '日'];
    const cols: WeekColumn[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayTasks = this.tasks.filter(t => t.date === dateStr);
      const allDay = dayTasks.filter(t => !t.startTime);
      const timed = this.packTimedBlocks(dayTasks.filter(t => t.startTime));
      cols.push({
        dateStr,
        dayNum: d.getDate(),
        dayName: names[i],
        isToday: dateStr === todayStr,
        isSelected: dateStr === sel,
        allDay,
        timed,
      });
    }
    this.weekCols.set(cols);
    this.currentTitle.set(`${format(start, 'M/d')} – ${format(end, 'M/d')}`);
  }

  /** Same column-packing algorithm as the desktop Pro week view. */
  private packTimedBlocks(tasks: Task[]): WeekTimedBlock[] {
    if (tasks.length === 0) return [];
    interface B { task: Task; startMin: number; endMin: number; col: number; groupId: number; }
    const blocks: B[] = tasks.map(t => {
      const [sh, sm] = (t.startTime ?? '0:00').split(':').map(Number);
      const startMin = sh * 60 + sm;
      let endMin = startMin + 30;
      if (t.endTime) {
        const [eh, em] = t.endTime.split(':').map(Number);
        endMin = eh * 60 + em;
        if (endMin <= startMin) endMin = startMin + 30;
      }
      return { task: t, startMin, endMin, col: -1, groupId: -1 };
    });
    blocks.sort((a, b) => a.startMin === b.startMin ? b.endMin - a.endMin : a.startMin - b.startMin);

    const colEnd: number[] = [];
    for (const b of blocks) {
      let placed = false;
      for (let i = 0; i < colEnd.length; i++) {
        if (colEnd[i] <= b.startMin) {
          b.col = i; colEnd[i] = b.endMin; placed = true; break;
        }
      }
      if (!placed) { b.col = colEnd.length; colEnd.push(b.endMin); }
    }
    let groupId = 0;
    const active: B[] = [];
    for (const b of blocks) {
      for (let i = active.length - 1; i >= 0; i--) if (active[i].endMin <= b.startMin) active.splice(i, 1);
      b.groupId = active.length === 0 ? groupId++ : active[0].groupId;
      active.push(b);
    }
    const gTot = new Map<number, number>();
    for (const b of blocks) gTot.set(b.groupId, Math.max(gTot.get(b.groupId) ?? 0, b.col + 1));
    return blocks.map(b => ({
      task: b.task,
      top: (b.startMin / 60) * HOUR_PX,
      height: Math.max(24, ((b.endMin - b.startMin) / 60) * HOUR_PX),
      col: b.col,
      totalCols: gTot.get(b.groupId) ?? 1,
    }));
  }

  private updateNowLine() {
    const now = new Date();
    this.nowLineTop.set(((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX);
  }

  // ----- Selected-day list for the bottom of month view -----
  get selectedDayTasks(): Task[] {
    return this.tasks
      .filter(t => t.date === this.selectedDateStr())
      .sort((a, b) => {
        const at = a.startTime ?? '99:99';
        const bt = b.startTime ?? '99:99';
        if (at !== bt) return at < bt ? -1 : 1;
        return (a.order ?? 0) - (b.order ?? 0);
      });
  }

  // ----- Lunar helpers -----
  lunarLabelFor(dateStr: string): { label: string; isSolarTerm: boolean } {
    const [y, m, d] = dateStr.split('-').map(Number);
    try {
      const lunar = getLunar(y, m, d);
      if (lunar.solarTerm) {
        const tw = ProMobileMonthComponent.SOLAR_TERM_TW[lunar.solarTerm] ?? lunar.solarTerm;
        return { label: tw, isSolarTerm: true };
      }
      if (lunar.lunarDate === 1) {
        const monthChars = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '臘'];
        return { label: `${monthChars[lunar.lunarMonth - 1]}月`, isSolarTerm: false };
      }
      return { label: this.formatLunarDay(lunar.lunarDate), isSolarTerm: false };
    } catch {
      return { label: '', isSolarTerm: false };
    }
  }
  private formatLunarDay(day: number): string {
    const nums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    if (day <= 10) return `初${nums[day - 1]}`;
    if (day < 20) return `十${nums[day - 11]}`;
    if (day === 20) return '二十';
    if (day < 30) return `廿${nums[day - 21]}`;
    if (day === 30) return '三十';
    return '';
  }

  isEmoji(str: string): boolean {
    if (!str) return false;
    return /\p{Extended_Pictographic}/u.test(str);
  }
  categoryFor(catId?: string): Category | undefined {
    return this.categories.find(c => c.id === catId);
  }
}
