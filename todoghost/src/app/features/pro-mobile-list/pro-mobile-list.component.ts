import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { endOfWeek, format, startOfWeek } from 'date-fns';

import { TaskService, Task } from '../../core/services/task.service';
import { CategoryService, Category } from '../../core/services/category.service';
import { WorkspaceService, Workspace } from '../../core/services/workspace.service';
import { UserService, User } from '../../core/services/user.service';

const USER_COLORS = [
  { bar: '#3b82f6', avatar: '#dbeafe', text: '#1d4ed8' },
  { bar: '#ec4899', avatar: '#fce7f3', text: '#be185d' },
  { bar: '#10b981', avatar: '#d1fae5', text: '#047857' },
  { bar: '#f59e0b', avatar: '#fef3c7', text: '#b45309' },
  { bar: '#8b5cf6', avatar: '#ede9fe', text: '#6d28d9' },
  { bar: '#14b8a6', avatar: '#ccfbf1', text: '#0f766e' },
];

/**
 * Full-screen list view for a single scope.
 *
 * Scope is a string param mapped from /pro/list/:scope :
 *   today | week | urgent | unscheduled | completed | inbox
 *   date-YYYY-MM-DD       single date
 *   cat-:id | cat-none    by category
 *   user-:id              by creator
 *
 * The list shows the matching tasks. When viewing a scheduled scope, an
 * 「未排程」 section docks at the bottom with each row offering a quick
 * 「安排到…」 button that opens a native date input — letting users
 * pull backlog items onto specific dates without leaving the page.
 */
