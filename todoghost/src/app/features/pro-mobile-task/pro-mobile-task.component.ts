import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, take, filter } from 'rxjs';

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
  /** Real task id when editing an existing task (one-off or from a series). */
  editingTaskId: string | null = null;
  /** Recurring series id this edit is tied to, read from the task's
   *  recurringId field at hydrate time. Drives whether the 系列設定 footer
   *  renders. */
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
  /** Original rangeEnd as loaded from the series (footer mode only). The
   *  footer's date input clamps to ≤ this so users can only shrink. Stays
   *  null while creating a new series. */
  recurRangeEndMax = signal<string | null>(null);
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
    //   /pro/new           → create (optional ?date= prefill)
    //   /pro/task/:id      → edit existing task (one-off or from a series)
    const taskId = this.route.snapshot.paramMap.get('id');

    if (!taskId) {
      this.isCreating.set(true);
      const presetDate = this.route.snapshot.queryParamMap.get('date');
      this.date.set(presetDate);
    } else {
      this.isCreating.set(false);
      this.editingTaskId = taskId;
      // Take only the first non-empty emission. If we used a live
      // subscription, every Firestore update (including the user's own
      // save) would re-trigger all the .set() calls and clobber the form
      // values the user was in the middle of typing — which manifested as
      // "改了儲存沒生效" (the live emit landed between the user's last
      // keystroke and their tap on 儲存, resetting the field back).
      this.workspaceService.currentWorkspace$.pipe(
        filter(ws => !!ws), take(1), takeUntil(this.destroy$),
      ).subscribe(ws => {
        this.taskService.getTasks(ws!.id).pipe(
          // Wait until the task we want is actually in the snapshot, then
          // unsubscribe — the live query is just for the initial load.
          filter(tasks => tasks.some(x => x.id === taskId)),
          take(1),
          takeUntil(this.destroy$),
        ).subscribe(tasks => {
          const t = tasks.find(x => x.id === taskId)!;
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

  /** Pull series-only fields (rule / weekdays / monthDay / range) for the
   *  footer. Doesn't touch main form fields. Accepts a preloaded series so
   *  callers can avoid a second subscribe. Same one-shot rationale as
   *  hydrateFromSeries — without take(1) a live emit overwrites the user's
   *  in-progress rangeEnd / weekday edits. */
  private hydrateSeriesFieldsOnly(seriesId: string, preloaded?: RecurringTask) {
    const apply = (r: RecurringTask) => {
      this.recurRule.set(r.rule);
      this.recurWeekdays.set([...(r.weekdays ?? [])]);
      this.recurMonthDay.set(r.monthDay ?? 1);
      this.recurRangeStart.set(r.rangeStart);
      this.recurRangeEnd.set(r.rangeEnd);
      this.recurRangeEndMax.set(r.rangeEnd);
    };
    if (preloaded) { apply(preloaded); return; }
    this.workspaceService.currentWorkspace$.pipe(
      filter(ws => !!ws), take(1), takeUntil(this.destroy$),
    ).subscribe(ws => {
      this.recurringTaskService.getRecurringTasks(ws!.id).pipe(
        filter(list => list.some(x => x.id === seriesId)),
        take(1),
        takeUntil(this.destroy$),
      ).subscribe(list => {
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

  /** Setter that clamps user-entered rangeEnd into [min, max]. The native
   *  [min]/[max] attributes prevent most invalid picks but mobile Safari
   *  still lets some values through (typed input, paste). When editing an
   *  existing series, max = original rangeEnd so users can only shrink. */
  setRecurRangeEnd(value: string) {
    if (!value) return;
    const min = this.rangeEndMin;
    const max = this.recurRangeEndMax();
    let clamped = value;
    if (clamped < min) clamped = min;
    if (max && clamped > max) clamped = max;
    this.recurRangeEnd.set(clamped);
  }

  /** Human-readable summary of the series rule for read-only display in the
   *  footer (mobile editing existing series). */
  get seriesRuleLabel(): string {
    const r = this.recurRule();
    if (r === 'daily') return '每天';
    if (r === 'weekly') {
      const wd = this.recurWeekdays();
      if (wd.length === 0) return '每週';
      const names = ['日', '一', '二', '三', '四', '五', '六'];
      const sorted = [...wd].sort((a, b) => a - b);
      return '每週 ' + sorted.map(d => names[d]).join('、');
    }
    if (r === 'monthly') return `每月 ${this.recurMonthDay()} 日`;
    return '';
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

    // Branch A: creating a new series. addSeriesAndOccurrences writes the
    // series doc plus one materialised task per occurrence date in the
    // chosen range. Doesn't touch tasks/ after that — series and tasks are
    // independent collections.
    if (this.isCreating() && this.recurEnabled()) {
      await this.recurringTaskService.addSeriesAndOccurrences({
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
      }, this.currentUser.id);
      this.back();
      return;
    }

    // Branch B: creating a one-off task.
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
      this.back();
      return;
    }

    // Branch C: editing an existing task. Update the task itself first,
    // then if footer changed apply rule/range diffs (which may delete this
    // very task if it now falls outside the range / rule).
    if (this.editingTaskId) {
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
        categoryId: this.categoryId() ?? null as any,
      });
      await this.maybeSaveSeriesFooter();
    }

    this.back();
  }

  /** Persist series-footer changes if this edit is tied to a series.
   *  Simplified spec: only rangeEnd is editable post-creation and only
   *  downward, so this is a single shrink call. Rule + rangeStart are
   *  immutable; to change them users delete the series and create a new
   *  one. */
  private async maybeSaveSeriesFooter() {
    const seriesId = this.seriesIdForFooter();
    if (!seriesId) return;
    const series = await this.loadSeriesOnce(seriesId);
    if (!series) return;
    if (this.recurRangeEnd() === series.rangeEnd) return;
    await this.recurringTaskService.shrinkRangeEnd(seriesId, series, this.recurRangeEnd());
  }

  private async loadSeriesOnce(seriesId: string): Promise<RecurringTask | null> {
    if (!this.currentWorkspace) return null;
    return new Promise(resolve => {
      const sub = this.recurringTaskService.getRecurringTasks(this.currentWorkspace!.id).subscribe(list => {
        const r = list.find(x => x.id === seriesId) ?? null;
        sub.unsubscribe();
        resolve(r);
      });
    });
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
