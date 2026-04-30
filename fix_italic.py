import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

# Fix italic "無代辦事項"
old_italic_week = """<div *ngIf="getTasksForDateStr(weekDate.dateStr).length === 0" class="text-xs text-milktea-400 italic flex items-center justify-center h-full min-h-[40px]">
                    無代辦事項
                  </div>"""

new_italic_week = """<div *ngIf="getTasksForDateStr(weekDate.dateStr).length === 0" class="text-xs text-milktea-400 flex items-center justify-center h-full min-h-[40px]">
                    無代辦事項
                  </div>"""

content = content.replace(old_italic_week, new_italic_week)

with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
