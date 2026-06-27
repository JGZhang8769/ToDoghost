import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UserService, User } from '../../core/services/user.service';
import { SvgIconComponent } from '../../core/svg-icon/svg-icon.component';
import { PushNotificationService } from '../../core/services/push-notification.service';
import { WebAuthnService } from '../../core/services/webauthn.service';
import { ConfigService } from '../../core/services/config.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconComponent],
  template: `
    <div class="login-shell">
      <div class="login-bg" aria-hidden="true"></div>

      <div class="login-content">
        <header class="login-head">
          <app-svg-icon name="logo_main" width="56px" height="56px"></app-svg-icon>
          <h1 class="login-title">誰正在觀看？</h1>
          <p class="login-sub">選擇你的個人檔案以繼續</p>
        </header>

        <div *ngIf="isLoadingUsers" class="login-loading">
          <div class="login-spinner"></div>
          <span>載入中…</span>
        </div>

        <div *ngIf="!isLoadingUsers" class="login-grid">
          <button *ngFor="let user of users"
                  type="button"
                  class="login-card"
                  (click)="openLoginOptions(user)">
            <span class="login-card__face">
              <app-svg-icon [name]="user.avatar" width="100%" height="100%"></app-svg-icon>
            </span>
            <span class="login-card__name">{{ user.name }}</span>
          </button>

          <button type="button" class="login-card login-card--add" (click)="showNewUserForm = true">
            <span class="login-card__face login-card__face--add">
              <span class="material-icons" style="font-size: 32px;">add</span>
            </span>
            <span class="login-card__name">新增用戶</span>
          </button>
        </div>
      </div>

      <!-- Login Options Modal -->
      <div *ngIf="showLoginOptionsModal" class="login-scrim" (click)="closeLoginOptions()">
        <div class="login-modal" (click)="$event.stopPropagation()">
          <div class="login-modal__face">
            <app-svg-icon [name]="selectedUser?.avatar || ''" width="100%" height="100%"></app-svg-icon>
          </div>
          <h2 class="login-modal__title">登入選項</h2>
          <p class="login-modal__sub">選擇登入 {{ selectedUser?.name }} 的方式</p>

          <div class="login-modal__actions">
            <button *ngIf="isWebAuthnSupported"
                    type="button"
                    class="login-btn login-btn--primary"
                    [disabled]="isAuthenticating"
                    (click)="triggerWebAuthn()">
              <span *ngIf="isAuthenticating" class="login-spinner login-spinner--sm"></span>
              {{ hasCredential ? 'Face ID 登入' : '綁定 Face ID 登入' }}
            </button>
            <button type="button" class="login-btn login-btn--ghost" (click)="switchToPin()">
              PIN 碼登入
            </button>
          </div>

          <button type="button" class="login-modal__cancel" (click)="closeLoginOptions()">取消</button>
        </div>
      </div>

      <!-- PIN Code Modal -->
      <div *ngIf="showPinModal" class="login-scrim" (click)="cancelPinModal()">
        <div class="login-modal" (click)="$event.stopPropagation()">
          <div class="login-modal__face">
            <app-svg-icon [name]="selectedUser?.avatar || ''" width="100%" height="100%"></app-svg-icon>
          </div>
          <h2 class="login-modal__title">輸入 PIN 碼</h2>
          <p class="login-modal__sub">歡迎回來，{{ selectedUser?.name }}</p>

          <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4"
                 [(ngModel)]="pinInput" placeholder="4 位數密碼"
                 class="login-pin"
                 (keyup.enter)="verifyPin()">

          <div *ngIf="pinError" class="login-error">{{ pinError }}</div>

          <div class="login-modal__pair">
            <button type="button" class="login-btn login-btn--ghost" (click)="cancelPinModal()">取消</button>
            <button type="button" class="login-btn login-btn--primary"
                    [disabled]="pinInput.length < 4"
                    (click)="verifyPin()">登入</button>
          </div>
        </div>
      </div>

      <!-- New User Modal -->
      <div *ngIf="showNewUserForm" class="login-scrim" (click)="showNewUserForm = false">
        <div class="login-modal" (click)="$event.stopPropagation()">
          <h2 class="login-modal__title">新增用戶</h2>
          <input [(ngModel)]="newUserName" placeholder="輸入名稱" class="login-input">
          <div class="login-iconpicker">
            <button *ngFor="let icon of availableIcons"
                    type="button"
                    class="login-iconpicker__cell"
                    [class.is-active]="newUserIcon === icon"
                    (click)="newUserIcon = icon">
              <app-svg-icon [name]="icon" width="100%" height="100%"></app-svg-icon>
            </button>
          </div>
          <div class="login-modal__pair">
            <button type="button" class="login-btn login-btn--ghost" (click)="showNewUserForm = false">取消</button>
            <button type="button" class="login-btn login-btn--primary"
                    [disabled]="!newUserName.trim() || isSaving"
                    (click)="createUser()">
              <span *ngIf="isSaving" class="login-spinner login-spinner--sm"></span>
              確定
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .login-shell {
      position: relative;
      min-height: 100%;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      color: #2a1f10;
      padding:
        max(24px, env(safe-area-inset-top))
        max(20px, env(safe-area-inset-right))
        max(24px, env(safe-area-inset-bottom))
        max(20px, env(safe-area-inset-left));
    }

    .login-bg {
      position: absolute; inset: 0; z-index: 0; pointer-events: none;
      background:
        radial-gradient(120% 80% at 0% 0%, #f4e9d3 0%, transparent 60%),
        radial-gradient(100% 80% at 100% 100%, #f0dccc 0%, transparent 60%),
        linear-gradient(170deg, #f8f2e4 0%, #efe5d2 60%, #f3e5d6 100%);
    }

    .login-content {
      position: relative;
      z-index: 1;
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 32px;
      max-width: 720px;
      margin: 0 auto;
      width: 100%;
    }

    .login-head {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .login-title {
      margin: 4px 0 0;
      font-size: 28px;
      font-weight: 800;
      color: #2a1f10;
      letter-spacing: -0.02em;
    }
    .login-sub {
      margin: 0;
      font-size: 14px;
      color: #7a6850;
    }

    .login-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: #7a6850;
      font-weight: 600;
    }

    .login-spinner {
      width: 28px;
      height: 28px;
      border: 3px solid rgba(120, 100, 80, 0.18);
      border-top-color: #b58535;
      border-radius: 50%;
      animation: login-spin 0.8s linear infinite;
    }
    .login-spinner--sm {
      width: 16px;
      height: 16px;
      border-width: 2px;
    }
    @keyframes login-spin { to { transform: rotate(360deg); } }

    /* Netflix-style avatar grid */
    .login-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      justify-content: center;
      max-width: 560px;
    }
    .login-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      background: transparent;
      border: 0;
      padding: 0;
      cursor: pointer;
      font: inherit;
      color: inherit;
    }
    .login-card__face {
      width: 96px;
      height: 96px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.75);
      backdrop-filter: blur(16px) saturate(160%);
      -webkit-backdrop-filter: blur(16px) saturate(160%);
      border: 2px solid transparent;
      box-shadow: 0 6px 18px -8px rgba(60, 40, 20, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
      transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
    }
    .login-card:hover .login-card__face {
      transform: translateY(-4px);
      border-color: rgba(212, 166, 74, 0.7);
      box-shadow: 0 12px 24px -10px rgba(180, 120, 40, 0.35);
    }
    .login-card:active .login-card__face { transform: scale(0.97); }
    .login-card__face--add {
      color: #a3917a;
      background: rgba(255, 255, 255, 0.45);
      border: 2px dashed rgba(120, 100, 80, 0.3);
    }
    .login-card__name {
      font-size: 14px;
      font-weight: 600;
      color: #4a3a22;
    }

    /* Modals */
    .login-scrim {
      position: fixed;
      inset: 0;
      z-index: 200;
      background: rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      animation: login-fade 0.18s ease;
    }
    @keyframes login-fade { from { opacity: 0; } to { opacity: 1; } }
    .login-modal {
      background: rgba(255, 255, 255, 0.97);
      backdrop-filter: blur(28px) saturate(160%);
      -webkit-backdrop-filter: blur(28px) saturate(160%);
      border-radius: 20px;
      width: 320px;
      max-width: calc(100vw - 32px);
      padding: 22px 20px 18px;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
      box-shadow: 0 24px 56px rgba(60, 40, 20, 0.25);
    }
    .login-modal__face {
      width: 64px;
      height: 64px;
      border-radius: 16px;
      background: rgba(244, 233, 211, 0.7);
      padding: 6px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-modal__title {
      margin: 4px 0 0;
      font-size: 18px;
      font-weight: 700;
      color: #2a1f10;
      text-align: center;
    }
    .login-modal__sub {
      margin: 0 0 6px;
      font-size: 13px;
      color: #7a6850;
      text-align: center;
    }
    .login-modal__actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .login-modal__pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .login-modal__cancel {
      align-self: center;
      background: transparent;
      border: 0;
      color: #7a6850;
      font-size: 14px;
      font-weight: 500;
      padding: 6px 12px;
      cursor: pointer;
    }
    .login-modal__cancel:active { color: #4a3a22; }

    .login-btn {
      padding: 12px 14px;
      border: 0;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .login-btn--primary {
      background: linear-gradient(135deg, #d4a64a, #b58535);
      color: #fff;
      box-shadow: 0 2px 6px rgba(180, 120, 40, 0.3);
    }
    .login-btn--primary:disabled {
      background: rgba(120, 100, 80, 0.18);
      color: #a3917a;
      box-shadow: none;
      cursor: not-allowed;
    }
    .login-btn--ghost {
      background: rgba(120, 100, 80, 0.1);
      color: #4a3a22;
    }
    .login-btn--ghost:active { background: rgba(120, 100, 80, 0.22); }

    .login-input,
    .login-pin {
      padding: 12px 14px;
      background: rgba(244, 233, 211, 0.5);
      border: 1px solid rgba(120, 100, 80, 0.18);
      border-radius: 12px;
      font-size: 15px;
      color: #2a1f10;
      outline: 0;
      font-family: inherit;
    }
    .login-input:focus,
    .login-pin:focus {
      border-color: rgba(180, 120, 40, 0.55);
      box-shadow: 0 0 0 3px rgba(212, 166, 74, 0.18);
    }
    .login-pin {
      text-align: center;
      letter-spacing: 0.5em;
      font-size: 22px;
      font-weight: 700;
    }
    .login-error {
      color: #dc2626;
      font-size: 13px;
      text-align: center;
    }

    .login-iconpicker {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
      max-height: 184px;
      overflow-y: auto;
      padding: 4px;
      background: rgba(244, 233, 211, 0.4);
      border-radius: 12px;
    }
    .login-iconpicker__cell {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      border: 2px solid transparent;
      background: rgba(255, 255, 255, 0.7);
      padding: 4px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .login-iconpicker__cell.is-active {
      border-color: #b58535;
      background: rgba(255, 255, 255, 0.95);
    }
  `]
})
export class LoginComponent implements OnInit {
  private userService = inject(UserService);
  private router = inject(Router);
  private pushService = inject(PushNotificationService);
  private webAuthnService = inject(WebAuthnService);
  private configService = inject(ConfigService);

