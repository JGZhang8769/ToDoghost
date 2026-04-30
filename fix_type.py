import re

with open('todoghost/src/app/features/main-view/main-view.component.ts', 'r') as f:
    content = f.read()

content = content.replace("this.showTimeReminder = !!(task.startTime || task.endTime || task.enablePush);", "this.showTimeReminder = !!(task.startTime || task.endTime || (task as any).enablePush);")

with open('todoghost/src/app/features/main-view/main-view.component.ts', 'w') as f:
    f.write(content)
