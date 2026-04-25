import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UserService, User } from '../../core/services/user.service';
import { SvgIconComponent } from '../../core/svg-icon/svg-icon.component';
import { PushNotificationService } from '../../core/services/push-notification.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconComponent],
  template: `
    <div class="min-h-screen bg-milktea-50 flex flex-col items-center justify-center p-6">
      <h1 class="text-3xl font-bold text-milktea-900 mb-8">誰正在觀看？</h1>

      <div class="flex flex-wrap gap-6 justify-center max-w-md">
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

      <!-- New User Modal -->
      <div *ngIf="showNewUserForm" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl">
          <h2 class="text-xl font-bold text-milktea-900 mb-4">新增用戶</h2>
          <input [(ngModel)]="newUserName" placeholder="輸入名稱" class="w-full bg-milktea-50 border border-milktea-200 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-milktea-400 transition-colors">
          <div class="flex gap-2 mb-6 justify-center">
            <button *ngFor="let icon of availableIcons"
                    class="w-12 h-12 rounded-xl border-2 p-1"
                    [class.border-milktea-400]="newUserIcon === icon"
                    [class.border-transparent]="newUserIcon !== icon"
                    (click)="newUserIcon = icon">
              <app-svg-icon [name]="icon" width="100%" height="100%"></app-svg-icon>
            </button>
          </div>
          <div class="flex gap-3">
            <button class="flex-1 py-3 rounded-xl bg-milktea-100 text-milktea-800 font-bold" (click)="showNewUserForm = false">取消</button>
            <button class="flex-1 py-3 rounded-xl bg-milktea-600 text-white font-bold disabled:opacity-50" [disabled]="!newUserName.trim()" (click)="createUser()">確定</button>
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

  users: User[] = [];
  showNewUserForm = false;
  newUserName = '';
  newUserIcon = 'bengal';
  availableIcons = ['bengal', 'golden', 'rabbit', 'tiger'];

  ngOnInit() {
    this.userService.getUsers().subscribe(users => {
      this.users = users;
    });

    this.userService.currentUser$.subscribe(user => {
      if (user) {
        this.pushService.requestPermission();
        this.router.navigate(['/workspaces']);
      }
    });
  }

  selectUser(user: User) {
    this.userService.login(user);
  }

  async createUser() {
    if (this.newUserName.trim()) {
      await this.userService.addUser(this.newUserName.trim(), this.newUserIcon);
      this.showNewUserForm = false;
      this.newUserName = '';
    }
  }
}
