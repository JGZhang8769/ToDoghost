import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

# Fix the parser error with (formTask | any)
content = content.replace('(change)="(formTask | any).enablePush = !(formTask | any).enablePush"', '(change)="$any(formTask).enablePush = !$any(formTask).enablePush"')
content = content.replace('[checked]="(formTask | any).enablePush"', '[checked]="$any(formTask).enablePush"')
content = content.replace('*ngIf="(formTask | any).enablePush && formTask.reminderOffset !== null"', '*ngIf="$any(formTask).enablePush && formTask.reminderOffset !== null"')

with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
