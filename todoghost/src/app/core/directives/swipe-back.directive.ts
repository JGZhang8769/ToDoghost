import { Directive, ElementRef, HostListener, inject } from '@angular/core';
import { Location } from '@angular/common';

/**
 * iOS-style "swipe from the left edge to go back" gesture.
 *
 * Attached to a full-screen page's root element. While the user is dragging
 * from the left edge, the entire page slides to the right and a darkening
 * overlay fades to show the parent route underneath. If the swipe crosses
 * 30% of viewport width, we navigate back via Location.back().
 *
 * Why a directive and not a global listener?
 * - We only want this on pushed views (list, month, task detail), not the
 *   home where there's nothing to swipe back to.
 * - Each page can opt out by simply not adding the directive.
 */
@Directive({
  selector: '[appSwipeBack]',
  standalone: true,
})
export class SwipeBackDirective {
  private el = inject(ElementRef<HTMLElement>);
  private location = inject(Location);

  /** Pixels from the left edge that count as a back-swipe start. */
  private readonly edgeZone = 24;
  /** Fraction of viewport width past which the swipe commits. */
  private readonly commitFraction = 0.3;

  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private active = false;
  private locked = false;

  @HostListener('touchstart', ['$event'])
  onStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    const x = e.touches[0].clientX;
    if (x > this.edgeZone) return; // ignore taps not at the left edge
    this.active = true;
    this.locked = false;
    this.startX = x;
    this.startY = e.touches[0].clientY;
    this.currentX = 0;
    this.el.nativeElement.style.transition = 'none';
  }

  @HostListener('touchmove', ['$event'])
  onMove(e: TouchEvent) {
    if (!this.active) return;
    const dx = e.touches[0].clientX - this.startX;
    const dy = e.touches[0].clientY - this.startY;
    if (!this.locked) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        this.locked = true;
      } else if (Math.abs(dy) > 10) {
        this.cancel();
        return;
      } else {
        return;
      }
    }
    if (dx < 0) return; // only forward (rightward) drags count
    this.currentX = dx;
    this.el.nativeElement.style.transform = `translateX(${dx}px)`;
    this.el.nativeElement.style.boxShadow = `-${Math.min(40, dx / 4)}px 0 28px rgba(0,0,0,0.18)`;
    if (e.cancelable) e.preventDefault();
  }

  @HostListener('touchend')
  @HostListener('touchcancel')
  onEnd() {
    if (!this.active) return;
    this.active = false;
    const commitAt = window.innerWidth * this.commitFraction;
    if (this.currentX >= commitAt) {
      // Animate off to the right then router.back() — the leaving page
      // briefly stays on screen during the animation so the transition
      // doesn't feel like a teleport.
      this.el.nativeElement.style.transition = 'transform 0.2s ease';
      this.el.nativeElement.style.transform = `translateX(100%)`;
      setTimeout(() => {
        this.location.back();
      }, 180);
    } else {
      this.cancel();
    }
  }

  private cancel() {
    this.active = false;
    this.el.nativeElement.style.transition = 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.25s ease';
    this.el.nativeElement.style.transform = 'translateX(0)';
    this.el.nativeElement.style.boxShadow = '';
  }
}
