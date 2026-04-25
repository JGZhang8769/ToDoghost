importScripts("https://www.gstatic.com/firebasejs/11.0.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyDtalGul3FPNwBbENOAacwt1V2oMfi_1Ik",
  authDomain: "todoghost.firebaseapp.com",
  projectId: "todoghost",
  storageBucket: "todoghost.firebasestorage.app",
  messagingSenderId: "444427906987",
  appId: "1:444427906987:web:3ebf3d859b8a86a64f6cee"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Received background message ",
    payload
  );

  const notificationTitle = payload.notification?.title || '提醒通知';
  const notificationOptions = {
    body: payload.notification?.body,
    icon: "/icons/icon-192x192.png",
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