@Component({
  selector: 'app-pro-mobile-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pro-mobile-list.component.html',
  styleUrl: './pro-mobile-list.component.scss',
})
export class ProMobileListComponent implements OnInit, OnDestroy {
  private taskService = inject(TaskService);
  private categoryService = inject(CategoryService);
  private workspaceService = inject(WorkspaceService);
  private userService = inject(UserService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  // ----- Data -----
  currentWorkspace: Workspace | null = null;
  tasks: Task[] = [];
  categories: Category[] = [];
  workspaceUsers: User[] = [];

  // ----- Scope -----
  scope = signal<string>('inbox');

  /** Whether the docked unscheduled section should appear below the main list. */
  showUnscheduledSection = signal(true);

  /** Task currently waiting for a date pick. Null when the picker is closed. */
  schedulingTaskId = signal<string | null>(null);
  pickerDate = signal<string>(format(new Date(), 'yyyy-MM-dd'));

  ngOnInit() {
    this.scope.set(this.route.snapshot.paramMap.get('scope') ?? 'inbox');
    // 'unscheduled' / 'completed' scopes don't need their own list at the bottom.
    if (['unscheduled', 'completed'].includes(this.scope())) {
      this.showUnscheduledSection.set(false);
    }

    this.workspaceService.currentWorkspace$.pipe(takeUntil(this.destroy$)).subscribe(ws => {
      if (!ws) { this.router.navigate(['/workspaces']); return; }
      this.currentWorkspace = ws;
      this.taskService.getTasks(ws.id).pipe(takeUntil(this.destroy$)).subscribe(tasks => {
        this.tasks = tasks;
      });
      this.categoryService.getCategories(ws.id).pipe(takeUntil(this.destroy$)).subscribe(cats => {
        this.categories = cats.sort((a, b) => a.order - b.order);
      });
    });

    this.userService.getUsers().pipe(takeUntil(this.destroy$)).subscribe(users => {
      const memberIds = new Set(this.currentWorkspace?.users ?? []);
      const filtered = memberIds.size > 0 ? users.filter(u => memberIds.has(u.id)) : users;
      this.workspaceUsers = [...filtered].sort((a, b) => a.id.localeCompare(b.id));
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ----- Scope titles & filtering -----
  get scopeTitle(): string {
    const s = this.scope();
    if (s === 'today') return '今日';
    if (s === 'week') return '本週';
    if (s === 'urgent') return '緊急';
    if (s === 'unscheduled') return '未排程';
    if (s === 'completed') return '已完成';
    if (s === 'inbox') return '所有代辦';
    if (s === 'cat-none') return '無分類';
    if (s.startsWith('date-')) return s.slice(5);
    if (s.startsWith('cat-')) {
      const id = s.slice(4);
      return this.categories.find(c => c.id === id)?.name ?? '分類';
    }
    if (s.startsWith('user-')) {
      const id = s.slice(5);
      return this.workspaceUsers.find(u => u.id === id)?.name ?? '建立者';
    }
    return s;
  }

  get scopeSubtitle(): string {
    const n = this.scopeTasks.length;
    return `${n} 件代辦`;
  }

  /** Tasks matching the current scope, sorted by date / startTime / order. */
  get scopeTasks(): Task[] {
    const s = this.scope();
    const today = format(new Date(), 'yyyy-MM-dd');
    const ws = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const we = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

    let filtered: Task[];
    if (s === 'today') {
      filtered = this.tasks.filter(t => t.date === today && t.status !== 'completed');
    } else if (s === 'week') {
      filtered = this.tasks.filter(t => t.date && t.date >= ws && t.date <= we && t.status !== 'completed');
    } else if (s === 'urgent') {
      filtered = this.tasks.filter(t => t.isUrgent && t.status !== 'completed');
    } else if (s === 'unscheduled') {
      filtered = this.tasks.filter(t => !t.date && t.status !== 'completed');
    } else if (s === 'completed') {
      filtered = this.tasks.filter(t => t.status === 'completed');
    } else if (s === 'inbox') {
      filtered = this.tasks.filter(t => t.status !== 'completed');
    } else if (s === 'cat-none') {
      filtered = this.tasks.filter(t => !t.categoryId && t.status !== 'completed');
    } else if (s.startsWith('date-')) {
      const date = s.slice(5);
      filtered = this.tasks.filter(t => t.date === date);
    } else if (s.startsWith('cat-')) {
      const id = s.slice(4);
      filtered = this.tasks.filter(t => t.categoryId === id && t.status !== 'completed');
    } else if (s.startsWith('user-')) {
      const id = s.slice(5);
      filtered = this.tasks.filter(t => t.createdBy === id && t.status !== 'completed');
    } else {
      filtered = this.tasks;
    }

    return filtered.sort((a, b) => {
      // Completed tasks sink to the bottom
      if ((a.status === 'completed') !== (b.status === 'completed')) {
        return a.status === 'completed' ? 1 : -1;
      }
      // Urgent first
      if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
      // Date asc (nulls last)
      const ad = a.date ?? '9999';
      const bd = b.date ?? '9999';
      if (ad !== bd) return ad < bd ? -1 : 1;
      // Time asc (nulls last)
      const at = a.startTime ?? '99:99';
      const bt = b.startTime ?? '99:99';
      if (at !== bt) return at < bt ? -1 : 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });
  }

  /** Tasks in the bottom "未排程" section. Hidden entirely if there are none
   *  or the main scope already shows them. */
  get unscheduledTasks(): Task[] {
    if (!this.showUnscheduledSection()) return [];
    return this.tasks
      .filter(t => !t.date && t.status !== 'completed')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  // ----- Actions -----
  back() { this.router.navigate(['/pro']); }
  openTask(task: Task) { this.router.navigate(['/pro/task', task.id]); }

  openCreate() {
    // Pre-fill the create form with a sensible date based on the scope.
    let date: string | null = null;
    const s = this.scope();
    if (s === 'today') date = format(new Date(), 'yyyy-MM-dd');
    else if (s.startsWith('date-')) date = s.slice(5);
    this.router.navigate(['/pro/new'], { queryParams: date ? { date } : {} });
  }

  async toggleCompletion(task: Task, ev?: Event) {
    if (ev) { ev.stopPropagation(); ev.preventDefault(); }
    const next = task.status === 'completed' ? 'pending' : 'completed';
    await this.taskService.updateTask(task.id, { status: next });
  }

  // ----- Schedule unscheduled task -----
  startScheduling(taskId: string, ev: Event) {
    ev.stopPropagation();
    this.pickerDate.set(format(new Date(), 'yyyy-MM-dd'));
    this.schedulingTaskId.set(taskId);
  }

  cancelScheduling() {
    this.schedulingTaskId.set(null);
  }

  async confirmScheduling() {
    const id = this.schedulingTaskId();
    const date = this.pickerDate();
    if (!id || !date) return;
    await this.taskService.updateTask(id, { date });
    this.schedulingTaskId.set(null);
  }

  /** Quick presets the user can tap inside the picker. */
  schedulePreset(label: 'today' | 'tomorrow' | 'next-mon') {
    const now = new Date();
    if (label === 'today') {
      this.pickerDate.set(format(now, 'yyyy-MM-dd'));
    } else if (label === 'tomorrow') {
      const t = new Date(now);
      t.setDate(t.getDate() + 1);
      this.pickerDate.set(format(t, 'yyyy-MM-dd'));
    } else if (label === 'next-mon') {
      const t = new Date(now);
      const day = t.getDay();
      const offset = ((8 - day) % 7) || 7; // next Monday
      t.setDate(t.getDate() + offset);
      this.pickerDate.set(format(t, 'yyyy-MM-dd'));
    }
  }

  /** Title shown above the date picker. */
  get schedulingTaskTitle(): string {
    const id = this.schedulingTaskId();
    if (!id) return '';
    return this.tasks.find(t => t.id === id)?.title ?? '';
  }

  // ----- Helpers -----
  isEmoji(str: string): boolean {
    if (!str) return false;
    return /\p{Extended_Pictographic}/u.test(str);
  }

  categoryFor(catId?: string): Category | undefined {
    return this.categories.find(c => c.id === catId);
  }

  userColor(userId: string | undefined): { bar: string; avatar: string; text: string } | null {
    if (!userId) return null;
    const idx = this.workspaceUsers.findIndex(u => u.id === userId);
    if (idx < 0) return null;
    return USER_COLORS[idx % USER_COLORS.length];
  }
}
