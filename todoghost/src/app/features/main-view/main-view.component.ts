import { Component, inject, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { WorkspaceService, Workspace } from '../../core/services/workspace.service';
import { TaskService, Task } from '../../core/services/task.service';
import { CategoryService, Category } from '../../core/services/category.service';
import { UserService, User } from '../../core/services/user.service';
import { SvgIconComponent } from '../../core/svg-icon/svg-icon.component';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { addDays, format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';

@Component({
  selector: 'app-main-view',
  standalone: true,
  imports: [CommonModule, SvgIconComponent, DragDropModule, FormsModule],
  templateUrl: './main-view.component.html',
  styles: [`
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `]
})
export class MainViewComponent implements OnInit, OnDestroy {

  @HostListener('document:click')
  closeContextMenu() {
      this.contextMenuState.show = false;
  }

  private workspaceService = inject(WorkspaceService);
  private taskService = inject(TaskService);
  private categoryService = inject(CategoryService);
  private userService = inject(UserService);
  private router = inject(Router);

  destroy$ = new Subject<void>();

  currentWorkspace: Workspace | null = null;
  currentUser: User | null = null;

  viewMode: 'month' | 'week' | 'day' | 'monthApple' = 'month';
  appleViewStyle: 'compact' | 'stack' | 'detailed' | 'list' = 'compact';
  drawerOpen = false;

  featureTabs: ('month' | 'week' | 'day' | 'monthApple')[] = ['month', 'week', 'day'];
  tasks: Task[] = [];
  unassignedTasks: Task[] = [];

  currentDate = new Date();
  selectedDateStr = format(new Date(), 'yyyy-MM-dd');

  // Month view data
  currentMonthStr = '';
  calendarDays: any[] = [];

  // Week view data
  currentWeekStr = '';
  weekDays: any[] = [];

  // Day view data
  dayHours = Array.from({length: 24}, (_, i) => i);
  timeTasks: any[] = [];
  allDayTasks: any[] = [];

  // Filters
  showFilter = false;
  filterUrgent = false;
  filterTags: string[] = [];
  filterLogicAnd = false;
  filterCreatedBy: string | null = null;
  filterCategoryId: string | null = null;
  availableTags: string[] = [];
  availableUsers: User[] = [];
  availableCategories: Category[] = [];
  filteredTasks: Task[] = [];

  // Tag filter input
  tagFilterInput = '';
  showTagAutocomplete = false;

  get autocompleteTags(): string[] {
      const lowerInput = this.tagFilterInput.toLowerCase();
      return this.availableTags.filter(t => !this.filterTags.includes(t) && t.toLowerCase().includes(lowerInput));
  }

  // Workspace Edit
  isEditingWorkspace = false;
  editingWorkspaceName = '';

  // Form
  showForm = false;
  showTimeReminder = false;
  isSaving = false;
  editingTask: Task | null = null;
  formTask: any = {};
  formTaskTagInput = '';
  formTaskTags: string[] = [];
  showCategorySelect = false;
  showAdvancedSettings = false;

  // Interactions
  monthExpandDate: string | null = null;
  scheduledDrawerOpen = false;
  scheduledDrawerDate: string | null = null;
  get scheduledDrawerTasks() {
      if (!this.scheduledDrawerDate) return [];
      return this.filteredTasks.filter(t => t.date === this.scheduledDrawerDate);
  }

isDropdownOpen = false;


  contextMenuState = { show: false, x: 0, y: 0, task: null as any };
  isDragging = false;

  // Swipe logic
  swipeState: Record<string, { offset: number, startX: number, startY: number, active: boolean, state: string }> = {};
  longPressTimer: any;
  longPressTriggered = false;

selectCategory(catId: string | undefined) {
  this.formTask.categoryId = catId;
  this.isDropdownOpen = false; // 選完後自動關閉
}
@HostListener('document:click', ['$event'])
onDocumentClick(event: MouseEvent) {
  // 如果你有用 ElementRef 可以做更精確的判定
}

  openScheduledDrawer(dateStr: string, tasks: any[]) {
      this.scheduledDrawerDate = dateStr;

      // Update form context
      this.selectedDateStr = dateStr;

      this.scheduledDrawerOpen = true;
      this.monthExpandDate = null;
  }

  onContextMenu(event: MouseEvent, task: Task) {
      event.preventDefault();
      event.stopPropagation();
      this.contextMenuState = {
          show: true,
          x: event.clientX,
          y: event.clientY,
          task: task
      };
  }

  ngOnInit() {
    this.workspaceService.currentWorkspace$.pipe(takeUntil(this.destroy$)).subscribe(ws => {
      if (!ws) {
        this.router.navigate(['/workspaces']);
        return;
      }
      this.currentWorkspace = ws;

      const userId = localStorage.getItem('currentUserId');
      if (userId && ws.userPreferences && ws.userPreferences[userId]) {
         this.featureTabs = ws.userPreferences[userId].tabs || ['month', 'week', 'day'];
      } else {
         this.featureTabs = ['month', 'week', 'day'];
      }

      // Auto switch viewMode if current is not in featureTabs
      if (!this.featureTabs.includes(this.viewMode as any) && this.featureTabs.length > 0) {
         this.viewMode = this.featureTabs[0];
      }

      this.loadTasks(ws.id);
      this.loadCategories(ws.id);
    });

    this.userService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(u => {
      this.currentUser = u;
    });

    this.userService.getUsers().pipe(takeUntil(this.destroy$)).subscribe(users => {
      this.availableUsers = users;
    });
this.scheduledDrawerDate = this.selectedDateStr;
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTasks(workspaceId: string) {
    this.taskService.getTasks(workspaceId).pipe(takeUntil(this.destroy$)).subscribe(tasks => {
      this.tasks = tasks;
      this.updateAvailableTags();
      this.applyFilter(); // This will call refreshViews
      this.scheduleLocalReminders(tasks);
    });
  }

  loadCategories(workspaceId: string) {
    this.categoryService.getCategories(workspaceId).pipe(takeUntil(this.destroy$)).subscribe((cats: Category[]) => {
      this.availableCategories = cats.sort((a, b) => a.order - b.order);
    });
  }

  toggleFilterUrgent() {
      this.filterUrgent = !this.filterUrgent;
      // We rely on the template calling applyFilter after this
  }

  toggleFilterCreatedBy(userId: string) {
      if (this.filterCreatedBy === userId) {
          this.filterCreatedBy = null;
      } else {
          this.filterCreatedBy = userId;
      }
  }

  applyFilter() {
      let filtered = [...this.tasks];

      if (this.filterUrgent) {
          filtered = filtered.filter(t => t.isUrgent);
      }

      if (this.filterCreatedBy) {
          filtered = filtered.filter(t => t.createdBy === this.filterCreatedBy);
      }

      if (this.filterCategoryId) {
          filtered = filtered.filter(t => t.categoryId === this.filterCategoryId);
      }

      if (this.filterTags.length > 0) {
          if (this.filterLogicAnd) {
             filtered = filtered.filter(t => this.filterTags.every(tag => t.tags?.includes(tag)));
          } else {
             filtered = filtered.filter(t => this.filterTags.some(tag => t.tags?.includes(tag)));
          }
      }

      // Sort by completion, then manual order, then time (tasks without start time go first)
      filtered.sort((a, b) => {
          // 1. Completed tasks always go to bottom
          if (a.status === 'completed' && b.status !== 'completed') return 1;
          if (a.status !== 'completed' && b.status === 'completed') return -1;

          // 2. User defined order
          const orderA = (a as any).order ?? 0;
          const orderB = (b as any).order ?? 0;
          if (orderA !== orderB) {
              return orderA - orderB;
          }

          // 3. Fallback to time
          if (!a.startTime && b.startTime) return -1;
          if (a.startTime && !b.startTime) return 1;
          if (!a.startTime && !b.startTime) return 0;
          return a.startTime!.localeCompare(b.startTime!);
      });

      this.filteredTasks = filtered;
      this.unassignedTasks = this.filteredTasks.filter(t => !t.date);
      this.refreshViews();
  }

  clearFilter() {
      this.filterUrgent = false;
      this.filterTags = [];
      this.filterCreatedBy = null;
      this.filterCategoryId = null;
      this.applyFilter();
  }

  addTagToFilter() {
     const tag = this.tagFilterInput.trim();
     if (tag && !this.filterTags.includes(tag)) {
         this.filterTags.push(tag);
     }
     this.tagFilterInput = '';
     this.showTagAutocomplete = false;
     this.applyFilter();
  }

  selectAutocompleteTag(tag: string) {
      if (!this.filterTags.includes(tag)) {
         this.filterTags.push(tag);
      }
      this.tagFilterInput = '';
      this.showTagAutocomplete = false;
      this.applyFilter();
  }

  hideTagAutocomplete() {
      setTimeout(() => {
          this.showTagAutocomplete = false;
      }, 150); // slight delay to allow mousedown to fire on autocomplete item
  }

  removeTagFromFilter(tag: string) {
     this.filterTags = this.filterTags.filter(t => t !== tag);
     this.applyFilter();
  }

  toggleFilterLogic() {
      this.filterLogicAnd = !this.filterLogicAnd;
      if(this.filterTags.length > 1) {
          this.applyFilter();
      }
  }

  updateAvailableTags() {
      const tagSet = new Set<string>();
      this.tasks.forEach(t => t.tags?.forEach(tag => tagSet.add(tag)));
      this.availableTags = Array.from(tagSet);
  }

  refreshViews() {
    this.generateMonthView();
    this.generateWeekView();
    this.generateDayView();
  }

  // --- Date Navigation ---
  selectDate(dateStr: string) {
    this.selectedDateStr = dateStr;
    const dateObj = new Date(dateStr);
    this.currentDate = dateObj;
    // ensure we update drawer context
    this.scheduledDrawerDate = dateStr;
    this.refreshViews();
  }

  prevMonth() {
    this.currentDate = startOfMonth(subMonths(this.currentDate, 1));
    this.refreshViews();
  }
  nextMonth() {
    this.currentDate = startOfMonth(addMonths(this.currentDate, 1));
    this.refreshViews();
  }

  prevWeek() {
    this.currentDate = addDays(this.currentDate, -7);
    this.refreshViews();
  }
  nextWeek() {
    this.currentDate = addDays(this.currentDate, 7);
    this.refreshViews();
  }

  prevDay() {
    this.currentDate = addDays(this.currentDate, -1);
    this.selectedDateStr = format(this.currentDate, 'yyyy-MM-dd');
    this.refreshViews();
  }
  nextDay() {
    this.currentDate = addDays(this.currentDate, 1);
    this.selectedDateStr = format(this.currentDate, 'yyyy-MM-dd');
    this.refreshViews();
  }

  // --- Views Generation ---
  generateMonthView() {
    this.currentMonthStr = format(this.currentDate, 'yyyy年 MM月');
    const monthStart = startOfMonth(this.currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const days = [];
    let day = startDate;
    while (day <= endDate) {
      const dateStr = format(day, 'yyyy-MM-dd');
      days.push({
        date: day,
        dateStr: dateStr,
        dayNum: format(day, 'd'),
        isCurrentMonth: isSameMonth(day, monthStart),
        isToday: isSameDay(day, new Date()),
        tasks: this.filteredTasks.filter(t => t.date === dateStr)
      });
      day = addDays(day, 1);
    }
    this.calendarDays = days;
  }

  generateWeekView() {
    const weekStart = startOfWeek(this.currentDate, { weekStartsOn: 1 });
    this.currentWeekStr = format(weekStart, 'yyyy年 MM月 dd日') + ' ~';
    const days = [];
    let day = weekStart;
    const dayNames = ['一', '二', '三', '四', '五', '六', '日'];
    for(let i=0; i<7; i++) {
      const dateStr = format(day, 'yyyy-MM-dd');
      days.push({
        dateStr,
        dayName: dayNames[i],
        dayNum: format(day, 'd'),
        isToday: isSameDay(day, new Date()),
        tasks: this.filteredTasks.filter(t => t.date === dateStr)
      });
      day = addDays(day, 1);
    }
    this.weekDays = days;
  }

  toggleCompletion(task: Task) {
      if (!task) return;
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      this.taskService.updateTask(task.id, { status: newStatus });
  }

  hasUrgent(tasks: Task[]): boolean {
    return tasks.some(t => t.isUrgent);
  }

  isEmoji(str: string): boolean {
    if (!str) return false;
    const regex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
    return regex.test(str);
  }

  getCategoryForForm(id: string | undefined): Category | undefined {
    return this.availableCategories.find(c => c.id === id);
  }

  selectFormCategory(id: string | undefined) {
    this.formTask.categoryId = id;
    this.showCategorySelect = false;
  }

  generateDayView() {
    let allForDay = this.filteredTasks.filter(t => t.date === this.selectedDateStr);

    // Split into all day (no time) vs timed
    this.allDayTasks = allForDay.filter(t => !t.startTime);

    let timed = allForDay.filter(t => t.startTime).map(t => ({...t, _top: 0, _height: 60, _width: 'calc(100% - 56px)', _left: '48px'}));

    // Sort by start time
    timed.forEach(t => {
      let startH = 0, startM = 0;
      let endH = 1, endM = 0;
      if (t.startTime) {
        [startH, startM] = t.startTime.split(':').map(Number);
      }
      if (t.endTime) {
        [endH, endM] = t.endTime.split(':').map(Number);
      } else if (t.startTime) {
        endH = startH + 1; // Default 1 hr if no end time
        endM = startM;
      }

      const topPx = startH * 60 + startM;
      const hPx = Math.max(30, (endH * 60 + endM) - topPx); // Min 30px height

      t._top = topPx;
      t._height = hPx;
    });

    timed.sort((a,b) => a._top - b._top);

    // Overlap algorithm: assign columns
    const columns: any[][] = [];
    timed.forEach(t => {
        let placed = false;
        for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const lastTask = col[col.length - 1];
            if (lastTask._top + lastTask._height <= t._top) {
                col.push(t);
                placed = true;
                break;
            }
        }
        if (!placed) {
            columns.push([t]);
        }
    });

    const numCols = columns.length;
    if (numCols > 0) {
        columns.forEach((col, i) => {
            col.forEach(t => {
                t._width = `calc((100% - 56px) / ${numCols})`;
                t._left = `calc(48px + ((100% - 56px) / ${numCols}) * ${i})`;
            });
        });
    }

    this.timeTasks = timed;
  }

  wasDrawerOpenBeforeDrag = false;

  // Track reminder timeouts to prevent duplicates
  reminderTimeouts: { [taskId: string]: { timeoutId: any, time: number } } = {};
  draggingId: string | null = null;

  wasScheduledDrawerOpenBeforeDrag = false;

  dragStarted(taskId?: string) {
    this.isDragging = true;
    if (taskId) this.draggingId = taskId;
    this.wasDrawerOpenBeforeDrag = this.drawerOpen;
    this.wasScheduledDrawerOpenBeforeDrag = this.scheduledDrawerOpen;
    if (this.drawerOpen) {
      this.drawerOpen = false;
    }
    if (this.scheduledDrawerOpen) {
      this.scheduledDrawerOpen = false;
    }
  }

  dragEnded() {
    this.isDragging = false;
    this.draggingId = null;
    if (this.wasDrawerOpenBeforeDrag) {
      this.drawerOpen = true;
      this.wasDrawerOpenBeforeDrag = false;
    }
    if (this.wasScheduledDrawerOpenBeforeDrag) {
      this.scheduledDrawerOpen = true;
      this.wasScheduledDrawerOpenBeforeDrag = false;
    }
  }

  // --- Drag and Drop Logic ---
  dropToDate(event: CdkDragDrop<Task[]>, targetDateStr: string) {
    if (event.previousContainer === event.container) {
      // In scheduled drawer, prevent drag to sort since we have up/down arrows
      if (event.container.id === 'scheduled-list') {
        return;
      }
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      event.container.data.forEach((task, index) => {
         this.taskService.updateTask(task.id, { order: index });
      });
    } else {
      const task = event.item.data;
      if(task) {
        this.taskService.updateTask(task.id, { date: targetDateStr, order: Date.now() });
      }
    }
  }

  dropToTime(event: CdkDragDrop<any>, hour: number, minute: number) {
     const task = event.item.data;
     if(task) {
        const hh = hour.toString().padStart(2, '0');
        const mm = minute.toString().padStart(2, '0');

        // If it already had a duration, preserve the duration. Otherwise default 1 hour.
        let durationMinutes = 60;
        if (task.startTime && task.endTime) {
           const [sH, sM] = task.startTime.split(':').map(Number);
           const [eH, eM] = task.endTime.split(':').map(Number);
           durationMinutes = (eH * 60 + eM) - (sH * 60 + sM);
        }

        const newTotalMinutes = hour * 60 + minute + durationMinutes;
        const newEndH = Math.floor(newTotalMinutes / 60).toString().padStart(2, '0');
        const newEndM = (newTotalMinutes % 60).toString().padStart(2, '0');

        this.taskService.updateTask(task.id, {
          date: this.selectedDateStr,
          startTime: `${hh}:${mm}`,
          endTime: `${newEndH}:${newEndM}`
        });
     }
  }

  dropToAllDay(event: CdkDragDrop<Task[]>) {
    const task = event.item.data;
    if(task) {
      this.taskService.updateTask(task.id, {
        date: this.selectedDateStr,
        startTime: null,
        endTime: null
      });
    }
  }

  dropToUnassigned(event: CdkDragDrop<Task[]>) {
    // Only process if it came from somewhere else
    if (event.previousContainer.id !== 'unassigned-list') {
      const task = event.item.data;
      if(task) {
         this.taskService.updateTask(task.id, { date: null, startTime: null, endTime: null });
      }
    }
    // ensure drawer opens back up if they dropped to unassigned
    this.drawerOpen = true;
    this.wasDrawerOpenBeforeDrag = false;
  }

  dropToTrash(event: CdkDragDrop<any>) {
    const task = event.item.data;
    if(task) {
       this.taskService.updateTask(task.id, { date: null, startTime: null, endTime: null });
    }
  }

  // Calculate local time reminders
  scheduleLocalReminders(tasks: Task[]) {
    // Intentionally disabled. We now strictly rely on the local-push-server.js
    // to send background FCM pushes. Local setTimeouts cause duplicate notifications
    // when the PWA is active in the background.
  }

  // --- Swipe Actions Logic ---
  getClientX(e: any) {
    return e.touches ? e.touches[0].clientX : e.clientX;
  }
  getClientY(e: any) {
    return e.touches ? e.touches[0].clientY : e.clientY;
  }

onTouchStart(e: any, taskId: string) {
    if (e.type.startsWith('mouse')) return; 
    if (this.isDragging) return;

    // --- 新增：清理邏輯 ---
    // 遍歷所有正在滑動的狀態，如果不是當前這個，就直接歸零
    Object.keys(this.swipeState).forEach(id => {
        if (id !== taskId && this.swipeState[id].offset !== 0) {
            this.swipeState[id].offset = 0;
            this.swipeState[id].state = '';
            this.swipeState[id].active = false;
        }
    });

    // 初始化當前任務狀態
    this.swipeState[taskId] = {
      offset: 0,
      startX: this.getClientX(e),
      startY: this.getClientY(e),
      active: true,
      state: ''
    };

    this.longPressTriggered = false;
    this.longPressTimer = setTimeout(() => {
        this.longPressTriggered = true;
        const task = this.filteredTasks.find(t => t.id === taskId);
        if(task) {
           this.contextMenuState = {
              show: true,
              x: this.swipeState[taskId].startX,
              y: this.swipeState[taskId].startY,
              task: task
           };
        }
    }, 600);
  }

  onContextMenuMobile(event: any) {
    if (this.longPressTriggered) {
        event.preventDefault();
        event.stopPropagation();
    }
  }

  onTouchMove(e: any, taskId: string) {
    const s = this.swipeState[taskId];
    if (!s || !s.active) return;

    const dx = this.getClientX(e) - s.startX;
    const dy = this.getClientY(e) - s.startY;

    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        clearTimeout(this.longPressTimer);
    }

    // Only swipe if horizontally moving more than vertically (and enough threshold)
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
       s.offset = dx;
       if (dx > 50) s.state = 'right'; // Cancel schedule
       else if (dx < -50) s.state = 'left'; // Copy
       else s.state = '';
    }
  }

  onTouchCancel(e: any) {
    clearTimeout(this.longPressTimer);
  }

onTouchEnd(e: any, taskId: string) {
    clearTimeout(this.longPressTimer);
    const s = this.swipeState[taskId];
    if (!s) return;

    if (s.state === 'right') {
        s.offset = 80; // 展開寬度
    } else if (s.state === 'left') {
        s.offset = -80;
    } else {
        s.offset = 0;
    }

    s.active = false;

    // 改進：使用一個閉包來檢查在 3 秒後，用戶是否「又開始動它了」
    // 如果用戶 3 秒內沒去動這個特定的 task，才把它縮回去
    setTimeout(() => {
        const currentStatus = this.swipeState[taskId];
        // 如果該物件現在不是在 active 狀態，且 offset 還是當初設定的值，才彈回
        if (currentStatus && !currentStatus.active && Math.abs(currentStatus.offset) === 80) {
            currentStatus.offset = 0;
            currentStatus.state = '';
        }
    }, 3000);
}

  getSwipeOffset(taskId: string) {
    return this.swipeState[taskId]?.offset || 0;
  }

  getSwipeState(taskId: string) {
    return this.swipeState[taskId]?.state || '';
  }

  // --- Form & Actions ---
    openCreateTask() {
    this.editingTask = null;
    this.formTask = {
       date: this.selectedDateStr
    };
    this.formTaskTags = [];
    this.formTaskTagInput = '';
    this.showTimeReminder = false;
    this.showForm = true;
  }

  editTask(task: Task) {
    if (this.longPressTriggered) return;
    const s = this.swipeState[task.id];
    if (s && (s.active || Math.abs(s.offset) > 10)) {
        return; // ignore click if swiping or swiped open
    }
    this.editingTask = task;
    this.formTask = { ...task };
    this.formTaskTags = task.tags ? [...task.tags] : [];
    this.formTaskTagInput = '';
    this.showTimeReminder = !!(task.startTime || task.endTime || (task as any).enablePush);
    this.showForm = true;
  }

  addFormTag() {
    const newTag = this.formTaskTagInput.trim();
    if (newTag && !this.formTaskTags.includes(newTag)) {
      this.formTaskTags.push(newTag);
    }
    this.formTaskTagInput = '';
  }

  removeFormTag(tag: string) {
    this.formTaskTags = this.formTaskTags.filter(t => t !== tag);
  }

  saveForm() {
    if(!this.currentWorkspace || !this.currentUser) return;

    if (!this.formTask.startTime && this.formTask.endTime) {
        alert('請先選擇開始時間，再選擇結束時間！');
        return;
    }

    // Auto-clear reminder if start time is empty
    if (!this.formTask.startTime) {
        this.formTask.reminderOffset = null;
    }

    if (this.formTask.reminderOffset && !this.formTask.startTime) {
        alert('設定提醒時間前，必須先設定開始時間！');
        return;
    }

    if (this.formTask.startTime && this.formTask.endTime) {
       if (this.formTask.startTime > this.formTask.endTime) {
           alert('結束時間不能早於開始時間！');
           return;
       }
    }

    if (this.formTaskTagInput.trim() && !this.formTaskTags.includes(this.formTaskTagInput.trim())) {
      this.formTaskTags.push(this.formTaskTagInput.trim());
    }

    const dataToSave = {
      workspaceId: this.currentWorkspace.id,
      categoryId: this.formTask.categoryId || null,
      title: this.formTask.title || '新代辦事項',
      description: this.formTask.description || '',
      date: this.formTask.date || null,
      startTime: this.formTask.startTime || null,
      endTime: this.formTask.endTime || null,
      tags: this.formTaskTags,
      isUrgent: this.formTask.isUrgent || false,
      createdBy: this.formTask.createdBy || this.currentUser.id,
      status: this.formTask.status || 'pending',
      reminderOffset: this.formTask.reminderOffset || null
    };

    this.isSaving = true;
    if (this.editingTask) {
      this.taskService.updateTask(this.editingTask.id, dataToSave).then(() => {
          this.isSaving = false;
          this.showForm = false;
      }).catch(() => { this.isSaving = false; });
    } else {
      // Calculate top order for new task
      let newOrder = 0;
      const dateToMatch = dataToSave.date;
      const tasksInSameList = dateToMatch
           ? this.filteredTasks.filter(t => t.date === dateToMatch)
           : this.unassignedTasks;

      if (tasksInSameList.length > 0) {
          const minOrder = Math.min(...tasksInSameList.map(t => typeof t.order === 'number' ? t.order : 0));
          newOrder = minOrder - 1;
      }

      const taskToCreate = { ...dataToSave, order: newOrder };
      this.taskService.addTask(taskToCreate as any).then(() => {
          this.isSaving = false;
          this.showForm = false;
      }).catch(() => { this.isSaving = false; });
    }
  }

  copyTask(task: Task) {
     this.formTask = { ...task, title: task.title + ' (複製)', id: undefined };
     this.editingTask = null;
     if (this.swipeState[task.id]) {
       this.swipeState[task.id].offset = 0; // reset swipe
     }
     this.showTimeReminder = !!(task.startTime || task.endTime || (task as any).enablePush);
     this.showForm = true;
  }

  moveTaskUp(task: Task) {
    const tasks = this.scheduledDrawerTasks;
    const index = tasks.findIndex(t => t.id === task.id);
    if (index > 0) {
      // Swap order values or update all
      const newOrder = tasks.map(t => t.id);
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
      newOrder.forEach((id, idx) => {
         this.taskService.updateTask(id, { order: idx });
      });
    }
  }

  moveTaskDown(task: Task) {
    const tasks = this.scheduledDrawerTasks;
    const index = tasks.findIndex(t => t.id === task.id);
    if (index > -1 && index < tasks.length - 1) {
      // Swap order values or update all
      const newOrder = tasks.map(t => t.id);
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      newOrder.forEach((id, idx) => {
         this.taskService.updateTask(id, { order: idx });
      });
    }
  }

  unscheduleTask(task: Task) {
     this.taskService.updateTask(task.id, { date: null, startTime: null, endTime: null });
     this.swipeState[task.id].offset = 0;
  }

  goBack() {
    this.workspaceService.setCurrentWorkspace(null);
  }

  editWorkspaceName() {
    if (this.currentWorkspace) {
       this.editingWorkspaceName = this.currentWorkspace.name;
       this.isEditingWorkspace = true;
    }
  }

  saveWorkspaceName() {
    if (this.isEditingWorkspace && this.currentWorkspace && this.editingWorkspaceName.trim()) {
       this.workspaceService.updateWorkspace(this.currentWorkspace.id, { name: this.editingWorkspaceName.trim() });
    }
    this.isEditingWorkspace = false;
  }

  goToSettings() {
    this.router.navigate(['/settings']);
  }

  logout() {
    this.userService.logout();
  }
}
