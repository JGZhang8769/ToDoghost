import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Subject, takeUntil } from 'rxjs';
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns';

import { TaskService, Task } from '../../core/services/task.service';
import { CategoryService, Category } from '../../core/services/category.service';
import { WorkspaceService, Workspace } from '../../core/services/workspace.service';
import { UserService, User } from '../../core/services/user.service';
import { SvgIconComponent } from '../../core/svg-icon/svg-icon.component';

type LayoutMode = 'calendar-first' | 'list-first';
type CalGrain = 'month' | 'week';
type SmartList = 'inbox' | 'today' | 'week' | 'urgent' | 'unscheduled' | 'completed';
type SelectedList = SmartList | { kind: 'category'; id: string };

interface WeekDay {
  dateStr: string;
  dayNum: number;
  dayName: string;
  isToday: boolean;
  tasks: Task[];
  allDay: Task[];
  timedBlocks: { task: Task; top: number; height: number }[];
}

const HOUR_PX = 48; // visible height per hour in week timeline

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

  // View state
  selectedList: SelectedList = 'today';
  currentDate = new Date();
  selectedDateStr = format(new Date(), 'yyyy-MM-dd');

  // Selection & inspector
  selectedTaskId: string | null = null;
  get selectedTask(): Task | null {
    return this.selectedTaskId ? this.tasks.find(t => t.id === this.selectedTaskId) ?? null : null;
  }

  // Quick add
  quickAddTitle = '';
  searchQuery = '';

  // Calendar data
  calendarDays: { dateStr: string; dayNum: number; isCurrentMonth: boolean; isToday: boolean; tasks: Task[] }[] = [];
  weekDays: WeekDay[] = [];
  currentMonthStr = '';
  currentWeekStr = '';
  dayHours = Array.from({ length: 24 }, (_, i) => i);
  nowLineTop = 0;

  private nowTimer: any;

  // Form modal — Pro reuses a thin wrapper around create
  showQuickForm = false;
  quickFormDate: string | null = null;
  quickFormStartTime: string | null = null;

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

    if (this.selectedList === 'today') {
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
    if (this.selectedList === 'today') return '今日';
    if (this.selectedList === 'week') return '本週';
    if (this.selectedList === 'urgent') return '緊急';
    if (this.selectedList === 'unscheduled') return '未排程';
    if (this.selectedList === 'completed') return '已完成';
    if (this.selectedList === 'inbox') return '收件匣';
    if (typeof this.selectedList === 'object' && this.selectedList.kind === 'category') {
      return this.categories.find(c => c.id === (this.selectedList as any).id)?.name ?? '分類';
    }
    return '清單';
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
  }

  categoryCount(catId: string): number {
    return this.tasks.filter(t => t.categoryId === catId && t.status !== 'completed').length;
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
      days.push({
        dateStr,
        dayNum: d.getDate(),
        isCurrentMonth: isSameMonth(d, this.currentDate),
        isToday: dateStr === todayStr,
        tasks: this.tasks.filter(t => t.date === dateStr).sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99')),
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
      result.push({
        dateStr,
        dayNum: d.getDate(),
        dayName: dayNames[i],
        isToday: dateStr === todayStr,
        tasks: dayTasks,
        allDay,
        timedBlocks,
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
  }

  // ---------- Selection ----------
  selectTask(taskId: string) {
    this.selectedTaskId = taskId;
    this.showInspector = true;
  }

  selectSmartList(list: SmartList) {
    this.selectedList = list;
    this.selectedTaskId = null;
  }

  selectCategoryList(cat: Category) {
    this.selectedList = { kind: 'category', id: cat.id };
    this.selectedTaskId = null;
  }

  isSelectedList(list: SmartList): boolean {
    return this.selectedList === list;
  }

  isSelectedCategory(catId: string): boolean {
    return typeof this.selectedList === 'object' && this.selectedList.kind === 'category' && this.selectedList.id === catId;
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

  /** Top-right "+" button — opens form pre-filled with selected date. */
  async openCreateForSelectedDate() {
    await this.createInline(this.selectedDateStr, null);
  }

  /** Double-click on a calendar day cell. */
  async openCreateForDate(dateStr: string) {
    this.selectedDateStr = dateStr;
    await this.createInline(dateStr, null);
  }

  /** Double-click on an hour cell in week view. */
  async openCreateForDateTime(dateStr: string, hour: number) {
    this.selectedDateStr = dateStr;
    const hh = hour.toString().padStart(2, '0');
    await this.createInline(dateStr, `${hh}:00`);
  }

  /**
   * Inline create: prompt for title, then add task with given date / startTime.
   * Keeps Pro mode lightweight — the heavy modal stays in classic /main.
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
    setTimeout(() => { this.selectedTaskId = id; this.showInspector = true; }, 200);
  }

  async deleteTask(task: Task) {
    if (!confirm(`刪除「${task.title}」？`)) return;
    await this.taskService.deleteTask(task.id);
    if (this.selectedTaskId === task.id) this.selectedTaskId = null;
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
