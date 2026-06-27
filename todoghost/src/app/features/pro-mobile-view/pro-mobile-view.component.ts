import { Component, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
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
import { SvgIconComponent } from '../../core/svg-icon/svg-icon.component';

type CalGrain = 'month' | 'week';
type SmartList = 'inbox' | 'today' | 'week' | 'urgent' | 'unscheduled' | 'completed';
type SelectedList = SmartList | { kind: 'category'; id: string } | { kind: 'category-none' } | { kind: 'user'; id: string };
/** Three bottom-sheet snap heights in vh, à la Apple Maps. */
type SheetSnap = 'mini' | 'half' | 'full';

interface CalendarDay {
  dateStr: string;
  dayNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  hasTasks: boolean;
  hasUrgent: boolean;
  lunarLabel: string;
  isSolarTerm: boolean;
}

const SHEET_HEIGHTS: Record<SheetSnap, number> = {
  mini: 96,   // px peeking above the bottom — just shows date + count + drag handle
  half: 0.5,  // 50vh
  full: 0.92, // 92vh
};

const USER_COLORS = [
  { bar: '#3b82f6', avatar: '#dbeafe', text: '#1d4ed8' },
  { bar: '#ec4899', avatar: '#fce7f3', text: '#be185d' },
  { bar: '#10b981', avatar: '#d1fae5', text: '#047857' },
  { bar: '#f59e0b', avatar: '#fef3c7', text: '#b45309' },
  { bar: '#8b5cf6', avatar: '#ede9fe', text: '#6d28d9' },
  { bar: '#14b8a6', avatar: '#ccfbf1', text: '#0f766e' },
];

@Component({
  selector: 'app-pro-mobile-view',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconComponent],
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

  // ----- View state -----
  calGrain: CalGrain = 'month';
  currentDate = new Date();
  selectedDateStr = format(new Date(), 'yyyy-MM-dd');
  selectedList: SelectedList = 'today';
  searchQuery = '';

  // ----- Calendar -----
  calendarDays: CalendarDay[] = [];
  weekDays: CalendarDay[] = [];
  currentMonthStr = '';
  currentWeekStr = '';

  // ----- Sidebar overlay -----
  sidebarOpen = signal(false);

  // ----- Bottom sheet -----
  sheetSnap = signal<SheetSnap>('half');
  /** True while the user is dragging the sheet handle. */
  sheetDragging = signal(false);
  sheetDragOffset = signal(0); // px from the snap height
  private sheetDragStartY = 0;
  private sheetDragStartHeight = 0;

  /** 'date' = show selectedDateStr's tasks, 'unscheduled' = show unscheduled bucket. */
  sheetMode = signal<'date' | 'unscheduled'>('date');

  // ----- Lunar mapping (zh-TW solar terms) -----
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
    this.workspaceService.currentWorkspace$.pipe(takeUntil(this.destroy$)).subscribe(ws => {
      if (!ws) { this.router.navigate(['/workspaces']); return; }
      this.currentWorkspace = ws;
      this.taskService.getTasks(ws.id).pipe(takeUntil(this.destroy$)).subscribe(tasks => {
        this.tasks = tasks;
        this.buildCalendar();
        this.buildWeek();
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
    this.buildCalendar();
    this.buildWeek();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ----- Filtering -----
  passesGlobalFilter(task: Task): boolean {
    const sel = this.selectedList;
    if (typeof sel === 'object') {
      if (sel.kind === 'category' && task.categoryId !== sel.id) return false;
      if (sel.kind === 'category-none' && task.categoryId) return false;
      if (sel.kind === 'user' && task.createdBy !== sel.id) return false;
    }
    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      const hay = (task.title + ' ' + (task.description ?? '') + ' ' + (task.tags ?? []).join(' ')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  tasksForDate(dateStr: string): Task[] {
    return this.tasks
      .filter(t => t.date === dateStr && this.passesGlobalFilter(t))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'completed' ? 1 : -1;
        const at = a.startTime ?? '99:99';
        const bt = b.startTime ?? '99:99';
        if (at !== bt) return at < bt ? -1 : 1;
        return (a.order ?? 0) - (b.order ?? 0);
      });
  }

  unscheduledTasks(): Task[] {
    return this.tasks
      .filter(t => !t.date && t.status !== 'completed' && this.passesGlobalFilter(t))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  unscheduledCount(): number { return this.unscheduledTasks().length; }

  // ----- Calendar build -----
  buildCalendar() {
    const monthStart = startOfMonth(this.currentDate);
    const monthEnd = endOfMonth(this.currentDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const days: CalendarDay[] = [];
    let d = gridStart;
    while (d <= gridEnd) {
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayTasks = this.tasks.filter(t => t.date === dateStr && this.passesGlobalFilter(t));
      const lunar = this.lunarLabelFor(dateStr);
      days.push({
        dateStr,
        dayNum: d.getDate(),
        isCurrentMonth: isSameMonth(d, this.currentDate),
        isToday: dateStr === todayStr,
        hasTasks: dayTasks.length > 0,
        hasUrgent: dayTasks.some(t => t.isUrgent && t.status !== 'completed'),
        lunarLabel: lunar.label,
        isSolarTerm: lunar.isSolarTerm,
      });
      d = addDays(d, 1);
    }
    this.calendarDays = days;
    this.currentMonthStr = format(this.currentDate, 'yyyy 年 M 月');
  }

  buildWeek() {
    const start = startOfWeek(this.currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(this.currentDate, { weekStartsOn: 1 });
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const days: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayTasks = this.tasks.filter(t => t.date === dateStr && this.passesGlobalFilter(t));
      const lunar = this.lunarLabelFor(dateStr);
      days.push({
        dateStr,
        dayNum: d.getDate(),
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        hasTasks: dayTasks.length > 0,
        hasUrgent: dayTasks.some(t => t.isUrgent && t.status !== 'completed'),
        lunarLabel: lunar.label,
        isSolarTerm: lunar.isSolarTerm,
      });
    }
    this.weekDays = days;
    this.currentWeekStr = `${format(start, 'M/d')} – ${format(end, 'M/d')}`;
  }

  // ----- Navigation -----
  setGrain(grain: CalGrain) {
    this.calGrain = grain;
    localStorage.setItem('pro-mobile:calGrain', grain);
  }

  prevPeriod() {
    this.currentDate = this.calGrain === 'month' ? subMonths(this.currentDate, 1) : subWeeks(this.currentDate, 1);
    this.buildCalendar();
    this.buildWeek();
  }

  nextPeriod() {
    this.currentDate = this.calGrain === 'month' ? addMonths(this.currentDate, 1) : addWeeks(this.currentDate, 1);
    this.buildCalendar();
    this.buildWeek();
  }

  goToToday() {
    this.currentDate = new Date();
    this.selectedDateStr = format(new Date(), 'yyyy-MM-dd');
    this.buildCalendar();
    this.buildWeek();
  }

  selectDate(dateStr: string) {
    this.selectedDateStr = dateStr;
    this.sheetMode.set('date');
    if (this.sheetSnap() === 'mini') this.sheetSnap.set('half');
  }

  // ----- Sidebar -----
  openSidebar() { this.sidebarOpen.set(true); }
  closeSidebar() { this.sidebarOpen.set(false); }

  selectSmartList(list: SmartList) {
    this.selectedList = list;
    if (list === 'today' || list === 'week') {
      this.currentDate = new Date();
      this.selectedDateStr = format(new Date(), 'yyyy-MM-dd');
    }
    this.buildCalendar();
    this.buildWeek();
    this.closeSidebar();
  }

  selectCategoryList(cat: Category) {
    this.selectedList = { kind: 'category', id: cat.id };
    this.buildCalendar();
    this.buildWeek();
    this.closeSidebar();
  }

  selectNoCategoryList() {
    this.selectedList = { kind: 'category-none' };
    this.buildCalendar();
    this.buildWeek();
    this.closeSidebar();
  }

  selectUserList(user: User) {
    this.selectedList = { kind: 'user', id: user.id };
    this.buildCalendar();
    this.buildWeek();
    this.closeSidebar();
  }

  isSelectedList(list: SmartList): boolean { return this.selectedList === list; }
  isSelectedCategory(catId: string): boolean {
    return typeof this.selectedList === 'object' && this.selectedList.kind === 'category' && this.selectedList.id === catId;
  }
  isSelectedNoCategory(): boolean {
    return typeof this.selectedList === 'object' && this.selectedList.kind === 'category-none';
  }
  isSelectedUser(userId: string): boolean {
    return typeof this.selectedList === 'object' && this.selectedList.kind === 'user' && this.selectedList.id === userId;
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

  // ----- Bottom sheet drag -----
  startSheetDrag(e: TouchEvent | MouseEvent) {
    const y = this.eventClientY(e);
    this.sheetDragStartY = y;
    this.sheetDragStartHeight = this.snapHeightPx(this.sheetSnap());
    this.sheetDragging.set(true);
    this.sheetDragOffset.set(0);
    if (e instanceof MouseEvent) e.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  @HostListener('document:touchmove', ['$event'])
  onSheetDragMove(e: TouchEvent | MouseEvent) {
    if (!this.sheetDragging()) return;
    const y = this.eventClientY(e);
    // dragging up = negative delta → height grows; dragging down = positive → shrink.
    const delta = this.sheetDragStartY - y;
    this.sheetDragOffset.set(delta);
    if (e.cancelable && 'preventDefault' in e) e.preventDefault();
  }

  @HostListener('document:mouseup')
  @HostListener('document:touchend')
  @HostListener('document:touchcancel')
  endSheetDrag() {
    if (!this.sheetDragging()) return;
    const finalHeight = this.sheetDragStartHeight + this.sheetDragOffset();
    this.sheetSnap.set(this.nearestSnap(finalHeight));
    this.sheetDragging.set(false);
    this.sheetDragOffset.set(0);
  }

  /** Translates a SheetSnap into its current pixel height, accounting for vh units. */
  private snapHeightPx(snap: SheetSnap): number {
    const h = SHEET_HEIGHTS[snap];
    if (snap === 'mini') return h as number;
    return (h as number) * window.innerHeight;
  }

  private nearestSnap(heightPx: number): SheetSnap {
    const mini = this.snapHeightPx('mini');
    const half = this.snapHeightPx('half');
    const full = this.snapHeightPx('full');
    const candidates: [SheetSnap, number][] = [['mini', mini], ['half', half], ['full', full]];
    let best: SheetSnap = 'half';
    let bestDist = Infinity;
    for (const [snap, target] of candidates) {
      const d = Math.abs(heightPx - target);
      if (d < bestDist) { bestDist = d; best = snap; }
    }
    return best;
  }

  /** CSS height value to apply during drag / on rest. */
  sheetHeightStyle(): string {
    const base = this.snapHeightPx(this.sheetSnap());
    if (!this.sheetDragging()) return base + 'px';
    const live = Math.max(48, Math.min(window.innerHeight - 16, base + this.sheetDragOffset()));
    return live + 'px';
  }

  private eventClientY(e: TouchEvent | MouseEvent): number {
    if ('touches' in e) {
      return e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY ?? 0;
    }
    return e.clientY;
  }

  // ----- Task actions -----
  async toggleCompletion(task: Task, ev?: Event) {
    if (ev) { ev.stopPropagation(); ev.preventDefault(); }
    const next = task.status === 'completed' ? 'pending' : 'completed';
    await this.taskService.updateTask(task.id, { status: next });
  }

  /** Tap a task → push the full-screen detail / edit view. */
  openTask(task: Task) {
    this.router.navigate(['/pro/task', task.id]);
  }

  /** + button → push the full-screen create view, pre-filled with the
   *  currently selected calendar date. */
  openCreate() {
    this.router.navigate(['/pro/new'], { queryParams: { date: this.selectedDateStr } });
  }

  backToClassic() {
    this.router.navigate(['/main']);
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

  categoryFor(catId?: string): Category | undefined {
    return this.categories.find(c => c.id === catId);
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

  userName(userId: string | undefined): string {
    if (!userId) return '';
    return this.workspaceUsers.find(u => u.id === userId)?.name ?? '';
  }

  userInitial(userId: string | undefined): string {
    const name = this.userName(userId);
    return name ? name[0] : '?';
  }

  /** Today's task list, shown as the default sheet content for selectedDateStr. */
  get sheetTitle(): string {
    if (this.sheetMode() === 'unscheduled') return '未排程';
    return this.selectedDateStr;
  }

  get sheetTaskList(): Task[] {
    return this.sheetMode() === 'unscheduled'
      ? this.unscheduledTasks()
      : this.tasksForDate(this.selectedDateStr);
  }
}
