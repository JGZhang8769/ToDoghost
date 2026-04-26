import { PushNotificationService } from './app/core/services/push-notification.service';
import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig)
  .then(appRef => {
    const pushService = appRef.injector.get(PushNotificationService);
    pushService.requestPermission();
    pushService.listen();
  })
  .catch((err) => console.error(err));
