import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

/**
 * Placeholder. Real implementation in a follow-up PR — month grid with
 * lunar labels, dots, and a week-grain switch that shows the 24h timeline
 * like Apple Calendar.
 */
@Component({
  selector: 'app-pro-mobile-month',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="stub">
      <header>
        <button (click)="back()">
          <span class="material-icons">chevron_left</span>
          返回
        </button>
        <h2>月曆</h2>
        <span></span>
      </header>
      <div class="body">
        <p>月曆頁還在開發中…</p>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .stub { display: flex; flex-direction: column; height: 100%;
      background: linear-gradient(140deg, #f8f2e4, #efe5d2); }
    header { display: flex; align-items: center; padding: 12px; gap: 8px;
      background: rgba(255,255,255,0.7); backdrop-filter: blur(16px);
      border-bottom: 1px solid rgba(120,100,80,0.08); }
    header button { display: inline-flex; align-items: center;
      background: transparent; border: 0; color: #4a3a22; font-size: 15px;
      font-weight: 500; padding: 6px 8px; cursor: pointer; }
    header h2 { flex: 1; text-align: center; font-size: 15px; margin: 0; color: #2a1f10; }
    header span { width: 64px; }
    .body { padding: 24px; color: #7a6850; text-align: center; }
  `],
})
export class ProMobileMonthComponent {
  private router = inject(Router);
  back() { this.router.navigate(['/pro']); }
}
