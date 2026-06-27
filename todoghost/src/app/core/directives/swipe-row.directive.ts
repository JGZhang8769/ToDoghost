import { Directive, ElementRef, EventEmitter, HostListener, Output, inject } from '@angular/core';

/**
 * iOS Mail / Reminders-style swipe actions on a single row.
 *
 * Wire-up:
 *   <div appSwipeRow
 *        (swipeComplete)="markDone(task)"
 *        (swipeDelete)="deleteTask(task)">
 *     ...row content
 *     <div class="swipe-row__bg-complete">完成</div>
 *     <div class="swipe-row__bg-delete">刪除</div>
 *   </div>
 *
 * What the directive does:
 *   - Tracks touchstart / touchmove / touchend on the host element.
 *   - As the user drags horizontally, applies `transform: translateX(...)`
 *     to the host so users see the row slide and the action background
 *     (which the host's CSS positions behind) appears.
 *   - At release, if the swipe crossed `commitThreshold` (default 96px),
 *     fires `swipeComplete` (right-swipe → completion / green) or
 *     `swipeDelete` (left-swipe → delete / red).
 *   - Otherwise springs back to 0 with a brief transition.
 *
 * The directive doesn't know about Task models; it just exposes events.
 * That keeps it reusable on the home, list, and day-list rows.
 */
@Directive({
  selector: '[appSwipeRow]',
  standalone: true,
})
export class SwipeRowDirective {
  private el = inject(ElementRef<HTMLElement>);

  @Output() swipeComplete = new EventEmitter<void>();
  @Output() swipeDelete = new EventEmitter<void>();

  /** Pixels of horizontal travel needed to commit either action. */
  private readonly commitThreshold = 96;
  /** Cap travel so users can't yank the row past the viewport. */
  private readonly maxTravel = 160;

  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private active = false;
  /** True once we decide the gesture is horizontal — locks Y. */
  private locked = false;

  @HostListener('touchstart', ['$event'])
  onStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    this.active = true;
    this.locked = false;
    this.startX = e.touches[0].clientX;
    this.startY = e.touches[0].clientY;
    this.currentX = 0;
    // No transition while dragging so the row tracks the finger 1:1.
    this.el.nativeElement.style.transition = 'none';
  }

  @HostListener('touchmove', ['$event'])
  onMove(e: TouchEvent) {
    if (!this.active) return;
    const dx = e.touches[0].clientX - this.startX;
    const dy = e.touches[0].clientY - this.startY;

    // Decide whether this is a horizontal gesture once movement crosses a
    // small threshold. If it's clearly vertical, give up so the page scrolls.
    if (!this.locked) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        this.locked = true;
      } else if (Math.abs(dy) > 10) {
        // vertical scroll wins
        this.active = false;
        this.reset();
        return;
      } else {
        return;
      }
    }

    // Only left-swipe (delete) is supported now. Drop right-swipe entirely
    // because the row already has an explicit 「完成」 circle button —
    // duplicating that as a swipe action just made the UI noisy and the
    // green background leaked through the row's translucent backdrop.
    if (dx > 0) {
      // Rubber-band only — never let the row drift to the right.
      const travel = dx / 5;
      this.currentX = travel;
      this.el.nativeElement.style.transform = `translateX(${travel}px)`;
      if (e.cancelable) e.preventDefault();
      return;
    }

    // Rubber-band past the cap so the row never flies off.
    let travel = dx;
    if (travel < -this.maxTravel) travel = -this.maxTravel + (dx + this.maxTravel) / 4;
    this.currentX = travel;
    this.el.nativeElement.style.transform = `translateX(${travel}px)`;
    if (e.cancelable) e.preventDefault();
  }

  @HostListener('touchend')
  @HostListener('touchcancel')
  onEnd() {
    if (!this.active) return;
    this.active = false;
    const x = this.currentX;
    if (x <= -this.commitThreshold) {
      this.commit('left');
    } else {
      this.reset();
    }
  }

  private commit(direction: 'left') {
    // Animate the row off-screen then fire swipeDelete. Parent usually
    // removes the row via *ngFor diff so the snap-back never plays — but
    // it's there as fallback if deletion fails.
    const target = -this.maxTravel;
    this.el.nativeElement.style.transition = 'transform 0.18s ease';
    this.el.nativeElement.style.transform = `translateX(${target}px)`;
    setTimeout(() => {
      this.swipeDelete.emit();
      this.reset();
    }, 160);
  }

  private reset() {
    this.el.nativeElement.style.transition = 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)';
    this.el.nativeElement.style.transform = 'translateX(0)';
  }
}
