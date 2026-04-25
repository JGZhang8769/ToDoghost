import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WorkspaceService, Workspace } from '../../core/services/workspace.service';
import { UserService, User } from '../../core/services/user.service';

@Component({
  selector: 'app-workspace-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-milktea-50 flex flex-col p-6">
      <div class="flex justify-between items-center mb-8">
        <h1 class="text-2xl font-bold text-milktea-900">選擇空間</h1>
        <button (click)="logout()" class="text-milktea-600 text-sm font-bold bg-white px-4 py-2 rounded-full shadow-sm">更換用戶</button>
      </div>

      <div class="flex-1 overflow-y-auto">
        <div *ngIf="workspaces.length === 0" class="text-center text-milktea-400 mt-10">
          您還沒有任何空間，請建立或加入一個。
        </div>

        <div *ngFor="let ws of workspaces"
             class="bg-white p-5 rounded-2xl shadow-sm mb-4 cursor-pointer hover:shadow-md border border-milktea-100 transition-all active:scale-[0.98]"
             (click)="enterWorkspace(ws)">
          <div class="flex justify-between items-center mb-2">
            <h2 class="text-lg font-bold text-milktea-900">{{ ws.name || '未命名空間' }}</h2>
            <span class="text-xs bg-milktea-100 text-milktea-800 px-2 py-1 rounded-full">{{ ws.users.length }}/2 人</span>
          </div>
          <div class="text-sm text-milktea-500 font-mono bg-milktea-50 p-2 rounded inline-block" *ngIf="ws.inviteCode">
            邀請碼: <span class="font-bold text-milktea-700">{{ ws.inviteCode }}</span>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="mt-auto pt-6 flex flex-col gap-3">
        <button class="w-full bg-milktea-600 text-white font-bold py-4 rounded-2xl shadow-sm active:scale-[0.98]" (click)="showNewWorkspaceForm = true">
          + 建立新空間
        </button>
        <div class="flex gap-2">
          <input [(ngModel)]="inviteCodeInput" placeholder="輸入邀請碼" class="flex-1 bg-white border border-milktea-200 rounded-2xl px-4 py-3 focus:outline-none focus:border-milktea-400 text-center font-mono placeholder:font-sans">
          <button class="bg-milktea-200 text-milktea-900 font-bold px-6 py-3 rounded-2xl active:scale-[0.98]" (click)="joinWorkspace()" [disabled]="!inviteCodeInput.trim()">
            加入
          </button>
        </div>
      </div>

      <!-- New Workspace Modal -->
      <div *ngIf="showNewWorkspaceForm" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl">
          <h2 class="text-xl font-bold text-milktea-900 mb-4">建立新空間</h2>
          <input [(ngModel)]="newWorkspaceName" placeholder="輸入空間名稱" class="w-full bg-milktea-50 border border-milktea-200 rounded-xl px-4 py-3 mb-6 focus:outline-none focus:border-milktea-400 transition-colors">
          <div class="flex gap-3">
            <button class="flex-1 py-3 rounded-xl bg-milktea-100 text-milktea-800 font-bold" (click)="showNewWorkspaceForm = false">取消</button>
            <button class="flex-1 py-3 rounded-xl bg-milktea-600 text-white font-bold disabled:opacity-50" [disabled]="!newWorkspaceName.trim()" (click)="createWorkspace()">確定</button>
          </div>
        </div>
      </div>
    </div>
  `
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
        this.router.navigate(['/main']);
      }
    });
  }

  loadWorkspaces(userId: string) {
    this.workspaceService.getWorkspacesForUser(userId).subscribe(ws => {
      this.workspaces = ws;
    });
  }

  enterWorkspace(ws: Workspace) {
    this.workspaceService.setCurrentWorkspace(ws);
  }

  async createWorkspace() {
    if(!this.currentUser || !this.newWorkspaceName.trim()) return;
    const ws = await this.workspaceService.createWorkspace(this.currentUser.id, this.newWorkspaceName.trim());
    this.showNewWorkspaceForm = false;
    this.newWorkspaceName = '';
    this.enterWorkspace(ws);
  }

  async joinWorkspace() {
    if(!this.currentUser || !this.inviteCodeInput.trim()) return;
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
