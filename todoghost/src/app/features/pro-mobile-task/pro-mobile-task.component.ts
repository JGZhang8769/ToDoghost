import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import { TaskService, Task } from '../../core/services/task.service';
import { CategoryService, Category } from '../../core/services/category.service';
import { WorkspaceService, Workspace } from '../../core/services/workspace.service';
import { UserService, User } from '../../core/services/user.service';
import { RecurringTaskService, RecurringTask } from '../../core/services/recurring-task.service';
import { SwipeBackDirective } from '../../core/directives/swipe-back.directive';
import { format, addYears } from 'date-fns';

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
  private recurringTaskService = inject(RecurringTaskService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private destroy$ = new Subject<void>();

  /** True when route is /pro/new — we add instead of update on save. */
  isCreating = signal(false);
  /** Original task when editing — kept for diffing on save. */
  editingTaskId: string | null = null;
  /** When editing a recurring series (route /pro/recurring/:id) instead of a
   *  single task, this holds the series id and the form below saves to
   *  recurring_tasks/ rather than tasks/. Date / Completed don't apply. */
  editingRecurringId: string | null = null;

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

  // ---------- Recurrence form state ----------
  /** When true, save() writes a RecurringTask instead of a Task. */
  recurEnabled = signal(false);
  recurRule = signal<'daily' | 'weekly' | 'monthly'>('weekly');
  /** Weekly: 0=Sun … 6=Sat (matches Date.getDay()). Mon default. */
  recurWeekdays = signal<number[]>([1]);
  recurMonthDay = signal<number>(1);
  recurRangeStart = signal<string>(format(new Date(), 'yyyy-MM-dd'));
  recurRangeEnd = signal<string>(format(addYears(new Date(), 1), 'yyyy-MM-dd'));
  /** When the original record was a recurring series and the user shrunk
   *  rangeEnd, we'll prune future materialised tasks on save. */
  private originalRangeEnd: string | null = null;
  readonly weekdayOptions = [
    { val: 1, label: '一' },
    { val: 2, label: '二' },
    { val: 3, label: '三' },
    { val: 4, label: '四' },
    { val: 5, label: '五' },
    { val: 6, label: '六' },
    { val: 0, label: '日' },
  ];

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

    // Decide create vs edit-task vs edit-recurring from route data.
    // Routes:
    //   /pro/new                    create (optional ?date=)
    //   /pro/task/:id               edit existing single task
    //   /pro/recurring/:id          edit existing recurring series
    const taskId = this.route.snapshot.paramMap.get('id');
    const isRecurringRoute = this.route.snapshot.url.some(s => s.path === 'recurring');

    if (!taskId) {
      this.isCreating.set(true);
      const presetDate = this.route.snapshot.queryParamMap.get('date');
      this.date.set(presetDate);
    } else if (isRecurringRoute) {
      // Edit existing series
      this.isCreating.set(false);
      this.editingRecurringId = taskId;
      this.recurEnabled.set(true);
      this.workspaceService.currentWorkspace$.pipe(takeUntil(this.destroy$)).subscribe(ws => {
        if (!ws) return;
        this.recurringTaskService.getRecurringTasks(ws.id).pipe(takeUntil(this.destroy$)).subscribe(list => {
          const r = list.find(x => x.id === taskId);
          if (!r) return;
          this.title.set(r.title);
          this.description.set(r.description ?? '');
          this.startTime.set(r.startTime);
          this.endTime.set(r.endTime);
          this.isUrgent.set(r.isUrgent);
          this.categoryId.set(r.categoryId);
          this.reminderOffset.set(r.reminderOffset);
          this.tags.set([...(r.tags ?? [])]);
          this.recurRule.set(r.rule);
          this.recurWeekdays.set([...(r.weekdays ?? [])]);
          this.recurMonthDay.set(r.monthDay ?? 1);
          this.recurRangeStart.set(r.rangeStart);
          this.recurRangeEnd.set(r.rangeEnd);
          this.originalRangeEnd = r.rangeEnd;
        });
      });
    } else {
      this.isCreating.set(false);
      this.editingTaskId = taskId;
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

  // ---------- Recurrence helpers ----------
  toggleRecurEnabled() {
    // Block toggling on existing single tasks — converting an existing
    // single task into a recurring series is out of scope (and the inverse
    // would orphan past completions).
    if (!this.isCreating()) return;
    this.recurEnabled.update(v => !v);
  }
  toggleWeekday(day: number) {
    this.recurWeekdays.update(arr =>
      arr.includes(day) ? arr.filter(d => d !== day) : [...arr, day].sort((a, b) => a - b)
    );
  }
  isWeekdaySelected(day: number): boolean {
    return this.recurWeekdays().includes(day);
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

    // Branch 1: recurring series (create or update)
    if (this.recurEnabled() || this.editingRecurringId) {
      const payload: Omit<RecurringTask, 'id'> = {
        workspaceId: this.currentWorkspace.id,
        categoryId: this.categoryId(),
        title,
        description: this.description() || undefined,
        startTime: this.startTime(),
        endTime: this.endTime(),
        tags: this.tags(),
        isUrgent: this.isUrgent(),
        createdBy: this.currentUser.id,
        reminderOffset: this.reminderOffset(),
        rule: this.recurRule(),
        weekdays: this.recurRule() === 'weekly' ? this.recurWeekdays() : undefined,
        monthDay: this.recurRule() === 'monthly' ? this.recurMonthDay() : undefined,
        rangeStart: this.recurRangeStart(),
        rangeEnd: this.recurRangeEnd(),
        status: 'active',
      };
      if (this.editingRecurringId) {
        await this.recurringTaskService.updateRecurringTask(this.editingRecurringId, payload);
        // If the user shrunk rangeEnd, drop any materialised tasks past the new end
        // — past materialised ones stay so completed history is preserved.
        if (this.originalRangeEnd && this.recurRangeEnd() < this.originalRangeEnd) {
          await this.recurringTaskService.pruneFutureMaterialised(
            this.editingRecurringId, this.recurRangeEnd(),
          );
        }
      } else {
        await this.recurringTaskService.addRecurringTask(payload);
      }
      this.back();
      return;
    }

    // Branch 2: single task
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
    if (this.editingRecurringId) {
      // Deleting the series only kills future occurrences (virtual ones
      // disappear because the rule is gone). Past materialised occurrences
      // remain in tasks/ — they're history; if the user wants them gone
      // too they can delete them individually.
      await this.recurringTaskService.deleteRecurringTask(this.editingRecurringId);
    } else if (this.editingTaskId) {
      await this.taskService.deleteTask(this.editingTaskId);
    } else {
      return;
    }
    this.showDeleteConfirm.set(false);
    this.back();
  }
}
