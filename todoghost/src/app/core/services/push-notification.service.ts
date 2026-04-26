import { Injectable, inject } from '@angular/core';
import { Messaging, getToken, onMessage } from '@angular/fire/messaging';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private messaging = inject(Messaging, { optional: true });
  private firestore = inject(Firestore);

  requestPermission() {
    if (!this.messaging) return;

    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        console.log('Notification permission granted.');
        getToken(this.messaging!, { vapidKey: 'BB-vGylQchRkRrPcBz1p6ucJixvaeWwSLeGnXdaCk-iTRJB5neMSG5XexyyziDylvBsT4wh65KfGd_RcXbqqtEg' }).then(token => {
            console.log('FCM Token generated');
            console.log("取得 Token:", token);
            // 將 Token 傳送到你的後端資料庫
            const userId = localStorage.getItem('currentUserId');
            if(userId && token) {
                 setDoc(doc(this.firestore, `user_tokens/${userId}`), { token, updatedAt: new Date().getTime() }, { merge: true });
            }
        }).catch(err => {
            console.log("取得 Token 出錯:", err);
        });
      } else {
        console.log('Unable to get permission to notify.');
      }
    });
  }

  listen() {
    if (!this.messaging) return;

    onMessage(this.messaging, (payload) => {
      console.log('Message received. ', payload);
      new Notification(payload.notification?.title || '提醒通知', {
        body: payload.notification?.body,
        icon: '/icons/icon-192x192.png'
      });
    });
  }
}
