import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UserService, User } from '../../core/services/user.service';
import { SvgIconComponent } from '../../core/svg-icon/svg-icon.component';
import { PushNotificationService } from '../../core/services/push-notification.service';
import { WebAuthnService } from '../../core/services/webauthn.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconComponent],
  template: `
    <div class="min-h-screen bg-milktea-50 flex flex-col items-center justify-center p-6">
      <h1 class="text-3xl font-bold text-milktea-900 mb-8">誰正在觀看？</h1>

      <div *ngIf="isLoadingUsers" class="flex flex-col items-center justify-center py-12">
         <svg class="animate-spin h-8 w-8 text-milktea-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
         <span class="text-milktea-600 font-bold">載入中...</span>
      </div>

      <div *ngIf="!isLoadingUsers" class="flex flex-wrap gap-6 justify-center max-w-md">
        <div *ngFor="let user of users"
             class="flex flex-col items-center gap-3 cursor-pointer group"
             (click)="selectUser(user)">
          <div class="w-24 h-24 rounded-2xl bg-white shadow-sm border-2 border-transparent group-hover:border-milktea-400 group-hover:-translate-y-1 transition-all flex items-center justify-center overflow-hidden p-2">
             <app-svg-icon [name]="user.avatar" width="100%" height="100%"></app-svg-icon>
          </div>
          <span class="text-milktea-800 font-medium group-hover:text-milktea-900">{{ user.name }}</span>
        </div>

        <div class="flex flex-col items-center gap-3 cursor-pointer group" (click)="showNewUserForm = true">
          <div class="w-24 h-24 rounded-2xl bg-white shadow-sm border-2 border-transparent group-hover:border-milktea-400 group-hover:-translate-y-1 transition-all flex items-center justify-center text-milktea-300 text-4xl">
             +
          </div>
          <span class="text-milktea-800 font-medium group-hover:text-milktea-900">新增用戶</span>
        </div>
      </div>

      <!-- PIN Code Modal -->
      <div *ngIf="showPinModal" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl flex flex-col items-center">
          <div class="w-16 h-16 rounded-2xl bg-milktea-50 overflow-hidden p-2 mb-4">
            <app-svg-icon [name]="selectedUserForPin?.avatar || ''" width="100%" height="100%"></app-svg-icon>
          </div>
          <h2 class="text-xl font-bold text-milktea-900 mb-2">輸入 PIN 碼</h2>
          <p class="text-milktea-600 text-sm mb-6">歡迎回來，{{ selectedUserForPin?.name }}</p>

          <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4"
                 [(ngModel)]="pinInput" placeholder="4位數密碼"
                 class="w-full text-center tracking-[0.5em] text-2xl font-bold bg-milktea-50 border border-milktea-200 rounded-xl px-4 py-4 mb-4 focus:outline-none focus:border-milktea-400 transition-colors"
                 (keyup.enter)="verifyPin()">

          <div *ngIf="pinError" class="text-red-500 text-sm mb-4">{{ pinError }}</div>

          <div class="flex gap-3 w-full mt-2">
            <button class="flex-1 py-3 rounded-xl bg-milktea-100 text-milktea-800 font-bold" (click)="cancelPinModal()">取消</button>
            <button class="flex-1 py-3 rounded-xl bg-milktea-600 text-white font-bold disabled:opacity-50" [disabled]="pinInput.length < 4" (click)="verifyPin()">登入</button>
          </div>
        </div>
      </div>

      <!-- New User Modal -->
      <div *ngIf="showNewUserForm" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl">
          <h2 class="text-xl font-bold text-milktea-900 mb-4">新增用戶</h2>
          <input [(ngModel)]="newUserName" placeholder="輸入名稱" class="w-full bg-milktea-50 border border-milktea-200 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-milktea-400 transition-colors">
          <div class="flex flex-wrap gap-2 mb-6 justify-center max-h-48 overflow-y-auto">
            <button *ngFor="let icon of availableIcons"
                    class="w-12 h-12 rounded-xl border-2 p-1 shrink-0"
                    [class.border-milktea-400]="newUserIcon === icon"
                    [class.border-transparent]="newUserIcon !== icon"
                    (click)="newUserIcon = icon">
              <app-svg-icon [name]="icon" width="100%" height="100%"></app-svg-icon>
            </button>
          </div>
          <div class="flex gap-3">
            <button class="flex-1 py-3 rounded-xl bg-milktea-100 text-milktea-800 font-bold" (click)="showNewUserForm = false">取消</button>
            <button class="flex-1 py-3 rounded-xl bg-milktea-600 text-white font-bold disabled:opacity-50 flex justify-center items-center gap-2" [disabled]="!newUserName.trim() || isSaving" (click)="createUser()">
              <svg *ngIf="isSaving" class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              確定
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class LoginComponent implements OnInit {
  private userService = inject(UserService);
  private router = inject(Router);
  private pushService = inject(PushNotificationService);
  private webAuthnService = inject(WebAuthnService);

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

  showPinModal = false;
  selectedUserForPin: User | null = null;
  pinInput = '';
  pinError = '';

  ngOnInit() {
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

  async selectUser(user: User) {
    if (!this.webAuthnService.isWebAuthnSupported()) {
      this.promptPin(user);
      return;
    }

    if (this.webAuthnService.hasCredential(user.id)) {
      // Authenticate
      const success = await this.webAuthnService.authenticate(user.id);
      if (success) {
        this.userService.login(user);
      } else {
        this.promptPin(user);
      }
    } else {
      // Register (First time)
      const credentialId = await this.webAuthnService.registerCredential(user.id, user.name);
      if (credentialId) {
        this.userService.login(user);
      } else {
        this.promptPin(user);
      }
    }
  }

  promptPin(user: User) {
    this.selectedUserForPin = user;
    this.showPinModal = true;
    this.pinInput = '';
    this.pinError = '';
  }

  cancelPinModal() {
    this.showPinModal = false;
    this.selectedUserForPin = null;
    this.pinInput = '';
    this.pinError = '';
  }

  verifyPin() {
    if (!this.selectedUserForPin) return;

    // Default pin is '0000' if not set
    const userPin = this.selectedUserForPin.pin || '0000';

    if (this.pinInput === userPin) {
      this.userService.login(this.selectedUserForPin);
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
