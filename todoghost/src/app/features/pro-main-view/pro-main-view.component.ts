import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Subject, takeUntil } from 'rxjs';
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns';
// @ts-ignore — pure JS lib, no types shipped
import { getLunar } from 'chinese-lunar-calendar';

import { TaskService, Task } from '../../core/services/task.service';
import { CategoryService, Category } from '../../core/services/category.service';
import { WorkspaceService, Workspace } from '../../core/services/workspace.service';
import { UserService, User } from '../../core/services/user.service';
import { SvgIconComponent } from '../../core/svg-icon/svg-icon.component';

type LayoutMode = 'calendar-first' | 'list-first';
type CalGrain = 'month' | 'week';
type SmartList = 'inbox' | 'today' | 'week' | 'urgent' | 'unscheduled' | 'completed' | 'selected-date';
type SelectedList = SmartList | { kind: 'category'; id: string } | { kind: 'user'; id: string };
type InspectorMode = 'day' | 'edit';

interface CalendarDay {
  dateStr: string;
  dayNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  tasks: Task[];
  lunarLabel: string;        // e.g. "初一", "立春"
  isSolarTerm: boolean;      // true if lunarLabel is a 節氣
}

interface WeekDay {
  dateStr: string;
  dayNum: number;
  dayName: string;
  isToday: boolean;
  tasks: Task[];
  allDay: Task[];
  timedBlocks: { task: Task; top: number; height: number }[];
  lunarLabel: string;
  isSolarTerm: boolean;
}

const HOUR_PX = 48; // visible height per hour in week timeline

/**
 * Per-user accent palette used to mark task creator. Cycles based on user
 * order in the workspace so the assignment is stable across reloads.
 */
const USER_COLORS = [
  { bar: '#3b82f6', avatar: '#dbeafe', text: '#1d4ed8' },   // blue
  { bar: '#ec4899', avatar: '#fce7f3', text: '#be185d' },   // pink
  { bar: '#10b981', avatar: '#d1fae5', text: '#047857' },   // green
  { bar: '#f59e0b', avatar: '#fef3c7', text: '#b45309' },   // amber
  { bar: '#8b5cf6', avatar: '#ede9fe', text: '#6d28d9' },   // violet
  { bar: '#14b8a6', avatar: '#ccfbf1', text: '#0f766e' },   // teal
];

/**
 * Form model used by the Pro inline create form. Mirrors a Task shape but
 * without the IDs the service generates.
 */
interface NewTaskForm {
  title: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  isUrgent: boolean;
  categoryId?: string;
  tags: string[];
  reminderOffset: number | null;
  description: string;
}

@Component({
  selector: 'app-pro-main-view',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, SvgIconComponent],
  templateUrl: './pro-main-view.component.html',
  styleUrl: './pro-main-view.component.scss',
})
export class ProMainViewComponent implements OnInit, OnDestroy {
  private taskService = inject(TaskService);
  private categoryService = inject(CategoryService);
  private workspaceService = inject(WorkspaceService);
  private userService = inject(UserService);
  private router = inject(Router);

  private destroy$ = new Subject<void>();

  // Layout state
  layoutMode: LayoutMode = 'calendar-first';
  calGrain: CalGrain = 'month';
  leftWidth = 240;
  rightWidth = 380;
  readonly LEFT_MIN = 200;
  readonly LEFT_MAX = 360;
  readonly RIGHT_MIN = 320;
  readonly RIGHT_MAX = 520;
  showInspector = true;

  // Splitter drag state
  splitter: null | 'left' | 'right' = null;
  splitterStartX = 0;
  splitterStartWidth = 0;

  // Data
  currentWorkspace: Workspace | null = null;
  currentUser: User | null = null;
  tasks: Task[] = [];
  categories: Category[] = [];
  workspaceUsers: User[] = [];

  // View state
  selectedList: SelectedList = 'today';
  currentDate = new Date();
  selectedDateStr = format(new Date(), 'yyyy-MM-dd');

