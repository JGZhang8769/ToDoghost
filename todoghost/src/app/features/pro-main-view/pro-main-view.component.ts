import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Subject, takeUntil } from 'rxjs';
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek, subMonths } from 'date-fns';

import { TaskService, Task } from '../../core/services/task.service';
import { CategoryService, Category } from '../../core/services/category.service';
import { WorkspaceService, Workspace } from '../../core/services/workspace.service';
import { UserService, User } from '../../core/services/user.service';
import { SvgIconComponent } from '../../core/svg-icon/svg-icon.component';

type LayoutMode = 'calendar-first' | 'list-first';
type MainView = 'month' | 'week' | 'day' | 'inbox';
type SmartList = 'inbox' | 'today' | 'week' | 'urgent' | 'unscheduled' | 'completed';

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

  // Layout
  layoutMode: LayoutMode = 'calendar-first';
  leftWidth = 240;          // px
  rightWidth = 380;         // px
  readonly LEFT_MIN = 200;
  readonly LEFT_MAX = 360;
  readonly RIGHT_MIN = 320;
  readonly RIGHT_MAX = 520;

  // Drag splitter state
  splitter: null | 'left' | 'right' = null;
  splitterStartX = 0;
  splitterStartWidth = 0;

  // Data
  currentWorkspace: Workspace | null = null;
  currentUser: User | null = null;
  tasks: Task[] = [];
  categories: Category[] = [];

  // View state
  mainView: MainView = 'month';
  selectedList: SmartList | { kind: 'category'; id: string } = 'today';
  currentDate = new Date();
  selectedDateStr = format(new Date(), 'yyyy-MM-dd');

  // Selection + inspector
  selectedTaskId: string | null = null;
  get selectedTask(): Task | null {
    if (!this.selectedTaskId) return null;
    return this.tasks.find(t => t.id === this.selectedTaskId) ?? null;
  }

  // Quick add
  quickAddTitle = '';
  showInspector = true;

  // Search
  searchQuery = '';

  // Calendar grid
  calendarDays: { dateStr: string; dayNum: number; isCurrentMonth: boolean; isToday: boolean; tasks: Task[] }[] = [];
  currentMonthStr = '';

  // Derived: tasks shown in middle list pane based on selectedList
  get listPaneTasks(): Task[] {
    let filtered: Task[];
    const today = format(new Date(), 'yyyy-MM-dd');
    if (this.selectedList === 'today') {
      filtered = this.tasks.filter(t => t.date === today && t.status !== 'completed');
    } else if (this.selectedList === 'week') {
      const start = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const end = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      filtered = this.tasks.filter(t => t.date && t.date >= start && t.date <= end && t.status !== 'completed');
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
      // urgent first, then by date asc, then by order
      if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (!a.date && b.date) return 1;
      if (a.date && !b.date) return -1;
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
      return this.categories.find(c => c.id === this.selectedList && (this.selectedList as any).id)?.name
          ?? this.categories.find(c => typeof this.selectedList === 'object' && c.id === this.selectedList.id)?.name
          ?? '分類';
    }
    return '清單';
  }

  smartListCount(list: SmartList): number {
    const today = format(new Date(), 'yyyy-MM-dd');
    if (list === 'today') return this.tasks.filter(t => t.date === today && t.status !== 'completed').length;
    if (list === 'urgent') return this.tasks.filter(t => t.isUrgent && t.status !== 'completed').length;
    if (list === 'unscheduled') return this.tasks.filter(t => !t.date && t.status !== 'completed').length;
    if (list === 'inbox') return this.tasks.filter(t => t.status !== 'completed').length;
    if (list === 'week') {
      const start = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const end = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      return this.tasks.filter(t => t.date && t.date >= start && t.date <= end && t.status !== 'completed').length;
    }
    if (list === 'completed') return this.tasks.filter(t => t.status === 'completed').length;
    return 0;
  }

  categoryCount(catId: string): number {
    return this.tasks.filter(t => t.categoryId === catId && t.status !== 'completed').length;
  }

  ngOnInit() {
    // Restore layout pref
    const savedLayout = localStorage.getItem('pro:layoutMode') as LayoutMode | null;
    if (savedLayout === 'calendar-first' || savedLayout === 'list-first') this.layoutMode = savedLayout;
    const lw = parseInt(localStorage.getItem('pro:leftWidth') ?? '', 10);
    const rw = parseInt(localStorage.getItem('pro:rightWidth') ?? '', 10);
    if (!Number.isNaN(lw)) this.leftWidth = Math.min(this.LEFT_MAX, Math.max(this.LEFT_MIN, lw));
    if (!Number.isNaN(rw)) this.rightWidth = Math.min(this.RIGHT_MAX, Math.max(this.RIGHT_MIN, rw));

    this.workspaceService.currentWorkspace$.pipe(takeUntil(this.destroy$)).subscribe(ws => {
      if (!ws) {
        this.router.navigate(['/workspaces']);
        return;
      }
      this.currentWorkspace = ws;
      this.taskService.getTasks(ws.id).pipe(takeUntil(this.destroy$)).subscribe(tasks => {
        this.tasks = tasks;
        this.buildCalendar();
      });
      this.categoryService.getCategories(ws.id).pipe(takeUntil(this.destroy$)).subscribe(cats => {
        this.categories = cats.sort((a, b) => a.order - b.order);
      });
    });

    this.userService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(u => {
      this.currentUser = u;
    });

    this.buildCalendar();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // === Layout ===
  toggleLayout() {
    this.layoutMode = this.layoutMode === 'calendar-first' ? 'list-first' : 'calendar-first';
    localStorage.setItem('pro:layoutMode', this.layoutMode);
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

  toggleInspector() {
    this.showInspector = !this.showInspector;
  }

  // === Calendar ===
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

  prevMonth() { this.currentDate = subMonths(this.currentDate, 1); this.buildCalendar(); }
  nextMonth() { this.currentDate = addMonths(this.currentDate, 1); this.buildCalendar(); }
  goToToday() { this.currentDate = new Date(); this.selectedDateStr = format(new Date(), 'yyyy-MM-dd'); this.buildCalendar(); }

  selectDate(dateStr: string) {
    this.selectedDateStr = dateStr;
  }

  // === Selection ===
  selectTask(taskId: string) {
    this.selectedTaskId = taskId;
    this.showInspector = true;
  }

  // === Task mutations ===
  async toggleCompletion(task: Task) {
    const next = task.status === 'completed' ? 'pending' : 'completed';
    await this.taskService.updateTask(task.id, { status: next });
  }

  async toggleUrgent(task: Task) {
    await this.taskService.updateTask(task.id, { isUrgent: !task.isUrgent });
  }

  async quickAdd() {
    const title = this.quickAddTitle.trim();
    if (!title || !this.currentWorkspace || !this.currentUser) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const date = this.selectedList === 'today' ? today
               : this.selectedList === 'unscheduled' ? null
               : today;
    const maxOrder = this.tasks.reduce((m, t) => Math.max(m, t.order ?? 0), 0);
    await this.taskService.addTask({
      workspaceId: this.currentWorkspace.id,
      title,
      date,
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

  // === Drag & drop: drop a task onto a calendar cell or list pane row ===
  async dropOnDate(event: CdkDragDrop<any>, dateStr: string | null) {
    const task: Task = event.item.data;
    if (!task) return;
    if (task.date !== dateStr) {
      await this.taskService.updateTask(task.id, { date: dateStr });
    }
  }

  // === Helpers ===
  isEmoji(str: string): boolean {
    if (!str) return false;
    // Quick heuristic: emoji code points are mostly > 0x1F000 or in the misc symbol range.
    return /\p{Extended_Pictographic}/u.test(str);
  }

  categoryFor(catId?: string): Category | undefined {
    return this.categories.find(c => c.id === catId);
  }

  backToClassic() {
    this.router.navigate(['/main']);
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
}
