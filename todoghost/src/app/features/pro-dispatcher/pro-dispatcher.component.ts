import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Pro mode entry point. Detects whether the user is on a phone-class device
 * (touch + narrow screen) and lazy-loads either the desktop ProMainView or
 * the touch-optimised ProMobileView. Both components are full features
 * that don't share templates; this dispatcher just picks one.
 *
 * Why a runtime dispatcher instead of pure CSS RWD?
 *   - The two views differ in *interaction model*, not just layout. Mobile
 *     uses bottom sheets / push routing / swipe gestures that don't make
 *     sense on a 27" monitor and vice versa.
 *   - Keeping them as separate components means each can stay focused
 *     and easy to maintain, and the bundle for either form factor only
 *     contains its own code (the unused one is never loaded).
 *
 * Detection logic:
 *   - matchMedia `(pointer: coarse)` is the canonical "primary input is
 *     touch" signal — true on phones and tablets, false on desktops even
 *     with a touchscreen.
 *   - We additionally gate on max-width: 767px so tablets (iPad ≈ 768/1024)
 *     get the desktop Pro view, since they have screen real estate for
 *     three columns. Phones land on the mobile view.
 */
@Component({
  selector: 'app-pro-dispatcher',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (resolved()) {
      <ng-container *ngComponentOutlet="resolved()!"></ng-container>
    } @else {
      <div class="pro-dispatch-loading">載入中…</div>
    }
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .pro-dispatch-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #a3917a;
      font-size: 13px;
    }
  `],
})
export class ProDispatcherComponent implements OnInit {
  /** Once resolved, holds the lazy-loaded component class. */
  readonly resolved = signal<any>(null);

  async ngOnInit() {
    const isPhone = this.detectPhone();
    if (isPhone) {
      const m = await import('../pro-mobile-view/pro-mobile-view.component');
      this.resolved.set(m.ProMobileViewComponent);
    } else {
      const m = await import('../pro-main-view/pro-main-view.component');
      this.resolved.set(m.ProMainViewComponent);
    }
  }

  private detectPhone(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const narrowViewport = window.matchMedia('(max-width: 767px)').matches;
    return coarsePointer && narrowViewport;
  }
}
