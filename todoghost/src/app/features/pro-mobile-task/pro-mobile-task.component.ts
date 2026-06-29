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
import { format, addMonths } from 'date-fns';

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
  /** Real task id when editing an existing single task. Stays null while
   *  editing a virtual occurrence — set after the user saves and the
   *  occurrence is materialised. */
  editingTaskId: string | null = null;
  /** Virtual occurrence parsed from /pro/task/virtual:recId:date. When set,
   *  save() materialises by creating a real task linked to the series and
   *  using the form values; the series document itself is not touched. */
  virtualSeriesId: string | null = null;
  virtualOccurrenceDate: string | null = null;
  /** Recurring series id this edit is tied to — either parsed from a virtual
   *  occurrence url, or read from the real task's recurringId field. Drives
   *  whether the 系列設定 footer renders. */
  seriesIdForFooter = signal<string | null>(null);

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
  recurRangeEnd = signal<string>(format(addMonths(new Date(), 1), 'yyyy-MM-dd'));
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

    // Routes:
    //   /pro/new                            → create
    //   /pro/task/:id                       → edit real task
    //   /pro/task/virtual:{recId}:{date}    → hydrate from series template;
    //                                         materialises on save
    const taskId = this.route.snapshot.paramMap.get('id');

    if (!taskId) {
      this.isCreating.set(true);
      const presetDate = this.route.snapshot.queryParamMap.get('date');
      this.date.set(presetDate);
    } else if (taskId.startsWith('virtual:')) {
      this.isCreating.set(false);
      const parts = taskId.split(':');
      this.virtualSeriesId = parts[1] ?? null;
      this.virtualOccurrenceDate = parts[2] ?? null;
      this.seriesIdForFooter.set(this.virtualSeriesId);
      this.hydrateFromSeries(this.virtualSeriesId!, this.virtualOccurrenceDate!);
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
          // Real tasks materialised from a series carry recurringId — show
          // the footer so users can adjust the series rule from here.
          if ((t as any).recurringId) {
            this.seriesIdForFooter.set((t as any).recurringId);
            this.hydrateSeriesFieldsOnly((t as any).recurringId);
          }
        });
      });
    }
  }

  /** Fill form values from a series template plus a target occurrence date.
   *  Used when opening a virtual occurrence — the user sees the form as if
   *  this date were already a real task. */
  private hydrateFromSeries(seriesId: string, date: string) {
    this.workspaceService.currentWorkspace$.pipe(takeUntil(this.destroy$)).subscribe(ws => {
      if (!ws) return;
      this.recurringTaskService.getRecurringTasks(ws.id).pipe(takeUntil(this.destroy$)).subscribe(list => {
        const r = list.find(x => x.id === seriesId);
        if (!r) return;
        this.title.set(r.title);
        this.description.set(r.description ?? '');
        this.date.set(date);
        this.startTime.set(r.startTime);
        this.endTime.set(r.endTime);
        this.isUrgent.set(r.isUrgent);
        this.categoryId.set(r.categoryId);
        this.reminderOffset.set(r.reminderOffset);
        this.tags.set([...(r.tags ?? [])]);
        this.hydrateSeriesFieldsOnly(seriesId, r);
      });
    });
  }

  /** Pull series-only fields (rule / weekdays / monthDay / range) for the
   *  footer. Doesn't touch main form fields. Accepts a preloaded series so
   *  callers can avoid a second subscribe. */
  private hydrateSeriesFieldsOnly(seriesId: string, preloaded?: RecurringTask) {
    const apply = (r: RecurringTask) => {
      this.recurRule.set(r.rule);
      this.recurWeekdays.set([...(r.weekdays ?? [])]);
      this.recurMonthDay.set(r.monthDay ?? 1);
      this.recurRangeStart.set(r.rangeStart);
      this.recurRangeEnd.set(r.rangeEnd);
    };
    if (preloaded) { apply(preloaded); return; }
    this.workspaceService.currentWorkspace$.pipe(takeUntil(this.destroy$)).subscribe(ws => {
      if (!ws) return;
      this.recurringTaskService.getRecurringTasks(ws.id).pipe(takeUntil(this.destroy$)).subscribe(list => {
        const r = list.find(x => x.id === seriesId);
        if (r) apply(r);
      });
    });
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

  /** Minimum rangeEnd value: cannot be earlier than today (we never touch
   *  past materialised tasks, so an end-date in the past would be a no-op
   *  that just confuses users) and cannot be earlier than rangeStart. */
  get rangeEndMin(): string {
    const today = format(new Date(), 'yyyy-MM-dd');
    const start = this.recurRangeStart();
    return start > today ? start : today;
  }

  /** Setter that clamps user-entered rangeEnd to the min. The browser's
   *  native [min] attribute prevents most invalid picks but mobile Safari
   *  in particular still lets some values through (typed input, paste). */
  setRecurRangeEnd(value: string) {
    if (!value) return;
    const min = this.rangeEndMin;
    this.recurRangeEnd.set(value < min ? min : value);
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

    // Branch A: create-mode + recur toggled on → write a new series.
    // Editing existing tasks never enters this branch — the footer below
    // handles series rule changes separately.
    if (this.isCreating() && this.recurEnabled()) {
      await this.recurringTaskService.addRecurringTask({
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
      });
      this.back();
      return;
    }

    // Branch B: editing a virtual occurrence → materialise as a real task
    // tied back to the series via recurringId + occurrenceDate.
    //
    // Order: materialise FIRST, then save series, then reconcile. Doing it
    // this way means reconcile sees the just-written task in Firestore and
    // can delete it correctly if the user concurrently shrunk rangeEnd
    // past this occurrence date or changed the rule so this weekday no
    // longer fires. If we wrote the series first and then materialised,
    // the new task would slip past reconcile's snapshot.
    if (this.virtualSeriesId && this.virtualOccurrenceDate) {
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
        recurringId: this.virtualSeriesId,
        occurrenceDate: this.virtualOccurrenceDate,
      } as any);
      await this.maybeSaveSeriesFooter();
      this.back();
      return;
    }

    // Branch C: editing a real task (one-off or already materialised from
    // a series). Series footer changes save independently.
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
      await this.maybeSaveSeriesFooter();
    }

    this.back();
  }

  /** Persist series-footer changes if this edit is tied to a series, then
   *  reconcile materialised tasks against the (now updated) rule. Order is
   *  important: series doc must be written first so the reconcile reads
   *  fresh rule + rangeEnd, and the main-form write upstream must complete
   *  before this method is called so its task is visible to reconcile.
   *
   *  Reconcile handles BOTH rangeEnd shrinks AND rule changes (weekday set
   *  altered, monthDay changed, etc.). Per user rule, past occurrences
   *  (occurrenceDate < today) are never touched. */
  private async maybeSaveSeriesFooter() {
    const seriesId = this.seriesIdForFooter();
    if (!seriesId) return;
    await this.recurringTaskService.updateRecurringTask(seriesId, {
      rule: this.recurRule(),
      weekdays: this.recurRule() === 'weekly' ? this.recurWeekdays() : undefined,
      monthDay: this.recurRule() === 'monthly' ? this.recurMonthDay() : undefined,
      rangeEnd: this.recurRangeEnd(),
    });
    await this.recurringTaskService.reconcileMaterialised(seriesId);
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
    // Virtual occurrence: materialise + mark completed so the rule expander
    // skips this date going forward. Hard-delete would just re-spawn the
    // occurrence on next render.
    if (this.virtualSeriesId && this.virtualOccurrenceDate && this.currentWorkspace && this.currentUser) {
      const maxOrder = await this.peekMaxOrder();
      await this.taskService.addTask({
        workspaceId: this.currentWorkspace.id,
        title: this.title().trim() || '(已取消)',
        date: this.date(),
        startTime: this.startTime(),
        endTime: this.endTime(),
        tags: this.tags(),
        isUrgent: this.isUrgent(),
        createdBy: this.currentUser.id,
        status: 'completed',
        reminderOffset: this.reminderOffset(),
        order: maxOrder + 1,
        categoryId: this.categoryId(),
        recurringId: this.virtualSeriesId,
        occurrenceDate: this.virtualOccurrenceDate,
      } as any);
    } else if (this.editingTaskId) {
      await this.taskService.deleteTask(this.editingTaskId);
    } else {
      return;
    }
    this.showDeleteConfirm.set(false);
    this.back();
  }
}
