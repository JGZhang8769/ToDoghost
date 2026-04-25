import { Injectable, inject } from '@angular/core';
import { Messaging, getToken, onMessage } from '@angular/fire/messaging';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private messaging = inject(Messaging, { optional: true });

  requestPermission() {
    if (!this.messaging) return;

    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        console.log('Notification permission granted.');
        getToken(this.messaging!, { vapidKey: 'BB-vGylQchRkRrPcBz1p6ucJixvaeWwSLeGnXdaCk-iTRJB5neMSG5XexyyziDylvBsT4wh65KfGd_RcXbqqtEg' }).then(token => {
            console.log('FCM Token generated');
            // Token can be saved to user profile here.
        }).catch(err => {
            console.error('An error occurred while retrieving token. ', err);
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
