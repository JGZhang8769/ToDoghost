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
type SelectedList = SmartList | { kind: 'category'; id: string } | { kind: 'category-none' } | { kind: 'user'; id: string };
type InspectorMode = 'day' | 'edit' | 'create';

interface CalendarDay {
  dateStr: string;
  dayNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  tasks: Task[];
  lunarLabel: string;        // e.g. "初一", "立春"
  isSolarTerm: boolean;      // true if lunarLabel is a 節氣
}

interface TimedBlock {
  task: Task;
  top: number;
  height: number;
  /** column index (0-based) within the overlap group */
  col: number;
  /** total columns in this overlap group — determines width */
  totalCols: number;
}

interface WeekDay {
  dateStr: string;
  dayNum: number;
  dayName: string;
  isToday: boolean;
  tasks: Task[];
  allDay: Task[];
  timedBlocks: TimedBlock[];
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
  /** 'right' = sidebar | center | inspector (default).
   *  'middle' = sidebar | inspector | center — swap the last two columns so
   *  Inspector sits next to the sidebar and the calendar gets the right edge. */
  inspectorPosition: 'right' | 'middle' = 'right';
  /** When true, hide the sidebar and replace it with a 40px rail of icons
   *  the user can click to expand. */
  sidebarCollapsed = false;

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
    } else if (typeof this.selectedList === 'object' && this.selectedList.kind === 'category-none') {
      filtered = this.tasks.filter(t => !t.categoryId && t.status !== 'completed');
    } else if (typeof this.selectedList === 'object' && this.selectedList.kind === 'user') {
      const userId = this.selectedList.id;
      filtered = this.tasks.filter(t => t.createdBy === userId && t.status !== 'completed');
    } else {
      filtered = this.tasks;
    }

    // Search filter is shared with calendar/week via passesGlobalFilter().
    // We don't call passesGlobalFilter() directly here because the smart-list
    // branches above already apply the category/user narrowing — instead just
    // re-use the search portion to keep the surfaces in sync.
    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(t => {
        const hay =
          t.title.toLowerCase() + ' ' +
          (t.description ?? '').toLowerCase() + ' ' +
          (t.tags ?? []).join(' ').toLowerCase();
        return hay.includes(q);
      });
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
    if (typeof this.selectedList === 'object' && this.selectedList.kind === 'category-none') {
      return '無分類';
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

  /**
   * Global filter derived from the active sidebar selection (category or user).
   * Calendar / week views and the day-pane all apply this so the visualisation
   * stays in sync with the sidebar — selecting "生活" means EVERYTHING on
   * screen narrows to 生活, not just the bottom list.
   *
   * Smart lists like 今日/本週/緊急 are not narrowed here; they are time- or
   * priority-defined and would over-constrain the calendar (e.g. selecting
   * "今日" shouldn't hide tomorrow's tasks from the month view).
   */
  passesGlobalFilter(task: Task): boolean {
    const sel = this.selectedList as any;
    if (typeof sel === 'object' && sel !== null) {
      if (sel.kind === 'category' && task.categoryId !== sel.id) return false;
      if (sel.kind === 'category-none' && task.categoryId) return false;
      if (sel.kind === 'user' && task.createdBy !== sel.id) return false;
    }
    // Search applies to every surface (calendar, week, day pane, list pane)
    // so the user sees the same filtered set everywhere.
    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      const hay =
        task.title.toLowerCase() + ' ' +
        (task.description ?? '').toLowerCase() + ' ' +
        (task.tags ?? []).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  /** Called from the search input — rebuild calendar/week as the user types. */
  onSearchChange() {
    this.buildCalendar();
    this.buildWeek();
  }

  /** All tasks (including completed) for a given dateStr, sorted by startTime then order. */
  tasksForDate(dateStr: string): Task[] {
    return this.tasks
      .filter(t => t.date === dateStr && this.passesGlobalFilter(t))
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
  /**
   * The chinese-lunar-calendar library ships simplified Chinese strings
   * (e.g. 立春, 芒种, 处暑). Map the 24 solar terms to their traditional
   * forms used in Taiwan/HK so the UI is consistent with the rest of
   * the app's zh-TW copy.
   */
  private static readonly SOLAR_TERM_TW: Record<string, string> = {
    '立春': '立春', '雨水': '雨水', '惊蛰': '驚蟄', '春分': '春分',
    '清明': '清明', '谷雨': '穀雨', '立夏': '立夏', '小满': '小滿',
    '芒种': '芒種', '夏至': '夏至', '小暑': '小暑', '大暑': '大暑',
    '立秋': '立秋', '处暑': '處暑', '白露': '白露', '秋分': '秋分',
    '寒露': '寒露', '霜降': '霜降', '立冬': '立冬', '小雪': '小雪',
    '大雪': '大雪', '冬至': '冬至', '小寒': '小寒', '大寒': '大寒',
  };

  lunarLabelFor(dateStr: string): { label: string; isSolarTerm: boolean } {
    const [y, m, d] = dateStr.split('-').map(Number);
    try {
      const lunar = getLunar(y, m, d);
      if (lunar.solarTerm) {
        const tw = ProMainViewComponent.SOLAR_TERM_TW[lunar.solarTerm] ?? lunar.solarTerm;
        return { label: tw, isSolarTerm: true };
      }
      if (lunar.lunarDate === 1) {
        // '腊' (simplified) → '臘' (traditional)
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
    // Show the form inline in the inspector pane (same surface as edit),
    // not as a separate right-side slide-in panel.
    this.selectedTaskId = null;
    this.inspectorMode = 'create';
    this.showInspector = true;
    this.showCreateForm = false; // keep legacy panel hidden
  }

  closeCreateForm() {
    this.showCreateForm = false;
    this.inspectorMode = 'day';
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
    // list-first layout was removed from the UI (caused several layout-sync
    // bugs and didn't differ enough from calendar-first to be worth keeping).
    // Force calendar-first regardless of any previously saved preference.
    this.layoutMode = 'calendar-first';
    const savedGrain = localStorage.getItem('pro:calGrain') as CalGrain | null;
    if (savedGrain === 'month' || savedGrain === 'week') this.calGrain = savedGrain;
    const lw = parseInt(localStorage.getItem('pro:leftWidth') ?? '', 10);
    const rw = parseInt(localStorage.getItem('pro:rightWidth') ?? '', 10);
    if (!Number.isNaN(lw)) this.leftWidth = Math.min(this.LEFT_MAX, Math.max(this.LEFT_MIN, lw));
    if (!Number.isNaN(rw)) this.rightWidth = Math.min(this.RIGHT_MAX, Math.max(this.RIGHT_MIN, rw));
    const savedPos = localStorage.getItem('pro:inspectorPosition');
    if (savedPos === 'right' || savedPos === 'middle') this.inspectorPosition = savedPos;
    this.sidebarCollapsed = localStorage.getItem('pro:sidebarCollapsed') === '1';

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

  setInspectorPosition(pos: 'right' | 'middle') {
    if (this.inspectorPosition === pos) return;
    this.inspectorPosition = pos;
    localStorage.setItem('pro:inspectorPosition', pos);
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    localStorage.setItem('pro:sidebarCollapsed', this.sidebarCollapsed ? '1' : '0');
  }

  /**
   * Compute the grid-template-columns string.
   * Track order in the grid follows DOM declaration order; what each track
   * represents is controlled by the [style.order] applied to each column.
   *
   * Visual layouts:
   *   inspectorPosition === 'right'  → [sidebar | center | inspector]
   *   inspectorPosition === 'middle' → [sidebar | inspector | center]
   *
   * IMPORTANT: when the user swaps to 'middle', the *widths* swap too —
   * the inspector keeps its narrow column, the center keeps its wide one.
   * That means track 3 (after sidebar + splitter) is always the *narrower*
   * inspector column when in middle layout, and track 5 is the wider
   * center column. CSS order on each child does the visual swap.
   */
  get gridTemplateColumns(): string {
    if (this.sidebarCollapsed) {
      // No sidebar / left splitter at all; floating expand button replaces it.
      if (!this.showInspector) return '1fr';
      return this.inspectorPosition === 'middle'
        ? `${this.rightWidth}px 6px 1fr`
        : `1fr 6px ${this.rightWidth}px`;
    }
    const sb = `${this.leftWidth}px`;
    if (!this.showInspector) return `${sb} 6px 1fr`;
    return this.inspectorPosition === 'middle'
      ? `${sb} 6px ${this.rightWidth}px 6px 1fr`
      : `${sb} 6px 1fr 6px ${this.rightWidth}px`;
  }

  /** Center column order: pinned to its track regardless of inspectorPosition. */
  get centerOrder(): number { return this.inspectorPosition === 'middle' ? 4 : 2; }
  /** Inspector column order: sits where the other one doesn't. */
  get inspectorOrder(): number { return this.inspectorPosition === 'middle' ? 2 : 4; }
  /** Splitter between center and inspector — sits next to whichever is in middle slot. */
  get splitterRightOrder(): number { return 3; }

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
        tasks: this.tasks.filter(t => t.date === dateStr && this.passesGlobalFilter(t)).sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99')),
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
      const dayTasks = this.tasks.filter(t => t.date === dateStr && this.passesGlobalFilter(t));
      const allDay = dayTasks.filter(t => !t.startTime);
      const timed = dayTasks.filter(t => t.startTime);
      const timedBlocks = this.layoutTimedBlocks(timed);
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

  /**
   * Lay out overlapping timed events side-by-side, like Google / iOS Calendar.
   *
   * Algorithm (classic interval-graph column packing):
   *   1. Convert each task to a [startMin, endMin] block with at least
   *      15 minutes of height so user can grab it.
   *   2. Sort by startMin asc, then by endMin desc (longer events on the
   *      left for stable order).
   *   3. Walk events in order. For each event, assign it to the lowest
   *      column index whose previous occupant ended ≤ this event's start.
   *      If none, open a new column.
   *   4. Group events that transitively overlap (i.e. share a column
   *      neighbor). For each group, set every member's `totalCols` to the
   *      group's max column count, so widths within a group are consistent
   *      and aligned.
   *
   * Output is positioned with col / totalCols which the template multiplies
   * into left / width percentages, so a 3-way overlap shows three equal
   * columns spanning the day.
   */
  private layoutTimedBlocks(tasks: Task[]): TimedBlock[] {
    if (tasks.length === 0) return [];

    interface Block {
      task: Task;
      startMin: number;
      endMin: number;
      col: number;
      groupId: number;
    }

    const blocks: Block[] = tasks.map(t => {
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

    blocks.sort((a, b) => {
      if (a.startMin !== b.startMin) return a.startMin - b.startMin;
      return b.endMin - a.endMin;
    });

    // Pack into columns. `columnEnd[i]` is the end time of whatever sits at column i.
    const columnEnd: number[] = [];
    for (const b of blocks) {
      let placed = false;
      for (let i = 0; i < columnEnd.length; i++) {
        if (columnEnd[i] <= b.startMin) {
          b.col = i;
          columnEnd[i] = b.endMin;
          placed = true;
          break;
        }
      }
      if (!placed) {
        b.col = columnEnd.length;
        columnEnd.push(b.endMin);
      }
    }

    // Compute connected overlap groups so adjacent events share a width.
    // Two events are in the same group iff there exists a chain
    // a → b → c where each consecutive pair overlaps.
    let nextGroupId = 0;
    const active: Block[] = []; // blocks whose endMin > current cursor
    for (const b of blocks) {
      // Drop blocks that no longer overlap with the cursor.
      for (let i = active.length - 1; i >= 0; i--) {
        if (active[i].endMin <= b.startMin) active.splice(i, 1);
      }
      if (active.length === 0) {
        b.groupId = nextGroupId++;
      } else {
        // Inherit the group of any active neighbor (they're already in
        // the same group by transitivity).
        b.groupId = active[0].groupId;
      }
      active.push(b);
    }

    // For each group, find max column count = total tracks the group needs.
    const groupTotal = new Map<number, number>();
    for (const b of blocks) {
      groupTotal.set(b.groupId, Math.max(groupTotal.get(b.groupId) ?? 0, b.col + 1));
    }

    return blocks.map(b => ({
      task: b.task,
      top: (b.startMin / 60) * HOUR_PX,
      height: Math.max(24, ((b.endMin - b.startMin) / 60) * HOUR_PX),
      col: b.col,
      totalCols: groupTotal.get(b.groupId) ?? 1,
    }));
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
    }
    // Always rebuild calendar/week because passesGlobalFilter() returns to
    // pass-through when a smart list is active, broadening what the views show.
    this.buildCalendar();
    this.buildWeek();
  }

  selectCategoryList(cat: Category) {
    this.selectedList = { kind: 'category', id: cat.id };
    this.selectedTaskId = null;
    this.inspectorMode = 'day';
    // Calendar / week views narrow to this category's tasks.
    this.buildCalendar();
    this.buildWeek();
  }

  selectNoCategoryList() {
    this.selectedList = { kind: 'category-none' };
    this.selectedTaskId = null;
    this.inspectorMode = 'day';
  }

  selectUserList(user: User) {
    this.selectedList = { kind: 'user', id: user.id };
    this.selectedTaskId = null;
    this.inspectorMode = 'day';
    this.buildCalendar();
    this.buildWeek();
  }

  isSelectedList(list: SmartList): boolean {
    return this.selectedList === list;
  }

  isSelectedCategory(catId: string): boolean {
    return typeof this.selectedList === 'object' && this.selectedList.kind === 'category' && this.selectedList.id === catId;
  }

  isSelectedNoCategory(): boolean {
    return typeof this.selectedList === 'object' && this.selectedList.kind === 'category-none';
  }

  noCategoryCount(): number {
    return this.tasks.filter(t => !t.categoryId && t.status !== 'completed').length;
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
  // Whether the user is currently dragging a task somewhere in Pro mode.
  // Used to highlight valid drop targets (calendar cells, unscheduled zone)
  // so users have a clear visual hint that they can reschedule by dragging.
  isDraggingTask = false;
  // ID of the task being dragged — used to fully collapse its source row so
  // sibling rows don't get pushed out of place by CDK's stand-in placeholder.
  draggingTaskId: string | null = null;
  // dateStr that just received a drop — used to pulse the cell as success feedback.
  recentlyDroppedDate: string | null = null;
  private pulseTimer: any;

  onTaskDragStarted(task?: Task) {
    this.isDraggingTask = true;
    this.draggingTaskId = task?.id ?? null;
  }

  onTaskDragEnded() {
    // CDK fires dragEnded after drop, so leave the flag for one tick to
    // let the drop handler highlight first, then clear it.
    setTimeout(() => {
      this.isDraggingTask = false;
      this.draggingTaskId = null;
    }, 50);
  }

  /**
   * Patch the in-memory tasks array immediately so the UI updates the moment
   * the drop happens, without waiting for the Firestore round-trip. The
   * Firestore subscription will overwrite this with the canonical version
   * a few hundred ms later — usually identical.
   *
   * Without this, CDK keeps the dragged element in its source DOM position
   * and the live query takes ~200ms to refresh, so users see the item
   * "stuck" at the bottom of the unscheduled list or hour column briefly.
   */
  private patchLocalTask(taskId: string, patch: Partial<Task>) {
    this.tasks = this.tasks.map(t => (t.id === taskId ? { ...t, ...patch } : t));
    this.buildCalendar();
    this.buildWeek();
  }

  async dropOnDate(event: CdkDragDrop<any>, dateStr: string | null) {
    const task: Task = event.item.data;
    if (!task) return;
    if (task.date !== dateStr) {
      this.patchLocalTask(task.id, { date: dateStr });
      await this.taskService.updateTask(task.id, { date: dateStr });
      this.recentlyDroppedDate = dateStr;
      if (this.pulseTimer) clearTimeout(this.pulseTimer);
      this.pulseTimer = setTimeout(() => { this.recentlyDroppedDate = null; }, 600);
    }
  }

  /**
   * Drop onto the all-day row of a given date in week view.
   * Strips startTime/endTime so the task becomes an all-day item, but keeps
   * (or sets) the date so it lives on that specific day.
   */
  async dropOnAllDay(event: CdkDragDrop<any>, dateStr: string) {
    const task: Task = event.item.data;
    if (!task) return;
    const patch: Partial<Task> = {
      date: dateStr,
      startTime: null,
      endTime: null,
      reminderOffset: null, // reminder anchored to startTime — strip when becoming all-day
    };
    this.patchLocalTask(task.id, patch);
    await this.taskService.updateTask(task.id, patch);
    this.recentlyDroppedDate = dateStr;
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    this.pulseTimer = setTimeout(() => { this.recentlyDroppedDate = null; }, 600);
  }

  /**
   * Drop inside a week-view day column's hour grid. Reads the drop's Y
   * coordinate relative to the column to figure out which 30-minute slot
   * the user aimed for, then shifts the task to that day + start time while
   * preserving the original event duration.
   */
  async dropOnWeekColumn(event: CdkDragDrop<any>, dateStr: string) {
    const task: Task = event.item.data;
    if (!task) return;

    // Resolve drop Y relative to the column's top.
    const colEl = event.container.element.nativeElement as HTMLElement;
    const rect = colEl.getBoundingClientRect();
    const point = (event as any).dropPoint ?? { x: 0, y: rect.top };
    const offsetY = Math.max(0, (point.y as number) - rect.top + colEl.scrollTop);
    const totalMinutes = (offsetY / HOUR_PX) * 60;
    // Snap to 30-minute increments — finer than that and the user fights the grid.
    const snappedMinutes = Math.round(totalMinutes / 30) * 30;
    const clamped = Math.min(23 * 60 + 30, Math.max(0, snappedMinutes));
    const startH = Math.floor(clamped / 60);
    const startM = clamped % 60;
    const startTime = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;

    // Preserve duration if the original event had one; otherwise default to 1 hour.
    let endTime: string | null = null;
    if (task.startTime && task.endTime) {
      const [oh, om] = task.startTime.split(':').map(Number);
      const [eh, em] = task.endTime.split(':').map(Number);
      const durMin = Math.max(15, (eh * 60 + em) - (oh * 60 + om));
      const endMin = Math.min(24 * 60, clamped + durMin);
      const endH = Math.floor(endMin / 60);
      const endM = endMin % 60;
      endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    }

    const patch: Partial<Task> = { date: dateStr, startTime, endTime };
    this.patchLocalTask(task.id, patch);
    await this.taskService.updateTask(task.id, patch);

    this.recentlyDroppedDate = dateStr;
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    this.pulseTimer = setTimeout(() => { this.recentlyDroppedDate = null; }, 600);
  }

  /**
   * Drop on the sidebar "未排程" smart-list — unschedules the task.
   */
  async dropToUnscheduled(event: CdkDragDrop<any>) {
    const task: Task = event.item.data;
    if (!task || task.date === null) return;
    this.patchLocalTask(task.id, { date: null });
    await this.taskService.updateTask(task.id, { date: null });
  }

  /**
   * Reorder within the list pane — only reorders the visual array shown.
   * Cross-container drops fall through to the matching cdkDropListDropped
   * handler on the target container (e.g. calendar cell, unscheduled zone).
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
