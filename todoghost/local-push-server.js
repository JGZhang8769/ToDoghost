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

        // Use a comparable integer for current absolute minutes (e.g. for simple past-time filtering)
        const currentTotalMinutes = Math.floor(now.getTime() / 60000);

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

        // 2. Get all pending tasks directly from root collection
        let totalTasksChecked = 0;

        // OPTIMIZATION: Only fetch tasks that have a date >= today's date string
        // Since "date" is "YYYY-MM-DD", string comparison works for filtering past days!
        const todayStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;

        const tasksSnapshot = await db.collection('tasks')
                                    .where('status', '==', 'pending')
                                    .where('date', '>=', todayStr)
                                    .get();

        for (const taskDoc of tasksSnapshot.docs) {
            const task = taskDoc.data();

            if (!task.date || !task.startTime || task.reminderOffset == null) continue;

            const userId = task.createdBy;
            const token = userTokens[userId];

            if (!token) continue; // Skip logging no token for efficiency on bulk processing

            // We need to calculate target trigger time directly
            const [year, month, day] = task.date.split('-').map(Number);
            let [h, m] = task.startTime.split(':').map(Number);

            // Subtract reminderOffset
            let targetTotalMinutesInDay = h * 60 + m - task.reminderOffset;

            let targetYear = year;
            let targetMonth = month;
            let targetDay = day;

            if (targetTotalMinutesInDay < 0) {
                 // VERY rough previous day calculation for edge cases (assuming same month for simplicity in local scripts)
                 targetTotalMinutesInDay += 24 * 60;
                 targetDay -= 1;
            }

            let targetHour = Math.floor(targetTotalMinutesInDay / 60);
            let targetMinute = targetTotalMinutesInDay % 60;

            const targetDateObj = new Date(targetYear, targetMonth - 1, targetDay, targetHour, targetMinute, 0, 0);
            const targetAbsoluteMinutes = Math.floor(targetDateObj.getTime() / 60000);

            // OPTIMIZATION: If the target time is strictly in the past (more than 0 minutes ago), just skip entirely!
            if (targetAbsoluteMinutes < currentTotalMinutes) {
                continue;
            }

            totalTasksChecked++;

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
                // Print debug info only for upcoming tasks in the future
                console.log(`[DEBUG] Task "${task.title}": Reminder targets ${targetStr} (System is currently ${currentHour}:${currentMinute})`);
            }
        }

        console.log(`Checked ${totalTasksChecked} upcoming pending tasks.`);

    } catch (error) {
         console.error('Error in checkTasksAndNotify:', error);
    }
}

// ALIGN TO CLOCK (Execute exactly at the 00 second mark of every minute)
function scheduleNextMinute() {
    const now = new Date();
    // Calculate how many milliseconds until the next minute starts
    const delay = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());

    console.log(`[INIT] Aligning clock. Waiting ${Math.round(delay/1000)} seconds until the next exact minute...`);

    setTimeout(() => {
        checkTasksAndNotify(); // Fire precisely at :00

        // Now that we are aligned, trigger every 60s
        setInterval(checkTasksAndNotify, 60000);
    }, delay);
}

// Run once immediately on start
checkTasksAndNotify().then(() => {
    // Schedule loop aligned to the system clock
    scheduleNextMinute();
});