  // Inspector: 'day' = list of selectedDateStr's tasks, 'edit' = single task editor
  inspectorMode: InspectorMode = 'day';
  selectedTaskId: string | null = null;
  get selectedTask(): Task | null {
    return this.selectedTaskId ? this.tasks.find(t => t.id === this.selectedTaskId) ?? null : null;
  }

  // Quick add (legacy quickAdd box still lives in list pane header)
  quickAddTitle = '';
  searchQuery = '';

  // Pro inline create form
  showCreateForm = false;
  createForm: NewTaskForm = this.blankCreateForm();
  createFormTagInput = '';

  // Inline category create (lives in left sidebar)
  showCategoryCreate = false;
  newCategoryName = '';
  newCategoryIcon = 'category';
  readonly availableCategoryIcons = [
    'home', 'work', 'fitness_center', 'restaurant', 'flight', 'shopping_cart',
    'directions_car', 'music_note', 'local_cafe', 'school', 'pets', 'favorite',
    'attach_money', 'event', 'cake', 'menu_book', 'brush', 'videogame_asset',
  ];

  // Inline confirm dialog (replaces window.confirm for delete)
  confirmDialog: null | { title: string; message: string; action: () => void } = null;

  // Calendar data
  calendarDays: CalendarDay[] = [];
  weekDays: WeekDay[] = [];
  currentMonthStr = '';
  currentWeekStr = '';
  dayHours = Array.from({ length: 24 }, (_, i) => i);
  nowLineTop = 0;

  private nowTimer: any;

  // ---------- Smart list ----------
  get quickAddTargetDate(): string | null {
    if (this.selectedList === 'unscheduled') return null;
    return this.selectedDateStr;
  }

