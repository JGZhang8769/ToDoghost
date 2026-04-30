import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

task_html = """                        <div class="flex-1 min-w-0 flex flex-col justify-center">
                            <div class="flex items-center gap-1 w-full relative">
                                <span class="font-bold truncate text-xs" [class.text-milktea-400]="t.status === 'completed'" [class.line-through]="t.status === 'completed'">{{ t.title }}</span>
                                <span *ngIf="t.isUrgent" class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 ml-1"></span>
                            </div>
                            <div class="text-[10px] text-milktea-500 truncate" *ngIf="t.startTime || t.endTime">{{ t.startTime || '' }} <ng-container *ngIf="t.endTime">- {{ t.endTime }}</ng-container></div>
                        </div>"""

old_day_grid_task = """                        <span class="truncate" [class.line-through]="t.status === 'completed'">
                            <span class="font-bold mr-1">{{ t.startTime }}</span>{{ t.title }}
                        </span>"""

content = content.replace(old_day_grid_task, task_html)

with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
