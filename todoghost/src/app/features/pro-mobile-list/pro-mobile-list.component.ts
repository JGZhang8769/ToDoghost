import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * Placeholder. The real implementation lands in the next PR — it will read
 * the :scope param (today / week / urgent / unscheduled / completed / inbox /
 * date-YYYY-MM-DD / cat-:id / cat-none / user-:id) and render the matching
 * filtered list with swipe actions and an unscheduled mover.
 */
@Component({
  selector: 'app-pro-mobile-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="stub">
      <header>
        <button (click)="back()">
          <span class="material-icons">chevron_left</span>
          返回
        </button>
        <h2>{{ scope }}</h2>
        <span></span>
      </header>
      <div class="body">
        <p>清單頁 ({{ scope }}) 還在開發中…</p>
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
export class ProMobileListComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  scope = this.route.snapshot.paramMap.get('scope') ?? '';

  back() { this.router.navigate(['/pro']); }
}
