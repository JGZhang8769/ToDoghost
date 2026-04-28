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
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // 1-12
        const currentDay = now.getDate();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        console.log(`\n[${now.toLocaleString()}] Checking for due tasks...`);
        console.log(`System current time: ${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')} ${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`);

        // 1. Get all user tokens
        const tokensSnapshot = await db.collection('user_tokens').get();
        if (tokensSnapshot.empty) {
            console.log('No user tokens found in Firestore.');
            return;
        }

        const userTokens = {};
        tokensSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.token) {
                userTokens[doc.id] = data.token;
            }
        });

        console.log(`Found tokens for ${Object.keys(userTokens).length} user(s).`);

        // 2. Get all workspaces and their pending tasks
        const workspacesSnapshot = await db.collection('workspaces').get();
        let totalTasksChecked = 0;

        for (const workspaceDoc of workspacesSnapshot.docs) {
            const workspaceId = workspaceDoc.id;

            const tasksSnapshot = await db.collection(`workspaces/${workspaceId}/tasks`)
                                        .where('status', '==', 'pending')
                                        .get();

            for (const taskDoc of tasksSnapshot.docs) {
                const task = taskDoc.data();

                if (!task.date || !task.startTime || task.reminderOffset == null) continue;

                const userId = task.createdBy;
                const token = userTokens[userId];

                if (!token) {
                    console.log(`[WARNING] Found pending task "${task.title}" for user "${userId}", but no FCM token exists in user_tokens/${userId}. Skipping.`);
                    continue; // No token for this user
                }

                totalTasksChecked++;

                // We need to calculate target trigger time directly
                const [year, month, day] = task.date.split('-').map(Number);
                let [h, m] = task.startTime.split(':').map(Number);

                // Subtract reminderOffset
                let targetTotalMinutes = h * 60 + m - task.reminderOffset;

                // Handle negative minutes (rolls back to previous day, simplified handling)
                let targetYear = year;
                let targetMonth = month;
                let targetDay = day;
                let targetHour = h;
                let targetMinute = m;

                if (targetTotalMinutes < 0) {
                     // VERY rough previous day calculation for edge cases (assuming same month for simplicity in local scripts)
                     targetTotalMinutes += 24 * 60;
                     targetDay -= 1;
                }

                targetHour = Math.floor(targetTotalMinutes / 60);
                targetMinute = targetTotalMinutes % 60;

                const targetStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')} ${String(targetHour).padStart(2, '0')}:${String(targetMinute).padStart(2, '0')}`;

                // Absolute exact match check (minute precision)
                const isDateMatch = (year === currentYear && month === currentMonth && day === currentDay);
                const isTimeMatch = (targetHour === currentHour && targetMinute === currentMinute);

                if (isDateMatch && isTimeMatch) {
                    console.log(`[HIT] Task "${task.title}" is due NOW (${targetStr})! Sending push to user ${userId}...`);

                    const payload = {
                        notification: {
                            title: '即將到期的代辦事項',
                            body: `${task.title} 將於 ${task.startTime} 開始`
                        },
                        token: token,
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
                } else {
                    // Not time yet, print debug info
                    console.log(`[DEBUG] Task "${task.title}": Reminder targets ${targetStr} (System is currently ${currentHour}:${currentMinute})`);
                }
            }
        }

        console.log(`Checked ${totalTasksChecked} scheduled pending tasks with valid tokens.`);

    } catch (error) {
         console.error('Error in checkTasksAndNotify:', error);
    }
}

// Run every minute (60000 ms)
setInterval(checkTasksAndNotify, 60000);

// Run once immediately on start
checkTasksAndNotify();
