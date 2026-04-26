const fs = require('fs');
const filepath = 'todoghost/src/main.ts';
let content = fs.readFileSync(filepath, 'utf8');

// Ensure push notification request occurs on app load
if (!content.includes('PushNotificationService')) {
    const importStmt = `import { PushNotificationService } from './app/core/services/push-notification.service';\n`;
    content = importStmt + content;

    // Quick hack to bootstrap the service
    content = content.replace(/bootstrapApplication\(AppComponent, appConfig\)\n  \.catch\(\(err\) => console\.error\(err\)\);/, `bootstrapApplication(AppComponent, appConfig)\n  .then(appRef => {\n    const pushService = appRef.injector.get(PushNotificationService);\n    pushService.requestPermission();\n    pushService.listen();\n  })\n  .catch((err) => console.error(err));`);
    fs.writeFileSync(filepath, content);
}