  users: User[] = [];
  showNewUserForm = false;
  newUserName = '';
  newUserIcon = 'bengal';
  availableIcons = [
    'bengal', 'golden', 'rabbit', 'tiger',
    'cute_tiger', 'cute_bengal', 'leopard',
    'black_cat', 'white_cat', 'boy', 'girl'
  ];
  isSaving = false;
  isLoadingUsers = true;

  showLoginOptionsModal = false;
  showPinModal = false;
  selectedUser: User | null = null;
  pinInput = '';
  pinError = '';

  isWebAuthnSupported = false;
  hasCredential = false;
  isAuthenticating = false;
  isLoginAuthRequired = false;

  ngOnInit() {
    this.isWebAuthnSupported = this.webAuthnService.isWebAuthnSupported();

    this.configService.getLoginAuthFeatureFlag().subscribe(valid => {
      this.isLoginAuthRequired = valid;
    });

    this.userService.getUsers().subscribe(users => {
      this.users = users;
      this.isLoadingUsers = false;
    });

    this.userService.currentUser$.subscribe(user => {
      if (user) {
        this.pushService.requestPermission();
        this.router.navigate(['/workspaces']);
      }
    });
  }

  openLoginOptions(user: User) {
    if (this.isAuthenticating) return;

    if (!this.isLoginAuthRequired) {
      this.userService.login(user);
      return;
    }

    this.selectedUser = user;
    this.hasCredential = this.webAuthnService.hasCredential(user.id);
    this.showLoginOptionsModal = true;
  }

