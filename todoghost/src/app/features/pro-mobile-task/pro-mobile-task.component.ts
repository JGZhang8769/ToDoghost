import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import { TaskService, Task } from '../../core/services/task.service';
import { CategoryService, Category } from '../../core/services/category.service';
import { WorkspaceService, Workspace } from '../../core/services/workspace.service';
import { UserService, User } from '../../core/services/user.service';
import { SwipeBackDirective } from '../../core/directives/swipe-back.directive';

/**
 * Full-screen task detail / edit / create view for the Pro Mobile flow.
 *
 * Routes:
 *   /pro/task/:id   → edit existing task
 *   /pro/new        → create new task; optional ?date=YYYY-MM-DD prefill
 *
 * The two modes share the same template — when no id is supplied we just
 * start with a blank form and call addTask on save. Layout follows iOS
 * Reminders' detail page: nav bar with < 返回 + title + 儲存, body is a
 * stack of grouped iOS-style cards.
 */
@Component({
  selector: 'app-pro-mobile-task',
  standalone: true,
  imports: [CommonModule, FormsModule, SwipeBackDirective],
  templateUrl: './pro-mobile-task.component.html',
  styleUrl: './pro-mobile-task.component.scss',
})
export class ProMobileTaskComponent implements OnInit, OnDestroy {
  private taskService = inject(TaskService);
  private categoryService = inject(CategoryService);
  private workspaceService = inject(WorkspaceService);
  private userService = inject(UserService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private destroy$ = new Subject<void>();

  /** True when route is /pro/new — we add instead of update on save. */
  isCreating = signal(false);
  /** Original task when editing — kept for diffing on save. */
  editingTaskId: string | null = null;

  // Form fields. Mirror Task shape minus IDs / timestamps.
  title = signal('');
  description = signal('');
  date = signal<string | null>(null);
  startTime = signal<string | null>(null);
  endTime = signal<string | null>(null);
  isUrgent = signal(false);
  isCompleted = signal(false);
  categoryId = signal<string | undefined>(undefined);
  reminderOffset = signal<number | null>(null);
  tags = signal<string[]>([]);
  tagInput = '';

  // Sidebar context
  categories: Category[] = [];
  currentWorkspace: Workspace | null = null;
  currentUser: User | null = null;

  // Inline confirm dialog state (for delete)
  showDeleteConfirm = signal(false);

  ngOnInit() {
    this.workspaceService.currentWorkspace$.pipe(takeUntil(this.destroy$)).subscribe(ws => {
      this.currentWorkspace = ws;
    });
    this.userService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(u => this.currentUser = u);

    // Subscribe categories once workspace lands
    this.workspaceService.currentWorkspace$.pipe(takeUntil(this.destroy$)).subscribe(ws => {
      if (!ws) return;
      this.categoryService.getCategories(ws.id).pipe(takeUntil(this.destroy$)).subscribe(cats => {
        this.categories = cats.sort((a, b) => a.order - b.order);
      });
    });

    // Decide create vs edit from the route data
    const taskId = this.route.snapshot.paramMap.get('id');
    if (!taskId) {
      // Create mode — read optional ?date= query param
      this.isCreating.set(true);
      const presetDate = this.route.snapshot.queryParamMap.get('date');
      this.date.set(presetDate);
    } else {
      this.isCreating.set(false);
      this.editingTaskId = taskId;
      // Pull the task once we have a workspace. Cheapest: query and find.
      this.workspaceService.currentWorkspace$.pipe(takeUntil(this.destroy$)).subscribe(ws => {
        if (!ws) return;
        this.taskService.getTasks(ws.id).pipe(takeUntil(this.destroy$)).subscribe(tasks => {
          const t = tasks.find(x => x.id === taskId);
          if (!t) return;
          this.title.set(t.title);
          this.description.set(t.description ?? '');
          this.date.set(t.date);
          this.startTime.set(t.startTime);
          this.endTime.set(t.endTime);
          this.isUrgent.set(t.isUrgent);
          this.isCompleted.set(t.status === 'completed');
          this.categoryId.set(t.categoryId);
          this.reminderOffset.set(t.reminderOffset);
          this.tags.set([...(t.tags ?? [])]);
        });
      });
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---------- Helpers ----------
  isEmoji(str: string): boolean {
    if (!str) return false;
    return /\p{Extended_Pictographic}/u.test(str);
  }

  // ---------- Tags ----------
  addTag() {
    const t = this.tagInput.trim();
    if (!t || this.tags().includes(t)) { this.tagInput = ''; return; }
    this.tags.update(arr => [...arr, t]);
    this.tagInput = '';
  }
  removeTag(tag: string) {
    this.tags.update(arr => arr.filter(x => x !== tag));
  }

  setCategory(catId: string | null) {
    this.categoryId.set(catId ?? undefined);
  }

  // ---------- Save / cancel ----------
  /** Back to wherever we came from. Using history rather than a hard-coded
   *  '/pro' route means coming back from edit → list → home stays sane,
   *  and matches the left-edge swipe gesture's behaviour. */
  back() {
    this.location.back();
  }

  async save() {
    const title = this.title().trim();
    if (!title || !this.currentWorkspace || !this.currentUser) return;

    if (this.isCreating()) {
      const maxOrder = await this.peekMaxOrder();
      await this.taskService.addTask({
        workspaceId: this.currentWorkspace.id,
        title,
        description: this.description() || undefined,
        date: this.date(),
        startTime: this.startTime(),
        endTime: this.endTime(),
        tags: this.tags(),
        isUrgent: this.isUrgent(),
        createdBy: this.currentUser.id,
        status: this.isCompleted() ? 'completed' : 'pending',
        reminderOffset: this.reminderOffset(),
        order: maxOrder + 1,
        categoryId: this.categoryId(),
      } as any);
    } else if (this.editingTaskId) {
      await this.taskService.updateTask(this.editingTaskId, {
        title,
        description: this.description() || undefined,
        date: this.date(),
        startTime: this.startTime(),
        endTime: this.endTime(),
        tags: this.tags(),
        isUrgent: this.isUrgent(),
        status: this.isCompleted() ? 'completed' : 'pending',
        reminderOffset: this.reminderOffset(),
        categoryId: this.categoryId() ?? null as any, // null → deleteField in service
      });
    }

    this.back();
  }

  /** Take a snapshot of current task list to derive next order. Cheap because
   *  TaskService.getTasks emits the cached list immediately. */
  private peekMaxOrder(): Promise<number> {
    return new Promise(resolve => {
      if (!this.currentWorkspace) { resolve(0); return; }
      const sub = this.taskService.getTasks(this.currentWorkspace.id).subscribe(tasks => {
        const m = tasks.reduce((acc, t) => Math.max(acc, t.order ?? 0), 0);
        sub.unsubscribe();
        resolve(m);
      });
    });
  }

  requestDelete() {
    if (this.isCreating()) return;
    this.showDeleteConfirm.set(true);
  }
  cancelDelete() { this.showDeleteConfirm.set(false); }
  async confirmDelete() {
    if (!this.editingTaskId) return;
    await this.taskService.deleteTask(this.editingTaskId);
    this.showDeleteConfirm.set(false);
    this.back();
  }
}
