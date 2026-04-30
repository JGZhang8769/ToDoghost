import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

task_html = """                   <button class="shrink-0 flex items-center justify-center w-5 h-5 rounded-full border-2 border-milktea-400 focus:outline-none"
                           [class.bg-milktea-400]="t.status === 'completed'"
                           (click)="toggleCompletion(t); $event.stopPropagation()">
                       <span *ngIf="t.status === 'completed'" class="material-icons text-white text-[12px] font-bold">check</span>
                   </button>
                   <div class="flex-1 min-w-0 flex flex-col justify-center cursor-pointer" (click)="editTask(t)">
                       <div class="flex items-center gap-1 w-full relative">
                           <ng-container *ngIf="getCategoryForForm(t.categoryId) as cat">
                               <span *ngIf="cat.icon && !isEmoji(cat.icon)" class="material-icons text-[14px] text-milktea-500 shrink-0">{{ cat.icon }}</span>
                               <span *ngIf="cat.icon && isEmoji(cat.icon)" class="text-[14px] shrink-0">{{ cat.icon }}</span>
                           </ng-container>
                           <span class="font-bold truncate text-sm" [class.text-milktea-400]="t.status === 'completed'" [class.line-through]="t.status === 'completed'" [class.text-milktea-900]="t.status !== 'completed'">{{ t.title }}</span>
                           <span *ngIf="t.isUrgent" class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 ml-1"></span>
                       </div>
                       <div class="text-[10px] text-milktea-500 mt-0.5" *ngIf="t.startTime || t.endTime">{{ t.startTime || '' }} <ng-container *ngIf="t.endTime">- {{ t.endTime }}</ng-container></div>
                   </div>"""

old_apple_list_task = """                   <button class="mt-0.5 shrink-0 flex items-center justify-center w-5 h-5 rounded-full border-2 border-milktea-400 focus:outline-none"
                           [class.bg-milktea-400]="t.status === 'completed'"
                           (click)="toggleCompletion(t); $event.stopPropagation()">
                       <span *ngIf="t.status === 'completed'" class="material-icons text-white text-[12px] font-bold">check</span>
                   </button>
                   <div class="flex-1 min-w-0" (click)="editTask(t)">
                       <div class="flex items-center gap-1 w-full pr-4">
                           <ng-container *ngIf="getCategoryForForm(t.categoryId) as cat">
                               <span *ngIf="cat.icon && !isEmoji(cat.icon)" class="material-icons text-[14px] text-milktea-500">{{ cat.icon }}</span>
                               <span *ngIf="cat.icon && isEmoji(cat.icon)" class="text-[14px]">{{ cat.icon }}</span>
                           </ng-container>
                           <span class="font-bold truncate" [class.text-milktea-400]="t.status === 'completed'" [class.line-through]="t.status === 'completed'" [class.text-milktea-900]="t.status !== 'completed'">{{ t.title }}</span>
                       </div>
                       <span *ngIf="t.isUrgent" class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 absolute right-3 top-4"></span>
                       <div class="text-xs text-milktea-500 mt-1" *ngIf="t.startTime">{{ t.startTime }} <ng-container *ngIf="t.endTime">- {{ t.endTime }}</ng-container></div>
                   </div>"""

content = content.replace(old_apple_list_task, task_html)

with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
