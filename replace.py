import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

task_html = """                     <div class="p-1 flex items-center gap-2 w-full pr-6 relative">
                         <button class="shrink-0 flex items-center justify-center w-5 h-5 rounded-full border-2 border-milktea-400 focus:outline-none"
                                 [class.bg-milktea-400]="t.status === 'completed'"
                                 (click)="toggleCompletion(t); $event.stopPropagation()">
                             <span *ngIf="t.status === 'completed'" class="material-icons text-white text-[12px] font-bold">check</span>
                         </button>
                         <div class="flex-1 min-w-0 flex flex-col justify-center">
                             <div class="flex items-center gap-1 w-full relative">
                                 <ng-container *ngIf="getCategoryForForm(t.categoryId) as cat">
                                     <span *ngIf="cat.icon && !isEmoji(cat.icon)" class="material-icons text-[14px] text-milktea-500 shrink-0">{{ cat.icon }}</span>
                                     <span *ngIf="cat.icon && isEmoji(cat.icon)" class="text-[14px] shrink-0">{{ cat.icon }}</span>
                                 </ng-container>
                                 <span class="font-bold truncate text-sm" [class.text-milktea-400]="t.status === 'completed'" [class.line-through]="t.status === 'completed'" [class.text-milktea-900]="t.status !== 'completed'">{{ t.title }}</span>
                                 <span *ngIf="t.isUrgent" class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 ml-1"></span>
                             </div>
                             <div class="text-[10px] text-milktea-500 mt-0.5" *ngIf="t.startTime || t.endTime">{{ t.startTime || '' }} <ng-container *ngIf="t.endTime">- {{ t.endTime }}</ng-container></div>
                         </div>
                         <div cdkDragHandle class="absolute top-1/2 -translate-y-1/2 right-0 w-8 h-8 flex items-center justify-center cursor-move z-20 text-milktea-400 hover:bg-milktea-200 rounded" (click)="$event.stopPropagation()">
                             <span class="material-icons text-lg">drag_indicator</span>
                         </div>
                     </div>"""

old_week_task = """                       <div class="flex flex-col min-w-0 pr-6 w-full relative">
                           <div cdkDragHandle class="absolute top-1 right-1 w-6 h-6 flex items-center justify-center cursor-move z-20 text-milktea-400 hover:bg-milktea-100 rounded" (click)="$event.stopPropagation()">
                               <span class="material-icons text-sm">drag_indicator</span>
                           </div>
                           <span *ngIf="t.isUrgent" class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 absolute right-8 top-3"></span>
                           <span class="font-bold truncate" [class.text-milktea-400]="t.status === 'completed'" [class.line-through]="t.status === 'completed'" [class.text-milktea-900]="t.status !== 'completed'">{{ t.title }}</span>
                           <span class="text-[10px] truncate" [class.text-milktea-400]="t.status === 'completed'" [class.line-through]="t.status === 'completed'" [class.text-milktea-600]="t.status !== 'completed'" *ngIf="t.startTime">{{ t.startTime }} <ng-container *ngIf="t.endTime">- {{ t.endTime }}</ng-container></span>
                       </div>"""

content = content.replace(old_week_task, task_html)

with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
