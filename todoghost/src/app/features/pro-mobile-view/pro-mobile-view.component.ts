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
import { UserService, User } from '../../core/services/user.service';

type SmartList = 'today' | 'week' | 'urgent' | 'unscheduled' | 'completed' | 'inbox';

interface WeekDot {
  dateStr: string;
  dayNum: number;
  dayName: string;
  isToday: boolean;
  isSelected: boolean;
  hasTasks: boolean;
  hasUrgent: boolean;
}

interface MonthCell {
  dateStr: string;
  dayNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  hasTasks: boolean;
  hasUrgent: boolean;
}

const USER_COLORS = [
  { bar: '#3b82f6', avatar: '#dbeafe', text: '#1d4ed8' },
  { bar: '#ec4899', avatar: '#fce7f3', text: '#be185d' },
  { bar: '#10b981', avatar: '#d1fae5', text: '#047857' },
  { bar: '#f59e0b', avatar: '#fef3c7', text: '#b45309' },
  { bar: '#8b5cf6', avatar: '#ede9fe', text: '#6d28d9' },
  { bar: '#14b8a6', avatar: '#ccfbf1', text: '#0f766e' },
];

/**
 * Pro Mobile home screen, redesigned to match Apple Reminders' card-first feel:
 * - Top region: short week strip + "view calendar" link.
 * - Middle: 2x2 smart-list cards (Today / This Week / Urgent / Unscheduled).
 * - Below: 「我的分類」 grouped list and 「建立者」 chips for collab.
 * - Bottom: docked quick-add bar — type + Enter creates an unscheduled task.
 *
 * All deep navigation pushes a new route (/pro/list, /pro/month, /pro/task/:id,
 * /pro/new) — no in-page sheets. iOS-style "page push" feel.
 */
