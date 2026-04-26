const fs = require('fs');
const filepath = 'todoghost/src/app/features/main-view/main-view.component.ts';
let content = fs.readFileSync(filepath, 'utf8');

const target = `    if (!this.formTask.startTime && this.formTask.endTime) {
        alert('請先選擇開始時間，再選擇結束時間！');
        return;
    }`;

const replacement = `    if (!this.formTask.startTime && this.formTask.endTime) {
        alert('請先選擇開始時間，再選擇結束時間！');
        return;
    }

    if (this.formTask.reminderOffset && !this.formTask.startTime) {
        alert('設定提醒時間前，必須先設定開始時間！');
        return;
    }`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filepath, content);
    console.log("Replaced");
} else {
    console.log("Target not found");
}
