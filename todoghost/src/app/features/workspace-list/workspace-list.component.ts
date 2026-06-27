import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WorkspaceService, Workspace } from '../../core/services/workspace.service';
import { UserService, User } from '../../core/services/user.service';
import { SvgIconComponent } from '../../core/svg-icon/svg-icon.component';

@Component({
  selector: 'app-workspace-list',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconComponent],
  template: `
    <div class="wsl-shell">
      <div class="wsl-bg" aria-hidden="true"></div>

      <header class="wsl-topbar">
        <app-svg-icon name="logo_main" width="26px" height="26px"></app-svg-icon>
        <div class="wsl-topbar__title">選擇空間</div>
        <button class="wsl-topbar__action" (click)="logout()" title="更換用戶">
          <span class="material-icons" style="font-size: 18px;">switch_account</span>
          <span class="wsl-topbar__actiontext">更換用戶</span>
        </button>
      </header>

      <main class="wsl-body">
        <div *ngIf="isLoadingWorkspaces" class="wsl-loading">
          <div class="wsl-spinner"></div>
          <span>載入中…</span>
        </div>

        <div *ngIf="!isLoadingWorkspaces && workspaces.length === 0" class="wsl-empty">
          <span class="material-icons wsl-empty__icon">folder_open</span>
          <p>您還沒有任何空間</p>
          <p class="wsl-empty__hint">建立或使用邀請碼加入一個空間</p>
        </div>

        <div *ngIf="!isLoadingWorkspaces && workspaces.length > 0" class="wsl-list">
          <button *ngFor="let ws of workspaces"
                  type="button"
                  class="wsl-card"
                  (click)="enterWorkspace(ws)">
            <span class="wsl-card__icon">
              <span class="material-icons" style="font-size: 22px;">workspaces</span>
            </span>
            <span class="wsl-card__main">
              <span class="wsl-card__name">{{ ws.name || '未命名空間' }}</span>
              <span class="wsl-card__meta" *ngIf="ws.inviteCode">
                邀請碼 · <span class="wsl-card__code">{{ ws.inviteCode }}</span>
              </span>
            </span>
            <span class="wsl-card__count">{{ ws.users.length }}/2</span>
            <span class="material-icons wsl-card__chev">chevron_right</span>
          </button>
        </div>
      </main>

      <footer class="wsl-foot">
        <button class="wsl-btn wsl-btn--primary" (click)="showNewWorkspaceForm = true">
          <span class="material-icons" style="font-size: 18px;">add</span>
          建立新空間
        </button>
        <div class="wsl-join">
          <input [(ngModel)]="inviteCodeInput"
                 placeholder="輸入邀請碼"
                 class="wsl-join__input">
          <button class="wsl-btn wsl-btn--ghost"
                  (click)="joinWorkspace()"
                  [disabled]="!inviteCodeInput.trim()">加入</button>
        </div>
      </footer>

      <!-- New Workspace Modal -->
      <div *ngIf="showNewWorkspaceForm" class="wsl-scrim" (click)="showNewWorkspaceForm = false">
        <div class="wsl-modal" (click)="$event.stopPropagation()">
          <h2 class="wsl-modal__title">建立新空間</h2>
          <input [(ngModel)]="newWorkspaceName"
                 placeholder="輸入空間名稱"
                 class="wsl-modal__input"
                 autofocus>
          <div class="wsl-modal__pair">
            <button class="wsl-btn wsl-btn--ghost" (click)="showNewWorkspaceForm = false">取消</button>
            <button class="wsl-btn wsl-btn--primary"
                    [disabled]="!newWorkspaceName.trim() || isSaving"
                    (click)="createWorkspace()">
              <span *ngIf="isSaving" class="wsl-spinner wsl-spinner--sm"></span>
              確定
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .wsl-shell {
      position: relative;
      height: 100%;
      display: flex;
      flex-direction: column;
      color: #2a1f10;
      box-sizing: border-box;
    }
    .wsl-shell *, .wsl-shell *::before, .wsl-shell *::after { box-sizing: border-box; }

    .wsl-bg {
      position: absolute; inset: 0; z-index: 0; pointer-events: none;
      background:
        radial-gradient(120% 80% at 0% 0%, #f4e9d3 0%, transparent 60%),
        radial-gradient(100% 80% at 100% 100%, #f0dccc 0%, transparent 60%),
        linear-gradient(170deg, #f8f2e4 0%, #efe5d2 60%, #f3e5d6 100%);
    }

    /* Topbar */
    .wsl-topbar {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 12px;
      padding:
        max(8px, env(safe-area-inset-top))
        max(14px, env(safe-area-inset-right))
        8px
        max(14px, env(safe-area-inset-left));
      background: rgba(255, 255, 255, 0.78);
      backdrop-filter: blur(16px) saturate(160%);
      -webkit-backdrop-filter: blur(16px) saturate(160%);
      border-bottom: 1px solid rgba(120, 100, 80, 0.08);
      flex-shrink: 0;
    }
    .wsl-topbar__title {
      flex: 1;
      font-size: 15px;
      font-weight: 700;
      color: #2a1f10;
    }
    .wsl-topbar__action {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 0;
      background: rgba(120, 100, 80, 0.1);
      color: #4a3a22;
      font-size: 13px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 999px;
      cursor: pointer;
      font-family: inherit;
    }
    .wsl-topbar__action:active { background: rgba(120, 100, 80, 0.22); }
    .wsl-topbar__actiontext { display: inline; }
    @media (max-width: 380px) {
      .wsl-topbar__actiontext { display: none; }
      .wsl-topbar__action { padding: 8px; }
    }

    /* Body */
    .wsl-body {
      position: relative;
      z-index: 1;
      flex: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: 18px 18px 8px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .wsl-loading {
      margin: 48px auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: #7a6850;
      font-weight: 600;
    }
    .wsl-spinner {
      width: 28px;
      height: 28px;
      border: 3px solid rgba(120, 100, 80, 0.18);
      border-top-color: #b58535;
      border-radius: 50%;
      animation: wsl-spin 0.8s linear infinite;
    }
    .wsl-spinner--sm { width: 16px; height: 16px; border-width: 2px; }
    @keyframes wsl-spin { to { transform: rotate(360deg); } }

    .wsl-empty {
      margin: 56px auto;
      text-align: center;
      color: #a3917a;
    }
    .wsl-empty__icon {
      font-size: 48px;
      color: #c4b59a;
    }
    .wsl-empty p { margin: 6px 0 0; font-size: 15px; font-weight: 600; color: #7a6850; }
    .wsl-empty__hint { font-size: 13px !important; font-weight: 500 !important; color: #a3917a !important; }

    .wsl-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .wsl-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border: 1px solid rgba(255, 255, 255, 0.6);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.65);
      backdrop-filter: blur(16px) saturate(160%);
      -webkit-backdrop-filter: blur(16px) saturate(160%);
      box-shadow: 0 4px 14px -8px rgba(60, 40, 20, 0.18);
      cursor: pointer;
      font-family: inherit;
      text-align: left;
      color: #2a1f10;
      transition: transform 0.12s ease, box-shadow 0.12s ease;
    }
    .wsl-card:active {
      transform: scale(0.98);
      box-shadow: 0 2px 8px -4px rgba(60, 40, 20, 0.22);
    }
    .wsl-card__icon {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: linear-gradient(135deg, #d4a64a, #b58535);
      color: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 4px 10px -4px rgba(180, 120, 40, 0.45);
    }
    .wsl-card__main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .wsl-card__name {
      font-size: 16px;
      font-weight: 700;
      color: #2a1f10;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .wsl-card__meta {
      font-size: 12px;
      color: #7a6850;
    }
    .wsl-card__code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-weight: 700;
      color: #b58535;
      letter-spacing: 0.05em;
    }
    .wsl-card__count {
      font-size: 12px;
      font-weight: 700;
      color: #4a3a22;
      background: rgba(120, 100, 80, 0.12);
      padding: 4px 10px;
      border-radius: 999px;
      flex-shrink: 0;
      font-variant-numeric: tabular-nums;
    }
    .wsl-card__chev {
      color: #c4b59a;
      font-size: 20px;
      flex-shrink: 0;
    }

    /* Footer */
    .wsl-foot {
      position: relative;
      z-index: 2;
      padding:
        12px
        max(14px, env(safe-area-inset-right))
        max(14px, env(safe-area-inset-bottom))
        max(14px, env(safe-area-inset-left));
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: rgba(255, 255, 255, 0.55);
      backdrop-filter: blur(16px) saturate(160%);
      -webkit-backdrop-filter: blur(16px) saturate(160%);
      border-top: 1px solid rgba(120, 100, 80, 0.08);
      flex-shrink: 0;
    }
    .wsl-join {
      display: flex;
      gap: 8px;
    }
    .wsl-join__input {
      flex: 1;
      padding: 12px 14px;
      background: rgba(255, 255, 255, 0.85);
      border: 1px solid rgba(120, 100, 80, 0.18);
      border-radius: 12px;
      font-size: 15px;
      color: #2a1f10;
      outline: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      text-align: center;
      letter-spacing: 0.1em;
    }
    .wsl-join__input::placeholder {
      font-family: inherit;
      letter-spacing: 0;
      color: #a3917a;
    }
    .wsl-join__input:focus {
      border-color: rgba(180, 120, 40, 0.55);
      box-shadow: 0 0 0 3px rgba(212, 166, 74, 0.18);
    }

    .wsl-btn {
      padding: 13px 16px;
      border: 0;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .wsl-btn--primary {
      background: linear-gradient(135deg, #d4a64a, #b58535);
      color: #fff;
      box-shadow: 0 4px 12px rgba(180, 120, 40, 0.35);
    }
    .wsl-btn--primary:disabled {
      background: rgba(120, 100, 80, 0.18);
      color: #a3917a;
      box-shadow: none;
      cursor: not-allowed;
    }
    .wsl-btn--ghost {
      background: rgba(120, 100, 80, 0.12);
      color: #4a3a22;
    }
    .wsl-btn--ghost:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .wsl-btn--ghost:active:not(:disabled) { background: rgba(120, 100, 80, 0.24); }

    /* Modal */
    .wsl-scrim {
      position: fixed;
      inset: 0;
      z-index: 200;
      background: rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      animation: wsl-fade 0.18s ease;
    }
    @keyframes wsl-fade { from { opacity: 0; } to { opacity: 1; } }
    .wsl-modal {
      background: rgba(255, 255, 255, 0.97);
      backdrop-filter: blur(28px) saturate(160%);
      -webkit-backdrop-filter: blur(28px) saturate(160%);
      border-radius: 20px;
      width: 320px;
      max-width: calc(100vw - 32px);
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: 0 24px 56px rgba(60, 40, 20, 0.25);
    }
    .wsl-modal__title {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      color: #2a1f10;
      text-align: center;
    }
    .wsl-modal__input {
      padding: 12px 14px;
      background: rgba(244, 233, 211, 0.5);
      border: 1px solid rgba(120, 100, 80, 0.18);
      border-radius: 12px;
      font-size: 15px;
      color: #2a1f10;
      outline: 0;
      font-family: inherit;
    }
    .wsl-modal__input:focus {
      border-color: rgba(180, 120, 40, 0.55);
      box-shadow: 0 0 0 3px rgba(212, 166, 74, 0.18);
    }
    .wsl-modal__pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
  `]
})
export class WorkspaceListComponent implements OnInit {
  private workspaceService = inject(WorkspaceService);
  private userService = inject(UserService);
  private router = inject(Router);

