const fs = require('fs');
const filepath = 'todoghost/src/app/features/main-view/main-view.component.ts';
let content = fs.readFileSync(filepath, 'utf8');

const target = `    if (this.formTask.reminderOffset && !this.formTask.startTime) {
        alert('設定提醒時間前，必須先設定開始時間！');
        return;
    }

    if (this.formTask.reminderOffset && !this.formTask.startTime) {
        alert('設定提醒時間前，必須先設定開始時間！');
        return;
    }`;

const replacement = `    if (this.formTask.reminderOffset && !this.formTask.startTime) {
        alert('設定提醒時間前，必須先設定開始時間！');
        return;
    }`;

content = content.replace(target, replacement);
fs.writeFileSync(filepath, content);
