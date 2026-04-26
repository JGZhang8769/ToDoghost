const fs = require('fs');
const filepath = 'todoghost/src/app/core/services/push-notification.service.ts';
let content = fs.readFileSync(filepath, 'utf8');

// The vapid key provided by the user is exactly the one in the codebase:
// BB-vGylQchRkRrPcBz1p6ucJixvaeWwSLeGnXdaCk-iTRJB5neMSG5XexyyziDylvBsT4wh65KfGd_RcXbqqtEg

// Let's ensure the user token is saved (for future backend usage if any) or at least printed.
content = content.replace(/\/\/ Token can be saved to user profile here./, 'console.log("Token:", token);\n            // In a real app with backend, you would send this token to your server.');
fs.writeFileSync(filepath, content);