  currentUser: User | null = null;
  workspaces: Workspace[] = [];
  inviteCodeInput = '';
  showNewWorkspaceForm = false;
  newWorkspaceName = '';
  isSaving = false;
  isLoadingWorkspaces = true;

  ngOnInit() {
    this.userService.currentUser$.subscribe(user => {
      if (!user) {
        this.router.navigate(['/login']);
        return;
      }
      this.currentUser = user;
      this.loadWorkspaces(user.id);
    });

    this.workspaceService.currentWorkspace$.subscribe(ws => {
      if (ws) {
        this.router.navigate(['/pro']);
      }
    });
  }

  loadWorkspaces(userId: string) {
    this.workspaceService.getWorkspacesForUser(userId).subscribe(ws => {
      this.workspaces = ws;
      this.isLoadingWorkspaces = false;
    });
  }

  enterWorkspace(ws: Workspace) {
    this.workspaceService.setCurrentWorkspace(ws);
  }

  async createWorkspace() {
    if (!this.currentUser || !this.newWorkspaceName.trim()) return;
    this.isSaving = true;
    try {
      const ws = await this.workspaceService.createWorkspace(this.currentUser.id, this.newWorkspaceName.trim());
      this.showNewWorkspaceForm = false;
      this.newWorkspaceName = '';
      this.enterWorkspace(ws);
    } finally {
      this.isSaving = false;
    }
  }

  async joinWorkspace() {
    if (!this.currentUser || !this.inviteCodeInput.trim()) return;
    const success = await this.workspaceService.joinWorkspaceByCode(this.currentUser.id, this.inviteCodeInput.trim().toUpperCase());
    if (success) {
      this.inviteCodeInput = '';
      alert('成功加入空間！');
    } else {
      alert('加入失敗，邀請碼錯誤或空間已滿。');
    }
  }

  logout() {
    this.userService.logout();
  }
}
