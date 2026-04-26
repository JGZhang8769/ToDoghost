const fs = require('fs');
const filepath = 'todoghost/src/app/features/main-view/main-view.component.ts';
let content = fs.readFileSync(filepath, 'utf8');

// The indentation in the codebase might be slightly different. Let's use a regex replace for the function.
const newFunc = `  scheduleLocalReminders(tasks: Task[]) {
    if (!('Notification' in window)) return;

    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
    }

    const now = new Date();
    tasks.forEach(task => {
        // Clear any existing timeout for this task first to prevent duplicates
        if (this.reminderTimeouts[task.id]) {
            clearTimeout(this.reminderTimeouts[task.id]);
            delete this.reminderTimeouts[task.id];
        }

        if (task.date && task.startTime && task.reminderOffset) {
            const [h, m] = task.startTime.split(':').map(Number);
            const taskDate = new Date(task.date);
            taskDate.setHours(h, m, 0, 0);

            const reminderTime = new Date(taskDate.getTime() - task.reminderOffset * 60000);
            const timeDiff = reminderTime.getTime() - now.getTime();

            // If the reminder time is in the future and within the next 24 hours, set a timeout
            if (timeDiff > 0 && timeDiff < 86400000) {
               this.reminderTimeouts[task.id] = setTimeout(() => {
                  if (Notification.permission === 'granted') {
                      if ('serviceWorker' in navigator) {
                          navigator.serviceWorker.ready.then(registration => {
                              registration.showNotification('即將到期的代辦事項', {
                                  body: \`\${task.title} 將於 \${task.startTime} 開始\`,
                                  icon: '/icons/icon-192x192.png',
                                  tag: task.id // Prevent multiple notifications for the same task
                              });
                          });
                      } else {
                          new Notification('即將到期的代辦事項', {
                              body: \`\${task.title} 將於 \${task.startTime} 開始\`,
                              tag: task.id
                          });
                      }
                  }
               }, timeDiff);
            }
        }
    });
  }`;

content = content.replace(/  scheduleLocalReminders\(tasks: Task\[\]\) \{[\s\S]*?    \}\);\n  \}/, newFunc);
fs.writeFileSync(filepath, content);