  closeLoginOptions() {
    if (this.isAuthenticating) {
      this.webAuthnService.cancelRequest();
      this.isAuthenticating = false;
    }
    this.showLoginOptionsModal = false;
    this.selectedUser = null;
  }

  async triggerWebAuthn() {
    if (!this.selectedUser || this.isAuthenticating) return;

    this.isAuthenticating = true;
    try {
      if (this.hasCredential) {
        const success = await this.webAuthnService.authenticate(this.selectedUser.id);
        if (success) {
          this.userService.login(this.selectedUser);
          this.showLoginOptionsModal = false;
        }
      } else {
        const credentialId = await this.webAuthnService.registerCredential(this.selectedUser.id, this.selectedUser.name);
        if (credentialId) {
          this.userService.login(this.selectedUser);
          this.showLoginOptionsModal = false;
        }
      }
    } finally {
      this.isAuthenticating = false;
    }
  }

  switchToPin() {
    if (this.isAuthenticating) {
      this.webAuthnService.cancelRequest();
      this.isAuthenticating = false;
    }
    this.showLoginOptionsModal = false;
    this.showPinModal = true;
    this.pinInput = '';
    this.pinError = '';
  }

  cancelPinModal() {
    this.showPinModal = false;
    this.selectedUser = null;
    this.pinInput = '';
    this.pinError = '';
  }

  verifyPin() {
    if (!this.selectedUser) return;

    const userPin = this.selectedUser.pin || '0000';

    if (this.pinInput === userPin) {
      this.userService.login(this.selectedUser);
      this.showPinModal = false;
    } else {
      this.pinError = 'PIN 碼錯誤';
      this.pinInput = '';
    }
  }

  async createUser() {
    if (this.newUserName.trim()) {
      this.isSaving = true;
      try {
         await this.userService.addUser(this.newUserName.trim(), this.newUserIcon);
         this.showNewUserForm = false;
         this.newUserName = '';
      } finally {
         this.isSaving = false;
      }
    }
  }
}
