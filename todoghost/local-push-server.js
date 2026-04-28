const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// IMPORTANT: Put your Firebase Service Account JSON file in the project root
// and name it 'service-account.json'
const SERVICE_ACCOUNT_FILE = path.join(__dirname, 'service-account.json');

if (!fs.existsSync(SERVICE_ACCOUNT_FILE)) {
    console.error('===========================================================');
    console.error('ERROR: Could not find service-account.json');
    console.error('Please generate a Service Account key from Firebase Console:');
    console.error('Project Settings -> Service Accounts -> Generate new private key');
    console.error('And save it as "service-account.json" in the todoghost folder.');
    console.error('===========================================================');
    process.exit(1);
}

const serviceAccount = require(SERVICE_ACCOUNT_FILE);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

console.log('Firebase Admin initialized. Push notification server started.');

// Function to check and send notifications
async function checkTasksAndNotify() {
    try {
        console.log(`[${new Date().toISOString()}] Checking for due tasks...`);
        const now = new Date();

        // 1. Get all user tokens
        const tokensSnapshot = await db.collection('user_tokens').get();
        if (tokensSnapshot.empty) {
            console.log('No user tokens found.');
            return;
        }

        const userTokens = {};
        tokensSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.token) {
                userTokens[doc.id] = data.token;
            }
        });

        // 2. Get all workspaces and their pending tasks
        const workspacesSnapshot = await db.collection('workspaces').get();

        for (const workspaceDoc of workspacesSnapshot.docs) {
            const workspaceId = workspaceDoc.id;

            // Note: Since we are checking periodically, we want to find tasks that are
            // due within the NEXT minute, or just now.
            const tasksSnapshot = await db.collection(`workspaces/${workspaceId}/tasks`)
                                        .where('status', '==', 'pending')
                                        .get();

            for (const taskDoc of tasksSnapshot.docs) {
                const task = taskDoc.data();

                if (!task.date || !task.startTime || !task.reminderOffset) continue;

                // Determine user ID to send to (use createdBy, assuming it matches the user ID who generated the token)
                const userId = task.createdBy;
                const token = userTokens[userId];

                if (!token) continue; // No token for this user

                // Calculate trigger time
                const [h, m] = task.startTime.split(':').map(Number);
                const taskDate = new Date(task.date);
                taskDate.setHours(h, m, 0, 0);

                const triggerTimeMs = taskDate.getTime() - task.reminderOffset * 60000;

                // If trigger time is within the last 1 minute window (prevent duplicate sending)
                const timeDiff = now.getTime() - triggerTimeMs;

                // Using a 1-minute window: 0 to 60000 ms
                if (timeDiff >= 0 && timeDiff < 60000) {
                    console.log(`Task "${task.title}" is due! Sending push to user ${userId}...`);

                    const payload = {
                        notification: {
                            title: '即將到期的代辦事項',
                            body: `${task.title} 將於 ${task.startTime} 開始`
                        },
                        token: token,
                        // Add Apple-specific configurations for iOS background push
                        apns: {
                            payload: {
                                aps: {
                                    sound: 'default',
                                    badge: 1
                                }
                            }
                        }
                    };

                    try {
                        const response = await messaging.send(payload);
                        console.log('Successfully sent message:', response);
                    } catch (error) {
                        console.error('Error sending message:', error);
                    }
                }
            }
        }
    } catch (error) {
         console.error('Error in checkTasksAndNotify:', error);
    }
}

// Run every minute (60000 ms)
setInterval(checkTasksAndNotify, 60000);

// Run once immediately on start
checkTasksAndNotify();
