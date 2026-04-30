import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

task_html = """            <!-- Main Content Container -->
            <div class="relative z-10 w-full flex items-center justify-between transition-transform duration-200 bg-milktea-50 rounded-xl cursor-pointer" (click)="editTask(task)">
              <div class="flex items-center gap-2 flex-1 min-w-0 pr-6 relative">
                 <button class="shrink-0 flex items-center justify-center w-5 h-5 rounded-full border-2 border-milktea-400 focus:outline-none"
                         [class.bg-milktea-400]="task.status === 'completed'"
                         (click)="toggleCompletion(task); $event.stopPropagation()">
                     <span *ngIf="task.status === 'completed'" class="material-icons text-white text-[12px] font-bold">check</span>
                 </button>
                 <div class="flex-1 flex flex-col justify-center min-w-0">
                    <div class="flex items-center gap-1 w-full relative">
                        <ng-container *ngIf="getCategoryForForm(task.categoryId) as cat">
                            <span *ngIf="cat.icon && !isEmoji(cat.icon)" class="material-icons text-[14px] text-milktea-500 shrink-0">{{ cat.icon }}</span>
                            <span *ngIf="cat.icon && isEmoji(cat.icon)" class="text-[14px] shrink-0">{{ cat.icon }}</span>
                        </ng-container>
                        <span class="font-bold text-sm truncate" [class.text-milktea-400]="task.status === 'completed'" [class.line-through]="task.status === 'completed'" [class.text-milktea-900]="task.status !== 'completed'">{{ task.title }}</span>
                        <span *ngIf="task.isUrgent" class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 ml-1"></span>
                    </div>
                    <div class="text-[10px] text-milktea-500 mt-0.5" *ngIf="task.startTime || task.endTime">{{ task.startTime || '' }} <ng-container *ngIf="task.endTime">- {{ task.endTime }}</ng-container></div>
                 </div>
                 <div cdkDragHandle class="absolute top-1/2 -translate-y-1/2 right-0 w-8 h-8 flex items-center justify-center cursor-move z-20 text-milktea-400 hover:bg-milktea-200 rounded" (click)="$event.stopPropagation()">
                     <span class="material-icons text-lg">drag_indicator</span>
                 </div>
              </div>
            </div>"""

old_unassigned_task = """            <!-- Main Content Container -->
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
            </div>"""

content = content.replace(old_unassigned_task, task_html)

with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
