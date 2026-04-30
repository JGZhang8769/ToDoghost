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
    this.preventIOSSwipeNavigation();
  }

  private preventIOSSwipeNavigation() {
    let touchStartX = 0;

    document.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        touchStartX = e.touches[0].clientX;
      },
      { passive: false },
    );

    document.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        const touchCurrentX = e.touches[0].clientX;
        const windowWidth = window.innerWidth;
        if (touchStartX < 20 || touchStartX > windowWidth - 20) {
          e.preventDefault();
        }
      },
      { passive: false },
    );
  }
}
