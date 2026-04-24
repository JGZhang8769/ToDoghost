import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PushNotificationService } from './core/services/push-notification.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet></router-outlet>`,
})
export class AppComponent implements OnInit {
  private pushService = inject(PushNotificationService);

  ngOnInit() {
     this.pushService.listen();
  }
}
