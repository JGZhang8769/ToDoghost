import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

task_html = """              <div class="flex items-center gap-2 flex-1 min-w-0 pr-2">
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
              </div>
              <div class="flex items-center gap-2 shrink-0">
                  <div class="flex flex-col gap-1 items-center justify-center z-20">"""

old_scheduled_task = """              <div class="flex items-center gap-2 flex-1 min-w-0">
                  <div class="flex-1 flex flex-col justify-center min-w-0 pr-2 pl-2">
                    <span class="font-bold truncate" [class.text-milktea-400]="task.status === 'completed'" [class.line-through]="task.status === 'completed'" [class.text-milktea-900]="task.status !== 'completed'">{{ task.title }}</span>
                    <span class="text-[10px] text-milktea-500" *ngIf="task.startTime">{{ task.startTime }}</span>
                  </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                  <span *ngIf="task.isUrgent" class="w-2 h-2 rounded-full bg-red-500"></span>
                  <div class="flex flex-col gap-1 items-center justify-center z-20">"""

content = content.replace(old_scheduled_task, task_html)

with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
