import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { WorkspaceService, Workspace } from '../../core/services/workspace.service';
import { TaskService, Task } from '../../core/services/task.service';
import { UserService, User } from '../../core/services/user.service';
import { SvgIconComponent } from '../../core/svg-icon/svg-icon.component';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { addDays, format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay } from 'date-fns';

@Component({
  selector: 'app-main-view',
  standalone: true,
  imports: [CommonModule, SvgIconComponent, DragDropModule, FormsModule],
  template: `
    <div class="flex flex-col h-full bg-milktea-50 relative" cdkDropListGroup>
      <!-- Header -->
      <div class="bg-white px-4 py-3 shadow-sm border-b border-milktea-100 flex items-center justify-between z-10">
        <button (click)="goBack()" class="text-milktea-400 p-2 -ml-2">
          ← 返回
        </button>
        <div class="flex flex-col items-center">
          <span class="font-bold text-milktea-900">{{ currentWorkspace?.name || '未命名空間' }}</span>
        </div>
        <button (click)="logout()" class="text-milktea-600 text-sm font-bold">登出</button>
      </div>

      <!-- Filters & View Toggle -->
      <div class="px-4 py-3 bg-milktea-50 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
        <button class="px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap"
                [class.bg-milktea-600]="viewMode === 'month'" [class.text-white]="viewMode === 'month'"
                [class.bg-white]="viewMode !== 'month'" [class.text-milktea-600]="viewMode !== 'month'"
                (click)="viewMode = 'month'">月曆</button>
        <button class="px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap"
                [class.bg-milktea-600]="viewMode === 'week'" [class.text-white]="viewMode === 'week'"
                [class.bg-white]="viewMode !== 'week'" [class.text-milktea-600]="viewMode !== 'week'"
                (click)="viewMode = 'week'">週曆</button>
        <button class="px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap"
                [class.bg-milktea-600]="viewMode === 'day'" [class.text-white]="viewMode === 'day'"
                [class.bg-white]="viewMode !== 'day'" [class.text-milktea-600]="viewMode !== 'day'"
                (click)="viewMode = 'day'">日曆</button>
        <div class="flex-1"></div>
        <button class="px-3 py-1.5 rounded-full bg-white text-milktea-600 border border-milktea-200 text-sm flex items-center gap-1"
                (click)="showFilter = !showFilter">
          篩選
        </button>
      </div>

      <!-- Filter Panel -->
      <div *ngIf="showFilter" class="px-4 py-2 bg-white border-b border-milktea-100 flex gap-2 flex-wrap items-center z-20 shadow-sm relative">
         <span class="text-xs text-milktea-500 w-full mb-1">標籤與屬性過濾：</span>
         <button class="text-xs px-2 py-1 rounded-full border border-red-200 text-red-500"
                 [class.bg-red-50]="filterUrgent" (click)="toggleFilterUrgent()">緊急</button>
         <input type="text" [(ngModel)]="filterTag" placeholder="輸入標籤..." class="text-xs border rounded p-1 w-24">
         <button class="text-xs text-milktea-600" (click)="applyFilter()">套用</button>
         <button class="text-xs text-milktea-400 ml-auto" (click)="clearFilter()">清除</button>
      </div>

      <!-- Main Content Area -->
      <div class="flex-1 overflow-y-auto relative pb-20" id="main-group">

        <!-- Trash Can for un-scheduling -->
        <div cdkDropList id="trash-list" [cdkDropListData]="[]" (cdkDropListDropped)="dropToTrash($event)"
             class="absolute top-2 right-2 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center z-10 border-2 border-dashed border-red-300 opacity-50 hover:opacity-100"
             title="拖曳至此取消排程">
          <span class="text-xl">🗑️</span>
        </div>

        <!-- Month View -->
        <div *ngIf="viewMode === 'month'" class="p-4 h-full flex flex-col relative">
          <div class="flex justify-between items-center mb-4">
            <button (click)="prevMonth()" class="text-milktea-800 font-bold px-2">&lt;</button>
            <h2 class="text-xl font-bold text-milktea-900">{{ currentMonthStr }}</h2>
            <button (click)="nextMonth()" class="text-milktea-800 font-bold px-2">&gt;</button>
          </div>

          <div class="grid grid-cols-7 gap-1 text-center mb-2 text-sm text-milktea-500 font-bold">
            <div *ngFor="let day of ['日','一','二','三','四','五','六']">{{ day }}</div>
          </div>

          <div class="grid grid-cols-7 gap-1 flex-1 relative">
            <div *ngFor="let d of calendarDays"
                 class="bg-white rounded-lg p-1 flex flex-col items-center relative"
                 [class.opacity-50]="!d.isCurrentMonth"
                 [class.border-2]="d.dateStr === selectedDateStr"
                 [class.border-milktea-400]="d.dateStr === selectedDateStr"
                 (click)="selectDate(d.dateStr); monthExpandDate = monthExpandDate === d.dateStr ? null : d.dateStr"
                 cdkDropList
                 [cdkDropListData]="d.tasks"
                 (cdkDropListDropped)="dropToDate($event, d.dateStr)">
              <span class="text-sm mt-1" [class.font-bold]="d.isToday" [class.text-milktea-600]="d.isToday">{{ d.dayNum }}</span>
              <div class="flex gap-0.5 mt-1 flex-wrap justify-center flex-1 w-full min-h-[20px]">
                 <!-- Red dot indicator if there are tasks -->
                 <div *ngIf="d.tasks.length > 0" class="w-2 h-2 rounded-full bg-red-400 mx-auto my-1"></div>
              </div>

              <!-- Expanded Task List (Month View) -->
              <div *ngIf="monthExpandDate === d.dateStr"
                   class="absolute top-full left-1/2 -translate-x-1/2 w-48 bg-white border border-milktea-200 shadow-xl rounded-xl z-30 p-2 mt-2"
                   (click)="$event.stopPropagation()">
                   <div class="text-xs font-bold text-milktea-800 mb-2 border-b pb-1">{{ d.dateStr }}</div>
                   <div *ngFor="let t of d.tasks" class="relative group overflow-hidden mb-1 rounded"
                        (mousedown)="onTouchStart($event, t.id)"
                        (touchstart)="onTouchStart($event, t.id)"
                        (mousemove)="onTouchMove($event, t.id)"
                        (touchmove)="onTouchMove($event, t.id)"
                        (mouseup)="onTouchEnd($event, t.id)"
                        (touchend)="onTouchEnd($event, t.id)">

                      <!-- Left Swipe Background (Copy) -->
                      <div class="absolute inset-y-0 right-0 w-16 bg-blue-500 text-white flex items-center justify-center font-bold z-0 text-[10px]"
                           [style.opacity]="getSwipeState(t.id) === 'left' ? 1 : 0"
                           (click)="copyTask(t); monthExpandDate = null">
                        複製
                      </div>

                      <!-- Right Swipe Background (Unschedule) -->
                      <div class="absolute inset-y-0 left-0 w-16 bg-red-500 text-white flex items-center justify-center font-bold z-0 text-[10px]"
                           [style.opacity]="getSwipeState(t.id) === 'right' ? 1 : 0"
                           (click)="unscheduleTask(t); monthExpandDate = null">
                        取消排程
                      </div>

                      <div class="text-xs p-1.5 bg-white hover:bg-milktea-50 cursor-pointer border border-transparent hover:border-milktea-100 flex items-center justify-between relative z-10 transition-transform duration-200"
                           [style.transform]="'translateX(' + getSwipeOffset(t.id) + 'px)'"
                           (click)="editTask(t); monthExpandDate = null">
                        <span class="truncate">{{ t.title }}</span>
                        <span class="w-1.5 h-1.5 rounded-full" [class.bg-red-500]="t.isUrgent" [class.bg-milktea-300]="!t.isUrgent"></span>
                      </div>
                   </div>
                   <div *ngIf="d.tasks.length === 0" class="text-xs text-milktea-400 text-center py-2">無代辦事項</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Week View -->
        <div *ngIf="viewMode === 'week'" class="p-4 h-full flex flex-col">
          <div class="flex justify-between items-center mb-4">
            <button (click)="prevWeek()" class="text-milktea-800 font-bold px-2">&lt;</button>
            <h2 class="text-xl font-bold text-milktea-900">{{ currentWeekStr }}</h2>
            <button (click)="nextWeek()" class="text-milktea-800 font-bold px-2">&gt;</button>
          </div>

          <div class="grid grid-cols-7 gap-2 flex-1">
             <div *ngFor="let d of weekDays"
                  class="bg-white rounded-lg p-2 flex flex-col border border-milktea-100 min-h-[300px]"
                  [class.bg-milktea-100]="d.isToday"
                  (click)="selectDate(d.dateStr)"
                  cdkDropList
                  [cdkDropListData]="d.tasks"
                  (cdkDropListDropped)="dropToDate($event, d.dateStr)">
               <div class="text-center border-b border-milktea-100 pb-1 mb-2">
                 <div class="text-xs text-milktea-500">{{ d.dayName }}</div>
                 <div class="font-bold text-milktea-900">{{ d.dayNum }}</div>
               </div>
               <div class="flex-1 flex flex-col gap-1 overflow-y-auto">
                 <div *ngFor="let t of d.tasks" cdkDrag [cdkDragData]="t" class="relative overflow-hidden rounded bg-milktea-50 border border-milktea-200"
                      (mousedown)="onTouchStart($event, t.id)"
                      (touchstart)="onTouchStart($event, t.id)"
                      (mousemove)="onTouchMove($event, t.id)"
                      (touchmove)="onTouchMove($event, t.id)"
                      (mouseup)="onTouchEnd($event, t.id)"
                      (touchend)="onTouchEnd($event, t.id)">

                   <!-- Left Swipe Background (Copy) -->
                   <div class="absolute inset-y-0 right-0 w-12 bg-blue-500 text-white flex items-center justify-center font-bold z-0 text-[10px]"
                        [style.opacity]="getSwipeState(t.id) === 'left' ? 1 : 0"
                        (click)="copyTask(t); $event.stopPropagation()">
                     複製
                   </div>

                   <!-- Right Swipe Background (Unschedule) -->
                   <div class="absolute inset-y-0 left-0 w-12 bg-red-500 text-white flex items-center justify-center font-bold z-0 text-[10px]"
                        [style.opacity]="getSwipeState(t.id) === 'right' ? 1 : 0"
                        (click)="unscheduleTask(t); $event.stopPropagation()">
                     取消
                   </div>

                   <div class="p-1.5 text-xs truncate cursor-move touch-none relative z-10 bg-milktea-50 transition-transform duration-200"
                        [style.transform]="'translateX(' + getSwipeOffset(t.id) + 'px)'"
                        (click)="editTask(t); $event.stopPropagation()">
                     {{ t.title }}
                   </div>
                   <div *cdkDragPreview class="bg-white p-2 shadow rounded border z-50">{{ t.title }}</div>
                 </div>
               </div>
             </div>
          </div>
        </div>

        <!-- Day View (Time Axis) -->
        <div *ngIf="viewMode === 'day'" class="p-4 h-full flex flex-col relative">
          <div class="flex justify-between items-center mb-4 sticky top-0 bg-milktea-50 z-20 pb-2">
            <button (click)="prevDay()" class="text-milktea-800 font-bold px-2">&lt;</button>
            <h2 class="text-xl font-bold text-milktea-900">{{ selectedDateStr }}</h2>
            <button (click)="nextDay()" class="text-milktea-800 font-bold px-2">&gt;</button>
          </div>

          <!-- Time Grid -->
          <div class="relative flex-1 min-h-[1440px]"> <!-- 24 hours * 60px -->
             <!-- Background hours -->
             <div *ngFor="let hour of dayHours" class="absolute w-full h-[60px] border-b border-milktea-200 flex" [style.top.px]="hour * 60">
                <div class="w-12 text-xs text-milktea-400 text-right pr-2 -mt-2">{{ hour }}:00</div>
                <div class="flex-1 h-full"
                     cdkDropList
                     [cdkDropListData]="dayTasks"
                     (cdkDropListDropped)="dropToTime($event, hour, 0)">
                </div>
             </div>

             <!-- Render Tasks -->
             <div cdkDropList id="day-task-wrapper" [cdkDropListData]="dayTasks" class="absolute inset-0 z-10 pointer-events-none">
                 <div *ngFor="let t of dayTasks"
                      cdkDrag [cdkDragData]="t"
                      class="absolute bg-milktea-300 rounded border border-milktea-500 shadow-sm overflow-hidden text-xs cursor-move touch-none hover:z-30 pointer-events-auto"
                      [style.top.px]="t._top"
                      [style.height.px]="t._height"
                      [style.left]="t._left"
                      [style.width]="t._width"
                      (mousedown)="onTouchStart($event, t.id)"
                      (touchstart)="onTouchStart($event, t.id)"
                      (mousemove)="onTouchMove($event, t.id)"
                      (touchmove)="onTouchMove($event, t.id)"
                      (mouseup)="onTouchEnd($event, t.id)"
                      (touchend)="onTouchEnd($event, t.id)">

                    <!-- Left Swipe Background (Copy) -->
                    <div class="absolute inset-y-0 right-0 w-16 bg-blue-500 text-white flex items-center justify-center font-bold z-0 text-[10px]"
                         [style.opacity]="getSwipeState(t.id) === 'left' ? 1 : 0"
                         (click)="copyTask(t); $event.stopPropagation()">
                      複製
                    </div>

                    <!-- Right Swipe Background (Unschedule) -->
                    <div class="absolute inset-y-0 left-0 w-16 bg-red-500 text-white flex items-center justify-center font-bold z-0 text-[10px]"
                         [style.opacity]="getSwipeState(t.id) === 'right' ? 1 : 0"
                         (click)="unscheduleTask(t); $event.stopPropagation()">
                      取消
                    </div>

                    <div cdkDragHandle class="w-full h-full p-1 bg-milktea-300 relative z-10 transition-transform duration-200"
                         [style.transform]="'translateX(' + getSwipeOffset(t.id) + 'px)'"
                         (click)="editTask(t)">
                      <div class="font-bold text-milktea-900 truncate">{{ t.title }}</div>
                      <div class="text-[10px] text-milktea-800 truncate" *ngIf="t.startTime">{{ t.startTime }} - {{ t.endTime || '?' }}</div>
                    </div>
                    <div *cdkDragPreview class="bg-white p-2 shadow rounded border z-50">{{ t.title }}</div>
                 </div>
             </div>
          </div>
        </div>

      </div>

      <!-- Bottom Drawer handle -->
      <div class="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.05)] transition-transform duration-300 z-30"
           [style.transform]="drawerOpen ? 'translateY(0)' : 'translateY(calc(100% - 60px))'">
        <div class="h-[60px] flex items-center justify-center cursor-pointer" (click)="drawerOpen = !drawerOpen">
          <div class="w-12 h-1.5 bg-milktea-200 rounded-full mb-1"></div>
          <span class="absolute right-6 bg-milktea-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">未排程 ({{ unassignedTasks.length }})</span>
        </div>

        <div class="h-[40vh] overflow-y-auto px-4 pb-4 overflow-x-hidden"
             cdkDropList
             id="unassigned-list"
             [cdkDropListData]="unassignedTasks"
             (cdkDropListDropped)="dropToUnassigned($event)">
          <div *ngFor="let task of unassignedTasks"
               cdkDrag [cdkDragData]="task"
               class="relative bg-milktea-50 p-3 rounded-xl mb-2 shadow-sm cursor-move active:shadow-md touch-none flex items-center justify-between group overflow-hidden">

            <!-- Main Content Container -->
            <div class="relative z-10 w-full flex items-center justify-between transition-transform duration-200 bg-milktea-50 rounded-xl">
              <div cdkDragHandle class="flex-1">
                <span class="font-bold text-milktea-900">{{ task.title }}</span>
                <div class="flex gap-1 mt-1">
                  <span *ngFor="let tag of task.tags" class="text-[10px] bg-white border border-milktea-200 px-1.5 py-0.5 rounded text-milktea-600">{{ tag }}</span>
                </div>
              </div>
              <button class="text-milktea-400 p-2 z-20" (click)="editTask(task); $event.stopPropagation()">⋮</button>
            </div>

            <div *cdkDragPreview class="bg-white p-3 shadow rounded-xl border flex items-center w-64">{{ task.title }}</div>
          </div>
          <div *ngIf="unassignedTasks.length === 0" class="text-center text-milktea-400 mt-8 text-sm">
            沒有未排程代辦
          </div>
        </div>
      </div>

      <!-- FAB -->
      <button class="absolute right-6 bottom-24 w-14 h-14 bg-milktea-600 text-white rounded-full shadow-lg flex items-center justify-center text-3xl font-light hover:bg-milktea-700 active:scale-95 transition-all z-20"
              (click)="openCreateTask()">
        +
      </button>

      <!-- Overlay form for demo -->
      <div *ngIf="showForm" class="absolute inset-0 bg-black/30 z-40 flex items-center justify-center p-4">
        <div class="bg-white p-6 rounded-2xl w-full max-w-sm shadow-xl relative">
          <h2 class="font-bold mb-4">{{ editingTask?.id ? '編輯代辦' : '新增代辦' }}</h2>
          <input [(ngModel)]="formTask.title" placeholder="標題" class="w-full p-2 mb-2 border rounded">
          <textarea [(ngModel)]="formTask.description" placeholder="詳細內容" class="w-full p-2 mb-2 border rounded" rows="2"></textarea>
          <input [(ngModel)]="formTask.date" type="date" placeholder="日期" class="w-full p-2 mb-2 border rounded">
          <div class="flex gap-2 mb-2">
            <input [(ngModel)]="formTask.startTime" type="time" placeholder="開始時間" class="w-1/2 p-2 border rounded">
            <input [(ngModel)]="formTask.endTime" type="time" placeholder="結束時間" class="w-1/2 p-2 border rounded">
          </div>

          <div class="flex gap-2 items-center mb-2">
             <input [(ngModel)]="formTaskTagInput" placeholder="標籤 (逗號分隔)" class="flex-1 p-2 border rounded">
             <label class="flex items-center gap-1 text-sm text-red-500 font-bold whitespace-nowrap">
                 <input type="checkbox" [(ngModel)]="formTask.isUrgent" class="rounded text-red-500"> 緊急
             </label>
          </div>

          <div class="flex items-center gap-2 mb-2">
             <span class="text-sm text-milktea-600">提醒:</span>
             <select [(ngModel)]="formTask.reminderOffset" class="flex-1 p-2 border rounded bg-white text-milktea-900">
                <option [ngValue]="null">不提醒</option>
                <option [ngValue]="15">提前 15 分鐘</option>
                <option [ngValue]="30">提前 30 分鐘</option>
                <option [ngValue]="60">提前 1 小時</option>
             </select>
          </div>

          <div class="flex gap-2 justify-end mt-4">
             <button class="text-milktea-600 px-4 py-2" (click)="showForm = false">取消</button>
             <button class="bg-milktea-600 text-white px-4 py-2 rounded" (click)="saveForm()">儲存</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `]
})
export class MainViewComponent implements OnInit, OnDestroy {
  private workspaceService = inject(WorkspaceService);
  private taskService = inject(TaskService);
  private userService = inject(UserService);
  private router = inject(Router);