@Component({
  selector: 'app-pro-mobile-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pro-mobile-view.component.html',
  styleUrl: './pro-mobile-view.component.scss',
})
export class ProMobileViewComponent implements OnInit, OnDestroy {
  private taskService = inject(TaskService);
  private categoryService = inject(CategoryService);
  private workspaceService = inject(WorkspaceService);
  private userService = inject(UserService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  // ----- Data -----
  currentWorkspace: Workspace | null = null;
  currentUser: User | null = null;
  tasks: Task[] = [];
  categories: Category[] = [];
  workspaceUsers: User[] = [];

  // ----- UI state -----
  searchQuery = signal('');
  quickAddTitle = signal('');
  weekStrip = signal<WeekDot[]>([]);
  monthCells = signal<MonthCell[]>([]);
  /** When true, the home shows the full month grid; otherwise just the week strip. */
  calExpanded = signal(false);
  /** Anchor date for the visible week / month (advances with prev/next arrows). */
  anchorDate = signal(new Date());
  /** Headline date the user is "viewing" — drives the highlighted cell. */
  selectedDateStr = signal(format(new Date(), 'yyyy-MM-dd'));
  /** Title shown above the strip / grid: "2026 年 6 月" or "6/22 – 6/28". */
  periodTitle = signal('');

  // Lunar / solar terms zh-TW mapping
  private static readonly SOLAR_TERM_TW: Record<string, string> = {
    '立春': '立春', '雨水': '雨水', '惊蛰': '驚蟄', '春分': '春分',
    '清明': '清明', '谷雨': '穀雨', '立夏': '立夏', '小满': '小滿',
    '芒种': '芒種', '夏至': '夏至', '小暑': '小暑', '大暑': '大暑',
    '立秋': '立秋', '处暑': '處暑', '白露': '白露', '秋分': '秋分',
    '寒露': '寒露', '霜降': '霜降', '立冬': '立冬', '小雪': '小雪',
    '大雪': '大雪', '冬至': '冬至', '小寒': '小寒', '大寒': '大寒',
  };

  // ----- Lifecycle -----
  ngOnInit() {
    // Restore last expanded preference so the home stays consistent
    // across reloads.
    this.calExpanded.set(localStorage.getItem('pmob-home:calExpanded') === '1');

    this.workspaceService.currentWorkspace$.pipe(takeUntil(this.destroy$)).subscribe(ws => {
      if (!ws) { this.router.navigate(['/workspaces']); return; }
      this.currentWorkspace = ws;
      this.taskService.getTasks(ws.id).pipe(takeUntil(this.destroy$)).subscribe(tasks => {
        this.tasks = tasks;
        this.rebuildCalendar();
      });
      this.categoryService.getCategories(ws.id).pipe(takeUntil(this.destroy$)).subscribe(cats => {
        this.categories = cats.sort((a, b) => a.order - b.order);
      });
    });
    this.userService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(u => this.currentUser = u);
    this.userService.getUsers().pipe(takeUntil(this.destroy$)).subscribe(users => {
      const memberIds = new Set(this.currentWorkspace?.users ?? []);
      const filtered = memberIds.size > 0 ? users.filter(u => memberIds.has(u.id)) : users;
      this.workspaceUsers = [...filtered].sort((a, b) => a.id.localeCompare(b.id));
    });
    this.rebuildCalendar();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ----- Calendar build -----
  /** Rebuild whichever grain is currently visible. Title always updates so
   *  toggling between week and month is instantaneous and consistent. */
  rebuildCalendar() {
    if (this.calExpanded()) this.buildMonth();
    else this.buildWeekStrip();
  }

  buildWeekStrip() {
    const anchor = this.anchorDate();
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    const end = endOfWeek(anchor, { weekStartsOn: 1 });
    const names = ['一', '二', '三', '四', '五', '六', '日'];
    const sel = this.selectedDateStr();
    const result: WeekDot[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const ds = format(d, 'yyyy-MM-dd');
      const dayTasks = this.tasks.filter(t => t.date === ds && t.status !== 'completed');
      result.push({
        dateStr: ds,
        dayNum: d.getDate(),
        dayName: names[i],
        isToday: ds === todayStr,
        isSelected: ds === sel,
        hasTasks: dayTasks.length > 0,
        hasUrgent: dayTasks.some(t => t.isUrgent),
      });
    }
    this.weekStrip.set(result);
    this.periodTitle.set(`${format(start, 'M/d')} – ${format(end, 'M/d')}`);
  }

  buildMonth() {
    const anchor = this.anchorDate();
    const monthStart = startOfMonth(anchor);
    const monthEnd = endOfMonth(anchor);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const sel = this.selectedDateStr();
    const cells: MonthCell[] = [];
    let d = gridStart;
    while (d <= gridEnd) {
      const ds = format(d, 'yyyy-MM-dd');
      const dayTasks = this.tasks.filter(t => t.date === ds && t.status !== 'completed');
      cells.push({
        dateStr: ds,
        dayNum: d.getDate(),
        isCurrentMonth: isSameMonth(d, anchor),
        isToday: ds === todayStr,
        isSelected: ds === sel,
        hasTasks: dayTasks.length > 0,
        hasUrgent: dayTasks.some(t => t.isUrgent),
      });
      d = addDays(d, 1);
    }
    this.monthCells.set(cells);
    this.periodTitle.set(format(anchor, 'yyyy 年 M 月'));
  }

  // ----- Calendar navigation -----
  toggleCalExpanded() {
    const next = !this.calExpanded();
    this.calExpanded.set(next);
    localStorage.setItem('pmob-home:calExpanded', next ? '1' : '0');
    this.rebuildCalendar();
  }

  prevPeriod() {
    this.anchorDate.set(this.calExpanded()
      ? subMonths(this.anchorDate(), 1)
      : subWeeks(this.anchorDate(), 1));
    this.rebuildCalendar();
  }

  nextPeriod() {
    this.anchorDate.set(this.calExpanded()
      ? addMonths(this.anchorDate(), 1)
      : addWeeks(this.anchorDate(), 1));
    this.rebuildCalendar();
  }

  resetToToday() {
    this.anchorDate.set(new Date());
    this.selectedDateStr.set(format(new Date(), 'yyyy-MM-dd'));
    this.rebuildCalendar();
  }

  smartListCount(list: SmartList): number {
    const today = format(new Date(), 'yyyy-MM-dd');
    const ws = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const we = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    switch (list) {
      case 'today':       return this.tasks.filter(t => t.date === today && t.status !== 'completed').length;
      case 'urgent':      return this.tasks.filter(t => t.isUrgent && t.status !== 'completed').length;
      case 'unscheduled': return this.tasks.filter(t => !t.date && t.status !== 'completed').length;
      case 'inbox':       return this.tasks.filter(t => t.status !== 'completed').length;
      case 'week':        return this.tasks.filter(t => t.date && t.date >= ws && t.date <= we && t.status !== 'completed').length;
      case 'completed':   return this.tasks.filter(t => t.status === 'completed').length;
    }
    return 0;
  }

  categoryCount(catId: string): number {
    return this.tasks.filter(t => t.categoryId === catId && t.status !== 'completed').length;
  }

  noCategoryCount(): number {
    return this.tasks.filter(t => !t.categoryId && t.status !== 'completed').length;
  }

  userCount(userId: string): number {
    return this.tasks.filter(t => t.createdBy === userId && t.status !== 'completed').length;
  }

  // ----- Headline -----
  get headlineDate(): string {
    const ds = this.selectedDateStr();
    return ds;
  }
  get headlineDayName(): string {
    const [y, m, d] = this.selectedDateStr().split('-').map(Number);
    const names = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
    return names[new Date(y, m - 1, d).getDay()];
  }
  get headlineLunar(): { label: string; isSolarTerm: boolean } {
    return this.lunarLabelFor(this.selectedDateStr());
  }
  get isHeadlineToday(): boolean {
    return this.selectedDateStr() === format(new Date(), 'yyyy-MM-dd');
  }

  // ----- Navigation -----
  /** Tap a day in either the week strip or the month grid — push the list
   *  for that day. Calendar still shows the highlight while the new page
   *  loads on top, so when the user swipes back it stays visually anchored. */
  selectCalendarDay(dateStr: string) {
    this.selectedDateStr.set(dateStr);
    this.rebuildCalendar();
    this.router.navigate(['/pro/list', 'date-' + dateStr]);
  }

  openSmartList(list: SmartList) {
    this.router.navigate(['/pro/list', list]);
  }
  openCategoryList(cat: Category) {
    this.router.navigate(['/pro/list', 'cat-' + cat.id]);
  }
  openNoCategoryList() {
    this.router.navigate(['/pro/list', 'cat-none']);
  }
  openUserList(user: User) {
    this.router.navigate(['/pro/list', 'user-' + user.id]);
  }

  openCreate() {
    this.router.navigate(['/pro/new'], { queryParams: { date: this.selectedDateStr() } });
  }

  backToClassic() {
    this.router.navigate(['/main']);
  }

  // ----- Quick add -----
  async submitQuickAdd() {
    const title = this.quickAddTitle().trim();
    if (!title || !this.currentWorkspace || !this.currentUser) return;
    const maxOrder = this.tasks.reduce((m, t) => Math.max(m, t.order ?? 0), 0);
    await this.taskService.addTask({
      workspaceId: this.currentWorkspace.id,
      title,
      // Quick-add is intentionally fast: it drops the task into the
      // unscheduled bucket so the user can plan it later from the list.
      date: null,
      startTime: null,
      endTime: null,
      tags: [],
      isUrgent: false,
      createdBy: this.currentUser.id,
      status: 'pending',
      reminderOffset: null,
      order: maxOrder + 1,
    } as any);
    this.quickAddTitle.set('');
  }

  /**
   * Click the right-side button on the quick-add bar:
   *   - has text     → submit (same as Enter): adds an unscheduled task
   *   - empty input  → open the full create form for elaborate setup
   *
   * Previously the "has text" branch navigated to /pro/new with title in
   * the query params, but the detail page didn't read that param so the
   * form opened blank — user reported "點向上箭頭無法新增".
   */
  async onQuickAddButton() {
    if (this.quickAddTitle().trim()) {
      await this.submitQuickAdd();
    } else {
      this.openCreate();
    }
  }

  // ----- Helpers -----
  lunarLabelFor(dateStr: string): { label: string; isSolarTerm: boolean } {
    const [y, m, d] = dateStr.split('-').map(Number);
    try {
      const lunar = getLunar(y, m, d);
      if (lunar.solarTerm) {
        const tw = ProMobileViewComponent.SOLAR_TERM_TW[lunar.solarTerm] ?? lunar.solarTerm;
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

  userColor(userId: string | undefined): { bar: string; avatar: string; text: string } | null {
    if (!userId) return null;
    const idx = this.workspaceUsers.findIndex(u => u.id === userId);
    if (idx < 0) return null;
    return USER_COLORS[idx % USER_COLORS.length];
  }

  userInitial(userId: string | undefined): string {
    if (!userId) return '?';
    return (this.workspaceUsers.find(u => u.id === userId)?.name ?? '?')[0];
  }
}
