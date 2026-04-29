import { Component, inject, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { WorkspaceService, Workspace } from '../../core/services/workspace.service';
import { CategoryService, Category } from '../../core/services/category.service';
import { UserService } from '../../core/services/user.service';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  template: `
    <div class="flex flex-col h-full bg-milktea-50">
      <!-- Header -->
      <div class="bg-white px-4 py-3 shadow-sm border-b border-milktea-100 flex items-center relative">
        <button (click)="goBack()" class="text-milktea-400 p-2 -ml-2 whitespace-nowrap absolute left-4">
          ← 返回
        </button>
        <h1 class="text-lg font-bold text-milktea-900 mx-auto">空間設定</h1>
      </div>

      <!-- Content -->
      <div class="flex-1 p-4 overflow-y-auto">
        <div class="bg-white rounded-xl shadow-sm border border-milktea-100 p-4 mb-4 cursor-pointer hover:bg-milktea-50 transition-colors" (click)="openCategoryDrawer()">
          <div class="flex justify-between items-center">
            <div class="flex items-center gap-3">
              <span class="material-icons text-milktea-500">category</span>
              <span class="font-bold text-milktea-900">分類管理</span>
            </div>
            <span class="material-icons text-milktea-400">chevron_right</span>
          </div>
          <p class="text-xs text-milktea-500 mt-2 pl-9">設定與排序空間的自訂任務分類清單</p>
        </div>
      </div>

      <!-- Category Drawer -->
      <div *ngIf="showCategoryDrawer" class="fixed inset-0 bg-black/20 z-[60] transition-opacity" (click)="closeCategoryDrawer()"></div>
      <div class="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] transition-transform duration-300 z-[65] max-w-3xl mx-auto flex flex-col"
           [style.transform]="showCategoryDrawer ? 'translateY(0)' : 'translateY(100%)'">
        <div class="p-4 border-b border-milktea-100 flex justify-between items-center shrink-0">
           <h2 class="font-bold text-milktea-900 text-lg">分類清單管理</h2>
           <button class="material-icons text-milktea-400" (click)="closeCategoryDrawer()">close</button>
        </div>

        <div class="h-[50vh] overflow-y-auto px-4 py-4 overflow-x-hidden flex flex-col" cdkDropList (cdkDropListDropped)="onCategoryDrop($event)">
           <div *ngIf="categories.length === 0" class="text-center text-milktea-400 text-sm py-4">目前沒有分類</div>
           <div *ngFor="let cat of categories; let i = index" cdkDrag
                class="flex items-center justify-between p-3 mb-2 bg-milktea-50 rounded-lg border border-milktea-100 touch-none shrink-0"
                (click)="startEditCategory(cat)">
              <div *cdkDragPreview class="w-4 h-4 rounded-full bg-red-400 shadow-sm shadow-red-500/50"></div>
              <div class="flex items-center gap-3">
                 <div cdkDragHandle class="material-icons text-milktea-400 cursor-grab px-1 touch-none" (click)="$event.stopPropagation()">drag_indicator</div>
                 <span class="material-icons text-milktea-600">{{ cat.icon }}</span>
                 <span class="font-bold text-milktea-800">{{ cat.name }}</span>
              </div>
              <button class="material-icons text-red-400 text-sm p-2" (click)="deleteCategory($event, cat); $event.stopPropagation()">delete</button>
           </div>
        </div>

        <div class="p-4 border-t border-milktea-100 shrink-0 pb-safe z-10 bg-white">
           <button class="w-full bg-milktea-600 text-white font-bold py-3 rounded-full shadow-sm" (click)="startCreateCategory()">
             ＋ 新增分類
           </button>
        </div>
      </div>

      <!-- Edit/Create Category Modal -->
      <div *ngIf="showEditModal" class="absolute inset-0 z-[60] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40" (click)="closeEditModal()"></div>
        <div class="bg-white rounded-2xl p-6 shadow-xl w-full max-w-sm relative z-10">
           <h3 class="font-bold text-lg text-milktea-900 mb-4">{{ editingCategory?.id ? '編輯分類' : '新增分類' }}</h3>

           <div class="mb-4">
              <label class="block text-xs font-bold text-milktea-500 mb-1">分類名稱</label>
              <input type="text" [(ngModel)]="editName" class="w-full border-b-2 border-milktea-200 focus:border-milktea-500 outline-none py-1 text-milktea-900 font-medium" placeholder="例如：工作、運動、家庭">
           </div>

           <div class="mb-6">
              <label class="block text-xs font-bold text-milktea-500 mb-2">選擇圖示</label>
              <div class="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
                 <button *ngFor="let icon of availableIcons"
                         (click)="editIcon = icon"
                         class="p-2 rounded-lg border transition-colors flex items-center justify-center"
                         [class.border-milktea-600]="editIcon === icon" [class.bg-milktea-100]="editIcon === icon" [class.text-milktea-700]="editIcon === icon"
                         [class.border-milktea-100]="editIcon !== icon" [class.text-milktea-400]="editIcon !== icon">
                    <span class="material-icons">{{ icon }}</span>
                 </button>
              </div>
           </div>

           <div class="flex justify-end gap-3">
              <button class="px-4 py-2 text-milktea-500 font-bold text-sm" (click)="closeEditModal()">取消</button>
              <button class="px-4 py-2 bg-milktea-600 text-white rounded-full font-bold text-sm shadow-sm" [disabled]="!editName" (click)="saveCategory()">儲存</button>
           </div>
        </div>
      </div>
    </div>
  `
})
export class SettingsComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private workspaceService = inject(WorkspaceService);
  private categoryService = inject(CategoryService);
  private userService = inject(UserService);

  destroy$ = new Subject<void>();
  currentWorkspace: Workspace | null = null;
  categories: Category[] = [];

  showCategoryDrawer = false;
  showEditModal = false;

  editingCategory: Partial<Category> | null = null;
  editName = '';
  editIcon = 'category';

  availableIcons = [
    'home', 'work', 'fitness_center', 'restaurant', 'flight', 'shopping_cart',
    'directions_car', 'music_note', 'local_cafe', 'school', 'pets', 'favorite',
    'attach_money', 'event', 'cake', 'menu_book', 'brush', 'videogame_asset'
  ];

  ngOnInit() {
    this.workspaceService.currentWorkspace$.pipe(takeUntil(this.destroy$)).subscribe(ws => {
      this.currentWorkspace = ws;
      if (ws) {
        this.loadCategories(ws.id);
      } else {
        this.router.navigate(['/workspaces']);
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goBack() {
    this.router.navigate(['/main']);
  }

  openCategoryDrawer() {
    this.showCategoryDrawer = true;
  }

  closeCategoryDrawer() {
    this.showCategoryDrawer = false;
  }

  loadCategories(workspaceId: string) {
    this.categoryService.getCategories(workspaceId).pipe(takeUntil(this.destroy$)).subscribe(cats => {
      this.categories = cats;
    });
  }

  onCategoryDrop(event: CdkDragDrop<Category[]>) {
    moveItemInArray(this.categories, event.previousIndex, event.currentIndex);
    this.categoryService.reorderCategories(this.categories);
  }

  startCreateCategory() {
    this.editingCategory = {
      workspaceId: this.currentWorkspace!.id,
      createdBy: localStorage.getItem('currentUserId') || 'unknown',
      createdAt: Date.now()
    };
    this.editName = '';
    this.editIcon = 'category';
    this.showEditModal = true;
  }

  startEditCategory(cat: Category) {
    this.editingCategory = { ...cat };
    this.editName = cat.name;
    this.editIcon = cat.icon;
    this.showEditModal = true;
  }

  closeEditModal() {
    this.showEditModal = false;
    this.editingCategory = null;
  }

  async saveCategory() {
    if (!this.editName.trim() || !this.editingCategory) return;

    if (this.editingCategory.id) {
      await this.categoryService.updateCategory(this.editingCategory.id, {
        name: this.editName.trim(),
        icon: this.editIcon
      });
    } else {
      await this.categoryService.addCategory({
        workspaceId: this.editingCategory.workspaceId!,
        name: this.editName.trim(),
        icon: this.editIcon,
        order: this.categories.length > 0 ? Math.max(...this.categories.map(c => c.order)) + 1 : 0,
        createdBy: this.editingCategory.createdBy!,
        createdAt: this.editingCategory.createdAt!
      });
    }
    this.closeEditModal();
  }

  async deleteCategory(event: Event, cat: Category) {
    event.stopPropagation();
    if (confirm(`確定要刪除分類「\${cat.name}」嗎？`)) {
      await this.categoryService.deleteCategory(cat.id);
    }
  }
}