  get listPaneTasks(): Task[] {
    let filtered: Task[];
    const today = format(new Date(), 'yyyy-MM-dd');
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

    // When layout is "list-first", the list always follows the selected date
    // from the mini-calendar regardless of which smart list is active.
    if (this.layoutMode === 'list-first') {
      filtered = this.tasks.filter(t => t.date === this.selectedDateStr && t.status !== 'completed');
    } else if (this.selectedList === 'selected-date') {
      filtered = this.tasks.filter(t => t.date === this.selectedDateStr && t.status !== 'completed');
    } else if (this.selectedList === 'today') {
      filtered = this.tasks.filter(t => t.date === today && t.status !== 'completed');
    } else if (this.selectedList === 'week') {
      filtered = this.tasks.filter(t => t.date && t.date >= weekStart && t.date <= weekEnd && t.status !== 'completed');
    } else if (this.selectedList === 'urgent') {
      filtered = this.tasks.filter(t => t.isUrgent && t.status !== 'completed');
    } else if (this.selectedList === 'unscheduled') {
      filtered = this.tasks.filter(t => !t.date && t.status !== 'completed');
    } else if (this.selectedList === 'completed') {
      filtered = this.tasks.filter(t => t.status === 'completed');
    } else if (this.selectedList === 'inbox') {
      filtered = this.tasks.filter(t => t.status !== 'completed');
    } else if (typeof this.selectedList === 'object' && this.selectedList.kind === 'category') {
      const catId = this.selectedList.id;
      filtered = this.tasks.filter(t => t.categoryId === catId && t.status !== 'completed');
    } else if (typeof this.selectedList === 'object' && this.selectedList.kind === 'user') {
      const userId = this.selectedList.id;
      filtered = this.tasks.filter(t => t.createdBy === userId && t.status !== 'completed');
    } else {
      filtered = this.tasks;
    }

    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q) ||
        (t.tags ?? []).some(tag => tag.toLowerCase().includes(q))
      );
    }

    return filtered.sort((a, b) => {
      if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
      const aDate = a.date ?? '9999-99-99';
      const bDate = b.date ?? '9999-99-99';
      if (aDate !== bDate) return aDate < bDate ? -1 : 1;
      const aTime = a.startTime ?? '99:99';
      const bTime = b.startTime ?? '99:99';
      if (aTime !== bTime) return aTime < bTime ? -1 : 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });
  }

  get currentListLabel(): string {
    if (this.layoutMode === 'list-first') return this.selectedDateStr;
    if (this.selectedList === 'selected-date') return this.selectedDateStr;
    if (this.selectedList === 'today') return '今日';
    if (this.selectedList === 'week') return '本週';
    if (this.selectedList === 'urgent') return '緊急';
    if (this.selectedList === 'unscheduled') return '未排程';
    if (this.selectedList === 'completed') return '已完成';
    if (this.selectedList === 'inbox') return '收件匣';
    if (typeof this.selectedList === 'object' && this.selectedList.kind === 'category') {
      return this.categories.find(c => c.id === (this.selectedList as any).id)?.name ?? '分類';
    }
    if (typeof this.selectedList === 'object' && this.selectedList.kind === 'user') {
      return this.workspaceUsers.find(u => u.id === (this.selectedList as any).id)?.name ?? '建立者';
    }
    return '清單';
  }

  smartListCount(list: SmartList): number {
    const today = format(new Date(), 'yyyy-MM-dd');
    const ws = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const we = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    switch (list) {
      case 'today':         return this.tasks.filter(t => t.date === today && t.status !== 'completed').length;
      case 'urgent':        return this.tasks.filter(t => t.isUrgent && t.status !== 'completed').length;
      case 'unscheduled':   return this.tasks.filter(t => !t.date && t.status !== 'completed').length;
      case 'inbox':         return this.tasks.filter(t => t.status !== 'completed').length;
      case 'week':          return this.tasks.filter(t => t.date && t.date >= ws && t.date <= we && t.status !== 'completed').length;
      case 'completed':     return this.tasks.filter(t => t.status === 'completed').length;
      case 'selected-date': return this.tasksForDate(this.selectedDateStr).length;
    }
    return 0;
  }

  categoryCount(catId: string): number {
    return this.tasks.filter(t => t.categoryId === catId && t.status !== 'completed').length;
  }

  userCount(userId: string): number {
    return this.tasks.filter(t => t.createdBy === userId && t.status !== 'completed').length;
  }

  /** All tasks (including completed) for a given dateStr, sorted by startTime then order. */
  tasksForDate(dateStr: string): Task[] {
    return this.tasks
      .filter(t => t.date === dateStr)
      .sort((a, b) => {
        const at = a.startTime ?? '99:99';
        const bt = b.startTime ?? '99:99';
        if (at !== bt) return at < bt ? -1 : 1;
        return (a.order ?? 0) - (b.order ?? 0);
      });
  }

  // ---------- User color (creator marker) ----------
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

  // ---------- Lunar / solar term helpers ----------
  /**
   * Returns a short string suitable for showing under the gregorian date in
   * a calendar cell:
   *   - if the day is a 節氣 (e.g. 立春), returns the term name
   *   - else if it's lunar 初一, returns the lunar month name (e.g. 正月)
   *   - else returns the lunar date (初二, 廿三, …)
   * Also returns whether this is a solar term so the caller can colour it.
   */
  lunarLabelFor(dateStr: string): { label: string; isSolarTerm: boolean } {
    const [y, m, d] = dateStr.split('-').map(Number);
    try {
      const lunar = getLunar(y, m, d);
      if (lunar.solarTerm) return { label: lunar.solarTerm, isSolarTerm: true };
      if (lunar.lunarDate === 1) {
        const monthChars = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
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

  // ---------- Create form helpers ----------
  blankCreateForm(): NewTaskForm {
    return {
      title: '',
      date: this.selectedDateStr,
      startTime: null,
      endTime: null,
      isUrgent: false,
      tags: [],
      reminderOffset: null,
      description: '',
    };
  }

  openCreateForm(prefill?: Partial<NewTaskForm>) {
    this.createForm = { ...this.blankCreateForm(), ...prefill };
    this.createFormTagInput = '';
    this.showCreateForm = true;
  }

  closeCreateForm() {
    this.showCreateForm = false;
  }

  addCreateFormTag() {
    const t = this.createFormTagInput.trim();
    if (!t || this.createForm.tags.includes(t)) { this.createFormTagInput = ''; return; }
    this.createForm.tags = [...this.createForm.tags, t];
    this.createFormTagInput = '';
  }
  removeCreateFormTag(tag: string) {
    this.createForm.tags = this.createForm.tags.filter(x => x !== tag);
  }

  async submitCreateForm() {
    const title = this.createForm.title.trim();
    if (!title || !this.currentWorkspace || !this.currentUser) return;
    const maxOrder = this.tasks.reduce((m, t) => Math.max(m, t.order ?? 0), 0);
    const id = await this.taskService.addTask({
      workspaceId: this.currentWorkspace.id,
      title,
      description: this.createForm.description || undefined,
      date: this.createForm.date,
      startTime: this.createForm.startTime,
      endTime: this.createForm.endTime,
      tags: this.createForm.tags,
      isUrgent: this.createForm.isUrgent,
      createdBy: this.currentUser.id,
      status: 'pending',
      reminderOffset: this.createForm.reminderOffset,
      order: maxOrder + 1,
      categoryId: this.createForm.categoryId,
    } as any);
    this.showCreateForm = false;
    setTimeout(() => { this.selectedTaskId = id; this.inspectorMode = 'edit'; this.showInspector = true; }, 200);
  }

  // ---------- Selected-task tag mutations (inspector edit pane) ----------
  selectedTaskTagInput = '';
  addSelectedTaskTag() {
    if (!this.selectedTask) return;
    const t = this.selectedTaskTagInput.trim();
    if (!t) return;
    const tags = [...(this.selectedTask.tags ?? [])];
    if (tags.includes(t)) { this.selectedTaskTagInput = ''; return; }
    tags.push(t);
    this.selectedTask.tags = tags;
    this.selectedTaskTagInput = '';
    this.saveSelectedTask();
  }
  removeSelectedTaskTag(tag: string) {
    if (!this.selectedTask) return;
    this.selectedTask.tags = (this.selectedTask.tags ?? []).filter(x => x !== tag);
    this.saveSelectedTask();
  }

  // ---------- Lifecycle ----------
  ngOnInit() {
    const savedLayout = localStorage.getItem('pro:layoutMode') as LayoutMode | null;
    if (savedLayout === 'calendar-first' || savedLayout === 'list-first') this.layoutMode = savedLayout;
    const savedGrain = localStorage.getItem('pro:calGrain') as CalGrain | null;
    if (savedGrain === 'month' || savedGrain === 'week') this.calGrain = savedGrain;
    const lw = parseInt(localStorage.getItem('pro:leftWidth') ?? '', 10);
    const rw = parseInt(localStorage.getItem('pro:rightWidth') ?? '', 10);
    if (!Number.isNaN(lw)) this.leftWidth = Math.min(this.LEFT_MAX, Math.max(this.LEFT_MIN, lw));
    if (!Number.isNaN(rw)) this.rightWidth = Math.min(this.RIGHT_MAX, Math.max(this.RIGHT_MIN, rw));

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
      // Filter to workspace members so colors don't drift between workspaces.
      const memberIds = new Set(this.currentWorkspace?.users ?? []);
      const filtered = memberIds.size > 0 ? users.filter(u => memberIds.has(u.id)) : users;
      // Stable ordering by id so colors don't shuffle between renders.
      this.workspaceUsers = [...filtered].sort((a, b) => a.id.localeCompare(b.id));
    });

    this.buildCalendar();
    this.buildWeek();
    this.updateNowLine();
    this.nowTimer = setInterval(() => this.updateNowLine(), 60_000);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.nowTimer) clearInterval(this.nowTimer);
  }

  // ---------- Layout ----------
  setLayout(mode: LayoutMode) {
    if (this.layoutMode === mode) return;
    this.layoutMode = mode;
    localStorage.setItem('pro:layoutMode', mode);
  }

  setGrain(grain: CalGrain) {
    if (this.calGrain === grain) return;
    this.calGrain = grain;
    localStorage.setItem('pro:calGrain', grain);
  }

  toggleInspector() {
    this.showInspector = !this.showInspector;
  }

  startSplitter(side: 'left' | 'right', e: MouseEvent) {
    this.splitter = side;
    this.splitterStartX = e.clientX;
    this.splitterStartWidth = side === 'left' ? this.leftWidth : this.rightWidth;
    e.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onSplitterMove(e: MouseEvent) {
    if (!this.splitter) return;
    const delta = e.clientX - this.splitterStartX;
    if (this.splitter === 'left') {
      this.leftWidth = Math.min(this.LEFT_MAX, Math.max(this.LEFT_MIN, this.splitterStartWidth + delta));
    } else {
      this.rightWidth = Math.min(this.RIGHT_MAX, Math.max(this.RIGHT_MIN, this.splitterStartWidth - delta));
    }
  }

  @HostListener('document:mouseup')
  onSplitterUp() {
    if (this.splitter) {
      localStorage.setItem('pro:leftWidth', String(this.leftWidth));
      localStorage.setItem('pro:rightWidth', String(this.rightWidth));
      this.splitter = null;
    }
  }

  // ---------- Calendar build ----------
  buildCalendar() {
    const monthStart = startOfMonth(this.currentDate);
    const monthEnd = endOfMonth(this.currentDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days: typeof this.calendarDays = [];
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    let d = gridStart;
    while (d <= gridEnd) {
      const dateStr = format(d, 'yyyy-MM-dd');
      const lunar = this.lunarLabelFor(dateStr);
      days.push({
        dateStr,
        dayNum: d.getDate(),
        isCurrentMonth: isSameMonth(d, this.currentDate),
        isToday: dateStr === todayStr,
        tasks: this.tasks.filter(t => t.date === dateStr).sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99')),
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
    const dayNames = ['一', '二', '三', '四', '五', '六', '日'];
    const result: WeekDay[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayTasks = this.tasks.filter(t => t.date === dateStr);
      const allDay = dayTasks.filter(t => !t.startTime);
      const timed = dayTasks.filter(t => t.startTime);
      const timedBlocks = timed.map(t => {
        const [sh, sm] = (t.startTime ?? '0:00').split(':').map(Number);
        const startMin = sh * 60 + sm;
        let endMin = startMin + 30;
        if (t.endTime) {
          const [eh, em] = t.endTime.split(':').map(Number);
          endMin = eh * 60 + em;
          if (endMin <= startMin) endMin = startMin + 30;
        }
        return {
          task: t,
          top: (startMin / 60) * HOUR_PX,
          height: Math.max(24, ((endMin - startMin) / 60) * HOUR_PX),
        };
      });
      const lunar = this.lunarLabelFor(dateStr);
      result.push({
        dateStr,
        dayNum: d.getDate(),
        dayName: dayNames[i],
        isToday: dateStr === todayStr,
        tasks: dayTasks,
        allDay,
        timedBlocks,
        lunarLabel: lunar.label,
        isSolarTerm: lunar.isSolarTerm,
      });
    }
    this.weekDays = result;
    this.currentWeekStr = `${format(start, 'M/d')} – ${format(end, 'M/d')}`;
  }

  updateNowLine() {
    const now = new Date();
    this.nowLineTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX;
  }

  // ---------- Navigation ----------
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
    // Day Pane on the right always reflects the most recently selected date.
    this.inspectorMode = 'day';
    this.selectedTaskId = null;
    this.showInspector = true;
  }

  // ---------- Selection ----------
  selectTask(taskId: string) {
    this.selectedTaskId = taskId;
    this.inspectorMode = 'edit';
    this.showInspector = true;
  }

  backToDayPane() {
    this.inspectorMode = 'day';
    this.selectedTaskId = null;
  }

  selectSmartList(list: SmartList) {
    this.selectedList = list;
    this.selectedTaskId = null;
    this.inspectorMode = 'day';
    // Sync calendar focus so the month/week view scrolls to match the
    // semantic scope of the chosen list (otherwise the user sees, e.g.,
    // "今日" highlighted but the calendar is still parked on a past month).
    if (list === 'today' || list === 'week') {
      this.currentDate = new Date();
      this.selectedDateStr = format(new Date(), 'yyyy-MM-dd');
      this.buildCalendar();
      this.buildWeek();
    }
  }

  selectCategoryList(cat: Category) {
    this.selectedList = { kind: 'category', id: cat.id };
    this.selectedTaskId = null;
    this.inspectorMode = 'day';
  }

  selectUserList(user: User) {
    this.selectedList = { kind: 'user', id: user.id };
    this.selectedTaskId = null;
    this.inspectorMode = 'day';
  }

  isSelectedList(list: SmartList): boolean {
    return this.selectedList === list;
  }

  isSelectedCategory(catId: string): boolean {
    return typeof this.selectedList === 'object' && this.selectedList.kind === 'category' && this.selectedList.id === catId;
  }

  isSelectedUser(userId: string): boolean {
    return typeof this.selectedList === 'object' && this.selectedList.kind === 'user' && this.selectedList.id === userId;
  }

  // ---------- Task mutations ----------
  async toggleCompletion(task: Task) {
    const next = task.status === 'completed' ? 'pending' : 'completed';
    await this.taskService.updateTask(task.id, { status: next });
  }

  async quickAdd() {
    const title = this.quickAddTitle.trim();
    if (!title || !this.currentWorkspace || !this.currentUser) return;
    const targetDate = this.quickAddTargetDate;
    const maxOrder = this.tasks.reduce((m, t) => Math.max(m, t.order ?? 0), 0);
    await this.taskService.addTask({
      workspaceId: this.currentWorkspace.id,
      title,
      date: targetDate,
      startTime: null,
      endTime: null,
      tags: [],
      isUrgent: this.selectedList === 'urgent',
      createdBy: this.currentUser.id,
      status: 'pending',
      reminderOffset: null,
      order: maxOrder + 1,
    } as any);
    this.quickAddTitle = '';
  }

  /** Top-right "+" button — opens inline form pre-filled with selected date. */
  openCreateForSelectedDate() {
    this.openCreateForm({ date: this.selectedDateStr });
  }

  /** Double-click on a calendar day cell. */
  openCreateForDate(dateStr: string) {
    this.selectedDateStr = dateStr;
    this.openCreateForm({ date: dateStr });
  }

  /** Double-click on an hour cell in week view. */
  openCreateForDateTime(dateStr: string, hour: number) {
    this.selectedDateStr = dateStr;
    const hh = hour.toString().padStart(2, '0');
    this.openCreateForm({ date: dateStr, startTime: `${hh}:00` });
  }

  /**
   * Legacy createInline retained as a thin wrapper for any old call sites.
   */
  private async createInline(dateStr: string | null, startTime: string | null) {
    if (!this.currentWorkspace || !this.currentUser) return;
    const title = window.prompt(`新增到 ${dateStr ?? '無日期'}${startTime ? ' ' + startTime : ''}`, '');
    if (!title || !title.trim()) return;
    const maxOrder = this.tasks.reduce((m, t) => Math.max(m, t.order ?? 0), 0);
    const id = await this.taskService.addTask({
      workspaceId: this.currentWorkspace.id,
      title: title.trim(),
      date: dateStr,
      startTime,
      endTime: null,
      tags: [],
      isUrgent: false,
      createdBy: this.currentUser.id,
      status: 'pending',
      reminderOffset: null,
      order: maxOrder + 1,
    } as any);
    // Select the newly created task once it propagates via the live query.
    setTimeout(() => { this.selectedTaskId = id; this.inspectorMode = 'edit'; this.showInspector = true; }, 200);
  }

  deleteTask(task: Task) {
    this.confirmDialog = {
      title: '刪除代辦',
      message: `確定要刪除「${task.title}」嗎？此操作無法復原。`,
      action: async () => {
        await this.taskService.deleteTask(task.id);
        if (this.selectedTaskId === task.id) {
          this.selectedTaskId = null;
          this.inspectorMode = 'day';
        }
        this.confirmDialog = null;
      },
    };
  }

  cancelConfirm() {
    this.confirmDialog = null;
  }

  // ---------- Category mutations (sidebar inline create) ----------
  openCategoryCreate() {
    this.showCategoryCreate = true;
    this.newCategoryName = '';
    this.newCategoryIcon = 'category';
  }

  closeCategoryCreate() {
    this.showCategoryCreate = false;
  }

  async submitCategoryCreate() {
    const name = this.newCategoryName.trim();
    if (!name || !this.currentWorkspace || !this.currentUser) return;
    const maxOrder = this.categories.reduce((m, c) => Math.max(m, c.order ?? 0), -1);
    await this.categoryService.addCategory({
      workspaceId: this.currentWorkspace.id,
      name,
      icon: this.newCategoryIcon,
      order: maxOrder + 1,
      createdBy: this.currentUser.id,
      createdAt: Date.now(),
    });
    this.showCategoryCreate = false;
    this.newCategoryName = '';
  }

  async saveSelectedTask() {
    if (!this.selectedTask) return;
    const t = this.selectedTask;
    await this.taskService.updateTask(t.id, {
      title: t.title,
      description: t.description,
      date: t.date,
      startTime: t.startTime,
      endTime: t.endTime,
      isUrgent: t.isUrgent,
      tags: t.tags,
      categoryId: t.categoryId,
      reminderOffset: t.reminderOffset,
    });
  }

  /**
   * Set or clear category. Passing null clears it (we route through
   * TaskService.updateTask which translates null → deleteField()).
   */
  async setSelectedTaskCategory(categoryId: string | null) {
    if (!this.selectedTask) return;
    // Mutate local copy so UI updates immediately; Firestore round-trip will
    // overwrite with the same value shortly.
    if (categoryId === null) {
      delete this.selectedTask.categoryId;
    } else {
      this.selectedTask.categoryId = categoryId;
    }
    await this.taskService.updateTask(this.selectedTask.id, { categoryId: categoryId as any });
  }

  // ---------- Drag & drop ----------
  async dropOnDate(event: CdkDragDrop<any>, dateStr: string | null) {
    const task: Task = event.item.data;
    if (!task) return;
    if (task.date !== dateStr) {
      await this.taskService.updateTask(task.id, { date: dateStr });
    }
  }

  /**
   * Reorder within the list pane — only reorders the visual array shown.
   * To actually persist order we'd need to write back into Firestore which
   * we avoid here to keep the drop a no-op for unrelated containers.
   */
  reorderInList(event: CdkDragDrop<Task[]>) {
    if (event.previousContainer !== event.container) return; // only same-list reorder
    if (event.previousIndex === event.currentIndex) return;
    // Persist new order index by rewriting order field on swapped items.
    const items = [...this.listPaneTasks];
    moveItemInArray(items, event.previousIndex, event.currentIndex);
    items.forEach((t, i) => {
      this.taskService.updateTask(t.id, { order: i + 1 } as any);
    });
  }

  // ---------- Helpers ----------
  isEmoji(str: string): boolean {
    if (!str) return false;
    return /\p{Extended_Pictographic}/u.test(str);
  }

  categoryFor(catId?: string): Category | undefined {
    return this.categories.find(c => c.id === catId);
  }

  backToClassic() {
    this.router.navigate(['/main']);
  }
}