  destroy$ = new Subject<void>();

  currentWorkspace: Workspace | null = null;
  currentUser: User | null = null;

  viewMode: 'month' | 'week' | 'day' = 'month';
  drawerOpen = false;

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
  dayTasks: any[] = [];

  // Filters
  showFilter = false;
  filterUrgent = false;
  filterTag = '';
  filteredTasks: Task[] = [];

  // Form
  showForm = false;
  editingTask: Task | null = null;
  formTask: any = {};
  formTaskTagInput = '';

  // Interactions
  monthExpandDate: string | null = null;

  // Swipe logic
  swipeState: Record<string, { offset: number, startX: number, startY: number, active: boolean, state: string }> = {};

  ngOnInit() {
    this.workspaceService.currentWorkspace$.pipe(takeUntil(this.destroy$)).subscribe(ws => {
      if (!ws) {
        this.router.navigate(['/workspaces']);
        return;
      }
      this.currentWorkspace = ws;
      this.loadTasks(ws.id);
    });

    this.userService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(u => {
      this.currentUser = u;
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTasks(workspaceId: string) {
    this.taskService.getTasks(workspaceId).pipe(takeUntil(this.destroy$)).subscribe(tasks => {
      this.tasks = tasks;
      this.applyFilter(); // This will call refreshViews
      this.scheduleLocalReminders(tasks);
    });
  }

  toggleFilterUrgent() {
      this.filterUrgent = !this.filterUrgent;
  }

  applyFilter() {
      let filtered = [...this.tasks];

      if (this.filterUrgent) {
          filtered = filtered.filter(t => t.isUrgent);
      }

      if (this.filterTag && this.filterTag.trim() !== '') {
          const lowerTag = this.filterTag.trim().toLowerCase();
          filtered = filtered.filter(t => t.tags && t.tags.some(tag => tag.toLowerCase().includes(lowerTag)));
      }

      this.filteredTasks = filtered;
      this.unassignedTasks = this.filteredTasks.filter(t => !t.date);
      this.refreshViews();
  }

  clearFilter() {
      this.filterUrgent = false;
      this.filterTag = '';
      this.applyFilter();
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
    this.refreshViews();
  }

  prevMonth() {
    this.currentDate = addDays(this.currentDate, -30);
    this.currentDate = startOfMonth(this.currentDate);
    this.refreshViews();
  }
  nextMonth() {
    this.currentDate = addDays(startOfMonth(this.currentDate), 32);
    this.currentDate = startOfMonth(this.currentDate);
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
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

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
    const weekStart = startOfWeek(this.currentDate);
    this.currentWeekStr = format(weekStart, 'yyyy年 MM月 dd日') + ' ~';
    const days = [];
    let day = weekStart;
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
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

  generateDayView() {
    // Basic day view layout engine
    let tasksForDay = this.filteredTasks.filter(t => t.date === this.selectedDateStr).map(t => ({...t, _top: 0, _height: 60, _width: '90%', _left: '48px'}));

    // Sort and calculate overlaps
    tasksForDay.forEach(t => {
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

    // Simple overlap algorithm:
    // If start time is within another's duration, shift left
    tasksForDay.sort((a,b) => a._top - b._top);

    // Very rudimentary layout for overlap
    for (let i = 0; i < tasksForDay.length; i++) {
        let overlapCount = 0;
        let overlapIndex = 0;
        for (let j = 0; j < i; j++) {
            if (tasksForDay[i]._top < (tasksForDay[j]._top + tasksForDay[j]._height)) {
                overlapCount++;
                overlapIndex++;
            }
        }
        if (overlapCount > 0) {
            tasksForDay[i]._width = '40%';
            tasksForDay[i]._left = (48 + overlapIndex * 40) + 'px';
            // Need to fix previously processed overlapping items as well in a full algo,
            // this is simplified for PWA visual representation.
        }
    }

    this.dayTasks = tasksForDay;
  }

  // --- Drag and Drop Logic ---
  dropToDate(event: CdkDragDrop<Task[]>, targetDateStr: string) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      const task = event.item.data;
      if(task) {
        this.taskService.updateTask(task.id, { date: targetDateStr });
      }
    }
  }

  dropToTime(event: CdkDragDrop<any>, hour: number, minute: number) {
     const task = event.item.data;
     if(task) {
        const hh = hour.toString().padStart(2, '0');
        const mm = minute.toString().padStart(2, '0');
        const eH = (hour+1).toString().padStart(2, '0');
        this.taskService.updateTask(task.id, {
          date: this.selectedDateStr,
          startTime: `${hh}:${mm}`,
          endTime: `${eH}:${mm}`
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
  }

  dropToTrash(event: CdkDragDrop<any>) {
    const task = event.item.data;
    if(task) {
       this.taskService.updateTask(task.id, { date: null, startTime: null, endTime: null });
    }
  }

  // Calculate local time reminders
  scheduleLocalReminders(tasks: Task[]) {
    // This is a naive frontend implementation to demonstrate the local reminder behavior
    const now = new Date();
    tasks.forEach(task => {
        if (task.date && task.startTime && task.reminderOffset) {
            const [h, m] = task.startTime.split(':').map(Number);
            const taskDate = new Date(task.date);
            taskDate.setHours(h, m, 0, 0);

            const reminderTime = new Date(taskDate.getTime() - task.reminderOffset * 60000);
            const timeDiff = reminderTime.getTime() - now.getTime();

            // If the reminder time is in the future and within the next 24 hours, set a timeout
            if (timeDiff > 0 && timeDiff < 86400000) {
               setTimeout(() => {
                  if (Notification.permission === 'granted') {
                      new Notification('即將到期的代辦事項', {
                          body: `${task.title} 將於 ${task.startTime} 開始`
                      });
                  }
               }, timeDiff);
            }
        }
    });
  }

  // --- Swipe Actions Logic ---
  getClientX(e: any) {
    return e.touches ? e.touches[0].clientX : e.clientX;
  }
  getClientY(e: any) {
    return e.touches ? e.touches[0].clientY : e.clientY;
  }

  onTouchStart(e: any, taskId: string) {
    this.swipeState[taskId] = {
      offset: 0,
      startX: this.getClientX(e),
      startY: this.getClientY(e),
      active: true,
      state: ''
    };
  }

  onTouchMove(e: any, taskId: string) {
    const s = this.swipeState[taskId];
    if (!s || !s.active) return;

    const dx = this.getClientX(e) - s.startX;
    const dy = this.getClientY(e) - s.startY;

    // Only swipe if horizontally moving more than vertically (and enough threshold)
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
       s.offset = dx;
       if (dx > 50) s.state = 'right'; // Cancel schedule
       else if (dx < -50) s.state = 'left'; // Copy
       else s.state = '';
    }
  }

  onTouchEnd(e: any, taskId: string) {
    const s = this.swipeState[taskId];
    if (!s) return;

    if (s.state === 'right') {
        // Trigger right action (Cancel schedule)
        // Usually right swipe reveals button, we snap it open
        s.offset = 80;
    } else if (s.state === 'left') {
        // Trigger left action (Copy)
        s.offset = -80;
    } else {
        s.offset = 0;
    }

    s.active = false;

    // Auto close after 3 sec if opened
    if(s.offset !== 0) {
      setTimeout(() => {
        if(this.swipeState[taskId]) this.swipeState[taskId].offset = 0;
      }, 3000);
    }
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
      title: '',
      description: '',
      date: this.selectedDateStr,
      startTime: '',
      endTime: '',
      isUrgent: false
    };
    this.formTaskTagInput = '';
    this.showForm = true;
  }

  editTask(task: Task) {
    this.editingTask = task;
    this.formTask = { ...task };
    this.formTaskTagInput = task.tags ? task.tags.join(', ') : '';
    this.showForm = true;
  }

  saveForm() {
    if(!this.currentWorkspace || !this.currentUser) return;

    const tagsArray = this.formTaskTagInput
      ? this.formTaskTagInput.split(',').map(s => s.trim()).filter(s => s.length > 0)
      : [];

    const dataToSave = {
      workspaceId: this.currentWorkspace.id,
      title: this.formTask.title || '新代辦事項',
      description: this.formTask.description || '',
      date: this.formTask.date || null,
      startTime: this.formTask.startTime || null,
      endTime: this.formTask.endTime || null,
      tags: tagsArray,
      isUrgent: this.formTask.isUrgent || false,
      createdBy: this.formTask.createdBy || this.currentUser.id,
      status: this.formTask.status || 'pending',
      reminderOffset: this.formTask.reminderOffset || null
    };

    if (this.editingTask) {
      this.taskService.updateTask(this.editingTask.id, dataToSave);
    } else {
      this.taskService.addTask(dataToSave as any);
    }
    this.showForm = false;
  }

  copyTask(task: Task) {
     this.formTask = { ...task, title: task.title + ' (複製)', id: undefined };
     this.editingTask = null;
     this.swipeState[task.id].offset = 0; // reset swipe
     this.showForm = true;
  }

  unscheduleTask(task: Task) {
     this.taskService.updateTask(task.id, { date: null, startTime: null, endTime: null });
     this.swipeState[task.id].offset = 0;
  }

  goBack() {
    this.workspaceService.setCurrentWorkspace(null);
  }

  logout() {
    this.userService.logout();
  }
}
