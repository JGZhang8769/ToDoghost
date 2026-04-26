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
import { addDays, format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';

@Component({
  selector: 'app-main-view',
  standalone: true,
  imports: [CommonModule, SvgIconComponent, DragDropModule, FormsModule],
  template: `
    <div class="flex flex-col h-full bg-milktea-50 relative" cdkDropListGroup>
      <!-- Header -->
      <div class="bg-white px-4 py-3 shadow-sm border-b border-milktea-100 flex items-center justify-between z-10 ">
        <button (click)="goBack()" class="text-milktea-400 p-2 -ml-2 whitespace-nowrap">
          ← 返回
        </button>
        <div class="flex flex-col items-center flex-1 mx-4 min-w-0" (click)="editWorkspaceName()">
          <span *ngIf="!isEditingWorkspace" class="font-bold text-milktea-900 truncate w-full text-center">{{ currentWorkspace?.name || '未命名空間' }}</span>
          <input *ngIf="isEditingWorkspace" [(ngModel)]="editingWorkspaceName" (blur)="saveWorkspaceName()" (keyup.enter)="saveWorkspaceName()" class="w-full text-center bg-milktea-50 border-b border-milktea-400 focus:outline-none text-milktea-900 font-bold" autofocus>
        </div>
        <div class="flex items-center gap-2">
            <span class="text-sm font-bold text-milktea-800 hidden sm:inline" *ngIf="currentUser">Hi, {{ currentUser.name }}</span>
            <span class="text-sm font-bold text-milktea-800 sm:hidden" *ngIf="currentUser">Hi, {{ currentUser.name }}</span>
            <button (click)="logout()" class="text-milktea-600 text-sm font-bold whitespace-nowrap">登出</button>
        </div>
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
         <div class="flex items-center justify-between w-full mb-1">
             <span class="text-xs text-milktea-500">標籤與屬性過濾：</span>
             <button class="text-xs px-2 py-0.5 rounded-full border border-milktea-300 text-milktea-600" (click)="toggleFilterLogic()">
                 邏輯: <span class="font-bold">{{ filterLogicAnd ? 'AND (皆須符合)' : 'OR (符合其一)' }}</span>
             </button>
         </div>
         <button class="text-xs px-3 py-1.5 rounded-full border transition-colors"
                 [class.border-red-400]="filterUrgent" [class.bg-red-50]="filterUrgent" [class.text-red-600]="filterUrgent"
                 [class.border-milktea-200]="!filterUrgent" [class.text-milktea-500]="!filterUrgent"
                 (click)="toggleFilterUrgent(); applyFilter()">緊急</button>

         <!-- Created By Filters -->
         <ng-container *ngFor="let u of availableUsers">
           <button class="text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1"
                   [class.border-blue-400]="filterCreatedBy === u.id" [class.bg-blue-50]="filterCreatedBy === u.id" [class.text-blue-600]="filterCreatedBy === u.id"
                   [class.border-milktea-200]="filterCreatedBy !== u.id" [class.text-milktea-500]="filterCreatedBy !== u.id"
                   (click)="toggleFilterCreatedBy(u.id); applyFilter()">
               <span class="w-2 h-2 rounded-full" [class.bg-blue-500]="filterCreatedBy === u.id" [class.bg-milktea-300]="filterCreatedBy !== u.id"></span>
               {{ u.name }}
           </button>
         </ng-container>

         <div class="w-[1px] h-4 bg-milktea-200 mx-1"></div>

         <button *ngFor="let tag of availableTags" class="text-xs px-3 py-1.5 rounded-full border transition-colors"
                 [class.border-milktea-500]="filterTags.includes(tag)" [class.bg-milktea-100]="filterTags.includes(tag)" [class.text-milktea-800]="filterTags.includes(tag)"
                 [class.border-milktea-200]="!filterTags.includes(tag)" [class.text-milktea-500]="!filterTags.includes(tag)"
                 (click)="toggleFilterTag(tag)">{{ tag }}</button>

         <button class="text-xs text-milktea-400 ml-auto" (click)="clearFilter()">清除</button>
      </div>

      <!-- Main Content Area -->
      <div class="flex-1 overflow-y-auto relative pb-20" id="main-group">

        <!-- Month View -->
        <div *ngIf="viewMode === 'month'" class="p-4 h-full flex flex-col relative pb-32">
          <div class="flex justify-between items-center mb-4 sticky top-0 bg-milktea-50 z-20 pb-2 pt-4 -mt-4 -mx-4 px-4">
            <button (click)="prevMonth()" class="text-milktea-800 font-bold px-2">&lt;</button>
            <h2 class="text-xl font-bold text-milktea-900">{{ currentMonthStr }}</h2>
            <button (click)="nextMonth()" class="text-milktea-800 font-bold px-2">&gt;</button>
          </div>

          <div class="grid grid-cols-7 gap-1 text-center mb-2 text-sm text-milktea-500 font-bold sticky top-[3.5rem] bg-milktea-50 z-20 pb-2 -mx-4 px-4">
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
                 <div *ngIf="hasUrgent(d.tasks)" class="w-1.5 h-1.5 rounded-full bg-red-500 mx-auto my-1"></div>
                 <div *ngIf="!hasUrgent(d.tasks) && d.tasks.length > 0" class="w-1.5 h-1.5 rounded-full bg-milktea-400 mx-auto my-1"></div>
              </div>

              <!-- Expanded Task List (Month View) -->
              <div *ngIf="monthExpandDate === d.dateStr"
                   class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 bg-white border border-milktea-200 shadow-2xl rounded-xl z-[55] p-3"
                   (click)="$event.stopPropagation()">
                   <div class="flex justify-between items-center mb-2 border-b pb-1">
                       <span class="text-sm font-bold text-milktea-800">{{ d.dateStr }}</span>
                       <button class="text-milktea-400 hover:text-milktea-600 font-bold" (click)="monthExpandDate = null; $event.stopPropagation()">&times;</button>
                   </div>
                   <div class="max-h-[50vh] overflow-y-auto">
                   <div *ngFor="let t of d.tasks" class="relative group overflow-hidden mb-1 rounded"
                        cdkDrag [cdkDragData]="t" (cdkDragStarted)="dragStarted(t.id)" (cdkDragEnded)="dragEnded()" [class.opacity-0]="draggingId === t.id">

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
                      取消
                      </div>

                      <div class="text-xs p-1.5 bg-white hover:bg-milktea-50 cursor-pointer border border-transparent hover:border-milktea-100 flex items-center justify-between relative z-10 transition-transform duration-200"
                           [style.transform]="'translateX(' + getSwipeOffset(t.id) + 'px)'"
                           (mousedown)="onTouchStart($event, t.id)"
                           (touchstart)="onTouchStart($event, t.id)"
                           (mousemove)="onTouchMove($event, t.id)"
                           (touchmove)="onTouchMove($event, t.id)"
                           (mouseup)="onTouchEnd($event, t.id)"
                           (touchend)="onTouchEnd($event, t.id)"
                           (click)="editTask(t); monthExpandDate = null">
                        <span class="truncate pr-[32px]">{{ t.title }}</span>
                        <div class="flex items-center gap-1 absolute right-1">
                          <span *ngIf="t.isUrgent" class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
                          <div cdkDragHandle class="w-5 h-5 flex items-center justify-center cursor-move z-20 text-milktea-400 hover:bg-milktea-100 rounded" (click)="$event.stopPropagation()">
                            <span class="material-icons text-[12px]">drag_indicator</span>
                          </div>
                        </div>
                      </div>
                      <div *cdkDragPreview class="w-3 h-3 bg-red-500 rounded-full shadow-lg z-[9999]"></div>
                   </div>
                   <div *ngIf="d.tasks.length === 0" class="text-xs text-milktea-400 text-center py-2">無代辦事項</div>
                   </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Week View -->
        <div *ngIf="viewMode === 'week'" class="p-4 h-full flex flex-col relative pb-32">
          <div class="flex justify-between items-center mb-4 sticky top-0 bg-milktea-50 z-20 pb-2 pt-4 -mt-4 -mx-4 px-4">
            <button (click)="prevWeek()" class="text-milktea-800 font-bold px-2">&lt;</button>
            <h2 class="text-xl font-bold text-milktea-900">{{ currentWeekStr }}</h2>
            <button (click)="nextWeek()" class="text-milktea-800 font-bold px-2">&gt;</button>
          </div>

          <div class="flex-1 flex flex-col gap-3 pb-32 overflow-y-auto">
             <div *ngFor="let d of weekDays"
                  class="bg-white rounded-xl p-3 flex border border-milktea-100 shadow-sm min-h-[80px]"
                  [class.bg-milktea-100]="d.isToday"
                  (click)="selectDate(d.dateStr)"
                  cdkDropList
                  [cdkDropListData]="d.tasks"
                  (cdkDropListDropped)="dropToDate($event, d.dateStr)">

               <div class="flex flex-col items-center justify-center border-r border-milktea-100 pr-3 mr-3 min-w-[50px] shrink-0">
                 <div class="text-xs text-milktea-500">{{ d.dayName }}</div>
                 <div class="text-2xl font-bold text-milktea-900">{{ d.dayNum }}</div>
               </div>

               <div class="flex-1 flex flex-col gap-2 justify-center">
                 <div *ngFor="let t of d.tasks" cdkDrag [cdkDragData]="t" (cdkDragStarted)="dragStarted(t.id)" (cdkDragEnded)="dragEnded()" class="relative overflow-hidden rounded bg-milktea-50 border border-milktea-200 shadow-sm group" [class.opacity-0]="draggingId === t.id">

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

                   <div class="p-2 text-sm relative z-10 bg-milktea-50 transition-transform duration-200 flex justify-between items-center cursor-pointer"
                        [style.transform]="'translateX(' + getSwipeOffset(t.id) + 'px)'"
                        (mousedown)="onTouchStart($event, t.id)"
                        (touchstart)="onTouchStart($event, t.id)"
                        (mousemove)="onTouchMove($event, t.id)"
                        (touchmove)="onTouchMove($event, t.id)"
                        (mouseup)="onTouchEnd($event, t.id)"
                        (touchend)="onTouchEnd($event, t.id)"
                        (click)="editTask(t); $event.stopPropagation()">
                     <div class="flex flex-col min-w-0 pr-6 w-full relative">
                         <div cdkDragHandle class="absolute top-1 right-1 w-6 h-6 flex items-center justify-center cursor-move z-20 text-milktea-400 hover:bg-milktea-100 rounded" (click)="$event.stopPropagation()">
                             <span class="material-icons text-sm">drag_indicator</span>
                         </div>
                         <span *ngIf="t.isUrgent" class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 absolute right-8 top-3"></span>
                         <span class="font-bold text-milktea-900 truncate">{{ t.title }}</span>
                         <span class="text-[10px] text-milktea-600 truncate" *ngIf="t.startTime">{{ t.startTime }} <ng-container *ngIf="t.endTime">- {{ t.endTime }}</ng-container></span>
                     </div>
                   </div>
                   <div *cdkDragPreview class="w-3 h-3 bg-red-500 rounded-full shadow-lg z-[9999]"></div>
                 </div>

                 <div *ngIf="d.tasks.length === 0" class="text-sm text-milktea-400 italic py-2">
                    無代辦事項
                 </div>
               </div>
             </div>
          </div>
        </div>

        <!-- Day View (Time Axis) -->
        <div *ngIf="viewMode === 'day'" class="p-4 h-full flex flex-col relative overflow-x-hidden pb-32">
          <div class="flex justify-between items-center mb-4 sticky top-0 bg-milktea-50 z-30 pb-2 pt-4 -mt-4 -mx-4 px-4">
            <button (click)="prevDay()" class="text-milktea-800 font-bold px-2">&lt;</button>
            <h2 class="text-xl font-bold text-milktea-900">{{ selectedDateStr }}</h2>
            <button (click)="nextDay()" class="text-milktea-800 font-bold px-2">&gt;</button>
          </div>

          <!-- All Day / No Time Section -->
          <div class="mb-4 bg-white border border-milktea-200 rounded-xl p-2 shadow-sm shrink-0"
               cdkDropList
               [cdkDropListData]="allDayTasks"
               (cdkDropListDropped)="dropToAllDay($event)">
             <div class="text-xs font-bold text-milktea-500 mb-2 border-b border-milktea-100 pb-1">全天 / 未指定時間</div>
             <div class="flex flex-col gap-1 min-h-[30px]">
                <div *ngFor="let t of allDayTasks" cdkDrag [cdkDragData]="t" (cdkDragStarted)="dragStarted(t.id)" (cdkDragEnded)="dragEnded()" class="relative overflow-hidden rounded bg-milktea-100 border border-milktea-300 group" [class.opacity-0]="draggingId === t.id">
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

                   <div class="p-2 text-sm text-milktea-900 touch-none flex justify-between items-center cursor-pointer relative z-10 transition-transform duration-200 bg-milktea-100"
                        [style.transform]="'translateX(' + getSwipeOffset(t.id) + 'px)'"
                        (mousedown)="onTouchStart($event, t.id)"
                        (touchstart)="onTouchStart($event, t.id)"
                        (mousemove)="onTouchMove($event, t.id)"
                        (touchmove)="onTouchMove($event, t.id)"
                        (mouseup)="onTouchEnd($event, t.id)"
                        (touchend)="onTouchEnd($event, t.id)"
                        (click)="editTask(t)">
                     <div class="flex items-center justify-between w-full pr-6 relative">
                         <span class="truncate font-bold">{{ t.title }}</span>
                         <span *ngIf="t.isUrgent" class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 absolute right-6 top-1"></span>
                         <div cdkDragHandle class="absolute top-0 right-0 w-6 h-6 flex items-center justify-center cursor-move z-20 text-milktea-400 hover:bg-milktea-200 rounded" (click)="$event.stopPropagation()">
                             <span class="material-icons text-sm">drag_indicator</span>
                         </div>
                     </div>
                   </div>
                   <div *cdkDragPreview class="w-3 h-3 bg-red-500 rounded-full shadow-lg z-[9999]"></div>
                </div>
                <div *ngIf="allDayTasks.length === 0" class="text-xs text-milktea-400 text-center py-1">無</div>
             </div>
          </div>

          <!-- Time Grid -->
          <div class="relative flex-1 min-h-[1440px] mt-2"> <!-- 24 hours * 60px -->
             <!-- Background hours -->
             <div *ngFor="let hour of dayHours" class="absolute w-full h-[60px] border-b border-milktea-200 flex" [style.top.px]="hour * 60">
                <div class="w-12 text-xs text-milktea-400 text-right pr-2 -mt-2">{{ hour }}:00</div>
                <div class="flex-1 h-full"
                     cdkDropList
                     [cdkDropListData]="timeTasks"
                     (cdkDropListDropped)="dropToTime($event, hour, 0)">
                </div>
             </div>

             <!-- Render Tasks -->
             <div cdkDropList id="day-task-wrapper" [cdkDropListData]="timeTasks" class="absolute inset-0 z-10 pointer-events-none">
                 <div *ngFor="let t of timeTasks"
                      cdkDrag [cdkDragData]="t"
                      (cdkDragStarted)="dragStarted(t.id)" (cdkDragEnded)="dragEnded()"
                      class="absolute rounded border border-milktea-500 shadow-sm overflow-hidden text-xs touch-none hover:z-30 pointer-events-auto flex items-stretch" [class.opacity-0]="draggingId === t.id"
                      [class.bg-milktea-300]="t.endTime"
                      [class.bg-milktea-100]="!t.endTime"
                      [class.border-dashed]="!t.endTime"
                      [style.top.px]="t._top"
                      [style.height.px]="t._height"
                      [style.left]="t._left"
                      [style.width]="t._width">

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

                    <div class="w-full h-full p-1 relative z-10 transition-transform duration-200 cursor-pointer"
                         [class.bg-milktea-300]="t.endTime"
                         [class.bg-milktea-100]="!t.endTime"
                         [style.transform]="'translateX(' + getSwipeOffset(t.id) + 'px)'"
                         (mousedown)="onTouchStart($event, t.id)"
                         (touchstart)="onTouchStart($event, t.id)"
                         (mousemove)="onTouchMove($event, t.id)"
                         (touchmove)="onTouchMove($event, t.id)"
                         (mouseup)="onTouchEnd($event, t.id)"
                         (touchend)="onTouchEnd($event, t.id)"
                         (click)="editTask(t)">
                      <div cdkDragHandle class="absolute top-1 right-1 w-6 h-6 flex items-center justify-center cursor-move z-20 text-milktea-500 bg-white/50 rounded" (click)="$event.stopPropagation()">
                          <span class="material-icons text-sm">drag_indicator</span>
                      </div>
                      <span *ngIf="t.isUrgent" class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 absolute right-8 top-3"></span>
                      <div class="font-bold text-milktea-900 truncate pr-6">{{ t.title }}</div>
                      <div class="text-[10px] text-milktea-800 truncate font-mono" *ngIf="t.startTime">{{ t.startTime }} <ng-container *ngIf="t.endTime">- {{ t.endTime }}</ng-container><ng-container *ngIf="!t.endTime">- ?</ng-container></div>
                    </div>
                    <div *cdkDragPreview class="w-3 h-3 bg-red-500 rounded-full shadow-lg z-[9999]"></div>
                 </div>
             </div>
          </div>
        </div>

      </div>

      <!-- Floating Trash Can (Visible only during drag via CSS logic, but placed at root level) -->
      <div cdkDropList id="trash-list" [cdkDropListData]="[]" (cdkDropListDropped)="dropToTrash($event)"
           class="fixed top-20 right-4 w-14 h-14 bg-red-500 rounded-full flex items-center justify-center shadow-2xl z-50 border-4 border-dashed border-red-200 transition-all duration-200"
           [class.opacity-0]="!isDragging"
           [class.pointer-events-none]="!isDragging"
           [class.opacity-100]="isDragging"
           title="拖曳至此取消排程">
        <span class="text-2xl text-white">🗑️</span>
      </div>

      <!-- Bottom Drawer handle & Backdrop -->
      <div *ngIf="drawerOpen" class="fixed inset-0 bg-black/20 z-30 transition-opacity" (click)="drawerOpen = false"></div>
      <div class="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] transition-transform duration-300 z-40 max-w-3xl mx-auto "
           [style.transform]="drawerOpen ? 'translateY(0)' : 'translateY(calc(100% - 60px))'">
        <div class="h-[60px] flex items-center justify-center cursor-pointer relative" (click)="drawerOpen = !drawerOpen">
          <div class="w-12 h-1.5 bg-milktea-200 rounded-full mb-1"></div>
          <span class="absolute right-6 bg-milktea-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">未排程 ({{ unassignedTasks.length }})</span>
        </div>

        <div class="h-[50vh] overflow-y-auto px-4 pb-8 overflow-x-hidden" [class.invisible]="!drawerOpen" [class.hidden]="!drawerOpen"
             cdkDropList
             id="unassigned-list"
             [cdkDropListData]="unassignedTasks"
             (cdkDropListDropped)="dropToUnassigned($event)">
          <div *ngFor="let task of unassignedTasks"
               cdkDrag [cdkDragData]="task"
               (cdkDragStarted)="dragStarted(task.id)" (cdkDragEnded)="dragEnded()"
               class="relative bg-milktea-50 p-3 rounded-xl mb-2 shadow-sm cursor-move active:shadow-md touch-none flex items-center justify-between group overflow-hidden"
               [class.opacity-0]="draggingId === task.id">
            <div *cdkDragPreview class="w-3 h-3 bg-red-500 rounded-full shadow-lg z-[9999]"></div>
            <!-- Main Content Container -->
            <div class="relative z-10 w-full flex items-center justify-between transition-transform duration-200 bg-milktea-50 rounded-xl cursor-pointer" (click)="editTask(task)">
              <div class="flex-1 flex flex-col justify-center min-w-0 pr-2">
                <span class="font-bold text-milktea-900 truncate">{{ task.title }}</span>
                <div class="flex gap-1 mt-1 flex-wrap">
                  <span *ngFor="let tag of task.tags" class="text-[10px] bg-white border border-milktea-200 px-1.5 py-0.5 rounded text-milktea-600">{{ tag }}</span>
                </div>
              </div>
              <div cdkDragHandle class="w-8 h-8 flex items-center justify-center cursor-move z-20 text-milktea-400 hover:bg-milktea-200 rounded" (click)="$event.stopPropagation()">
                <span class="material-icons">drag_indicator</span>
              </div>
            </div>

            <div *cdkDragPreview class="w-3 h-3 bg-red-500 rounded-full shadow-lg z-[9999]"></div>
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
      <div *ngIf="showForm" class="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center p-4">
        <div class="bg-white p-6 rounded-2xl w-full max-w-sm shadow-xl relative max-h-[90vh] flex flex-col">
          <h2 class="font-bold mb-4 shrink-0">{{ editingTask?.id ? '編輯代辦' : '新增代辦' }}</h2>
          <div class="overflow-y-auto flex-1 pb-4">
            <input [(ngModel)]="formTask.title" placeholder="標題" class="w-full p-2 mb-2 border rounded">
            <textarea [(ngModel)]="formTask.description" placeholder="詳細內容" class="w-full p-2 mb-2 border rounded" rows="2"></textarea>
            <input [(ngModel)]="formTask.date" type="date" placeholder="日期" class="w-full p-2 mb-2 border rounded">
            <div class="flex gap-2 mb-2">
              <input [(ngModel)]="formTask.startTime" type="time" placeholder="開始時間" class="w-1/2 p-2 border rounded">
              <input [(ngModel)]="formTask.endTime" type="time" placeholder="結束時間" class="w-1/2 p-2 border rounded" [disabled]="!formTask.startTime">
            </div>

            <div class="flex flex-col gap-2 mb-2 border rounded p-2 bg-white">
               <div class="flex gap-2 items-center mb-1">
                   <span class="text-sm text-milktea-600 font-bold">標籤</span>
                   <label class="flex items-center gap-1 text-sm text-red-500 font-bold whitespace-nowrap ml-auto">
                       <input type="checkbox" [(ngModel)]="formTask.isUrgent" class="rounded text-red-500"> 緊急
                   </label>
               </div>
               <div class="flex flex-wrap gap-1 mb-1" *ngIf="formTaskTags.length > 0">
                   <span *ngFor="let tag of formTaskTags" class="text-xs bg-milktea-100 text-milktea-800 px-2 py-1 rounded-full flex items-center gap-1">
                       {{ tag }}
                       <button class="text-milktea-400 hover:text-red-500 font-bold" (click)="removeFormTag(tag)">&times;</button>
                   </span>
               </div>
               <input [(ngModel)]="formTaskTagInput" (keydown.enter)="addFormTag()" placeholder="輸入標籤後按 Enter" class="w-full p-2 border rounded text-sm bg-gray-50 focus:bg-white outline-none">
            </div>

            <div class="flex items-center gap-2 mb-2">
               <span class="text-sm text-milktea-600">提醒:</span>
               <select [(ngModel)]="formTask.reminderOffset" class="flex-1 p-2 border rounded bg-white text-milktea-900" [disabled]="!formTask.startTime">
                  <option [ngValue]="null">不提醒</option>
                  <option [ngValue]="15">提前 15 分鐘</option>
                  <option [ngValue]="30">提前 30 分鐘</option>
                  <option [ngValue]="60">提前 1 小時</option>
               </select>
            </div>
          </div>

          <div class="flex gap-2 justify-end mt-4 shrink-0 pt-2 border-t border-milktea-100">
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
  timeTasks: any[] = [];
  allDayTasks: any[] = [];

  // Filters
  showFilter = false;
  filterUrgent = false;
  filterTags: string[] = [];
  filterLogicAnd = false;
  filterCreatedBy: string | null = null;
  availableTags: string[] = [];
  availableUsers: User[] = [];
  filteredTasks: Task[] = [];

  // Workspace Edit
  isEditingWorkspace = false;
  editingWorkspaceName = '';

  // Form
  showForm = false;
  editingTask: Task | null = null;
  formTask: any = {};
  formTaskTagInput = '';
  formTaskTags: string[] = [];

  // Interactions
  monthExpandDate: string | null = null;
  isDragging = false;

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

    this.userService.getUsers().pipe(takeUntil(this.destroy$)).subscribe(users => {
      this.availableUsers = users;
    });
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

      if (this.filterTags.length > 0) {
          if (this.filterLogicAnd) {
             filtered = filtered.filter(t => this.filterTags.every(tag => t.tags?.includes(tag)));
          } else {
             filtered = filtered.filter(t => this.filterTags.some(tag => t.tags?.includes(tag)));
          }
      }

      // Sort by time (tasks without start time go first)
      filtered.sort((a, b) => {
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
      this.applyFilter();
  }

  toggleFilterTag(tag: string) {
     if (this.filterTags.includes(tag)) {
         this.filterTags = this.filterTags.filter(t => t !== tag);
     } else {
         this.filterTags.push(tag);
     }
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

  hasUrgent(tasks: Task[]): boolean {
    return tasks.some(t => t.isUrgent);
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

  dragStarted(taskId?: string) {
    this.isDragging = true;
    if (taskId) this.draggingId = taskId;
    this.wasDrawerOpenBeforeDrag = this.drawerOpen;
    if (this.drawerOpen) {
      this.drawerOpen = false;
    }
  }

  dragEnded() {
    this.isDragging = false;
    this.draggingId = null;
    if (this.wasDrawerOpenBeforeDrag) {
      this.drawerOpen = true;
      this.wasDrawerOpenBeforeDrag = false;
    }
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
    if (!('Notification' in window)) return;

    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
    }

    const now = new Date();
    tasks.forEach(task => {
        if (task.date && task.startTime && task.reminderOffset) {
            const [h, m] = task.startTime.split(':').map(Number);
            const taskDate = new Date(task.date);
            taskDate.setHours(h, m, 0, 0);

            const reminderTime = new Date(taskDate.getTime() - task.reminderOffset * 60000);
            const timeDiff = reminderTime.getTime() - now.getTime();

            if (this.reminderTimeouts[task.id] && this.reminderTimeouts[task.id].time === reminderTime.getTime()) {
                return;
            }

            if (this.reminderTimeouts[task.id]) {
                clearTimeout(this.reminderTimeouts[task.id].timeoutId || this.reminderTimeouts[task.id]);
                delete this.reminderTimeouts[task.id];
            }

            if (timeDiff > 0 && timeDiff < 86400000) {
               const timeoutId = setTimeout(() => {
                  if (Notification.permission === 'granted') {
                      if ('serviceWorker' in navigator) {
                          navigator.serviceWorker.ready.then(registration => {
                              registration.showNotification('即將到期的代辦事項', {
                                  body: `${task.title} 將於 ${task.startTime} 開始`,
                                  icon: '/icons/icon-192x192.png',
                                  tag: task.id
                              });
                          });
                      } else {
                          new Notification('即將到期的代辦事項', {
                              body: `${task.title} 將於 ${task.startTime} 開始`,
                              tag: task.id
                          });
                      }
                  }
               }, timeDiff);
               this.reminderTimeouts[task.id] = { timeoutId: timeoutId, time: reminderTime.getTime() };
            }
        } else {
            if (this.reminderTimeouts[task.id]) {
                clearTimeout(this.reminderTimeouts[task.id].timeoutId || this.reminderTimeouts[task.id]);
                delete this.reminderTimeouts[task.id];
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
    this.formTaskTags = [];
    this.formTaskTagInput = '';
    this.showForm = true;
  }

  editTask(task: Task) {
    const s = this.swipeState[task.id];
    if (s && (s.active || Math.abs(s.offset) > 10)) {
        return; // ignore click if swiping or swiped open
    }
    this.editingTask = task;
    this.formTask = { ...task };
    this.formTaskTags = task.tags ? [...task.tags] : [];
    this.formTaskTagInput = '';
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

  logout() {
    this.userService.logout();
  }
}
