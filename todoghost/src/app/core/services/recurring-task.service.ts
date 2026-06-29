import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, addDoc, updateDoc, deleteDoc,
  query, where, getDoc, getDocs, serverTimestamp, writeBatch,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { addDays, format, isAfter } from 'date-fns';

/**
 * Recurring task: a rule (daily / weekly / monthly) plus a date range. When
 * a series is created we eagerly materialise every occurrence date in
 * [rangeStart, rangeEnd] as a real Task linked back via `recurringId`. The
 * series doc itself stores template fields (title, time, tags, etc) so we
 * can rebuild future occurrences after a rule change.
 *
 * Eager materialisation, not lazy: every occurrence is a real Task from
 * day one. This used to be lazy (virtual occurrences synthesised at runtime,
 * materialised on first edit) but every UI operation produced a race
 * condition or a respawn loop — delete a virtual, it comes back; complete
 * a materialised, the source-of-truth becomes ambiguous; reconcile after
 * rangeEnd shrink, the just-written task can be missed by getDocs. Eager
 * model is plain CRUD and "delete" actually means deleted.
 *
 * For rule / range changes we run a small diff against the current
 * materialised tasks:
 *   - extend rangeEnd: add tasks for the new region
 *   - shrink rangeEnd: drop tasks past it (today and later only; past +
 *     completed history kept)
 *   - rule change: drop today-and-later non-completed tasks, regenerate
 *     according to the new rule. Past + completed-future stay as history.
 *
 * The diff comparator on date is **strict greater-than** for shrink (i.e.
 * the new rangeEnd day is inclusive) and **strict less-than today** for
 * what counts as untouchable history (today itself goes through rule).
 */
export interface RecurringTask {
  id: string;
  workspaceId: string;
  categoryId?: string;
  title: string;
  description?: string;
  startTime: string | null;   // 'HH:mm'
  endTime: string | null;
  tags: string[];
  isUrgent: boolean;
  createdBy: string;
  reminderOffset: number | null;

  rule: 'daily' | 'weekly' | 'monthly';
  /** weekly: 0..6 where 0=Sunday, 1=Monday … 6=Saturday (matches Date.getDay()). */
  weekdays?: number[];
  /** monthly: day of month 1..31. If the month has fewer days the occurrence
   *  for that month is skipped (we never clamp). */
  monthDay?: number;

  rangeStart: string;   // 'yyyy-MM-dd' inclusive
  rangeEnd: string;     // 'yyyy-MM-dd' inclusive
  status: 'active' | 'archived';

  createdAt?: any;
  updatedAt?: any;
}

@Injectable({ providedIn: 'root' })
export class RecurringTaskService {
  private firestore = inject(Firestore);

  // ====================================================================
  // CRUD on the series doc (rare — wrapped by addSeriesAndOccurrences and
  // applyRule/RangeChange below for normal create/update flows).
  // ====================================================================

  getRecurringTasks(workspaceId: string): Observable<RecurringTask[]> {
    const ref = collection(this.firestore, 'recurring_tasks');
    const q = query(ref, where('workspaceId', '==', workspaceId));
    return collectionData(q, { idField: 'id' }) as Observable<RecurringTask[]>;
  }

  async deleteRecurringTask(id: string): Promise<void> {
    const ref = doc(this.firestore, `recurring_tasks/${id}`);
    await deleteDoc(ref);
  }

  // ====================================================================
  // Public ops — these are what UI code should call.
  // ====================================================================

  /**
   * Create a new series and write every occurrence in [rangeStart, rangeEnd]
   * to tasks/ as a real Task. Returns the new series id.
   *
   * Uses writeBatch (500-op limit per batch). For ranges that produce more
   * than ~480 occurrences we split into multiple batches. In practice
   * users pick rangeEnd ≤ one month so we typically stay under 30 tasks.
   */
  async addSeriesAndOccurrences(
    seriesData: Omit<RecurringTask, 'id'>,
    createdBy: string,
  ): Promise<string> {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(seriesData)) {
      if (v !== undefined) cleaned[k] = v;
    }
    const seriesRef = await addDoc(collection(this.firestore, 'recurring_tasks'), {
      ...cleaned,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const seriesId = seriesRef.id;

    const dates = this.expandDates(seriesData as RecurringTask, seriesData.rangeStart, seriesData.rangeEnd);
    await this.writeTasksForDates(seriesId, seriesData as RecurringTask, dates, createdBy);

    return seriesId;
  }

  /**
   * Apply a range change to an existing series. Compares the new range
   * against the old, then:
   *   - shrink (newEnd < oldEnd): delete tasks with date in (newEnd, oldEnd]
   *     where date >= today (past kept as history) and status != completed
   *     OR date < today (history kept) … in practice we just keep past +
   *     completed.
   *   - extend (newEnd > oldEnd): add tasks for the (oldEnd, newEnd] window
   *     that the rule fires on. Does NOT backfill historical gaps the user
   *     may have manually deleted — only the newly extended range gets
   *     populated.
   *
   * If rangeStart is also being changed it's handled symmetrically (we
   * don't actually let UI move rangeStart but this is here for safety).
   *
   * Callers must await this — it does multiple Firestore writes and the
   * subsequent footer/UI state must reflect completion.
   */
  async applyRangeChange(
    seriesId: string,
    oldSeries: RecurringTask,
    newRangeStart: string,
    newRangeEnd: string,
    createdBy: string,
  ): Promise<void> {
    await updateDoc(doc(this.firestore, `recurring_tasks/${seriesId}`), {
      rangeStart: newRangeStart,
      rangeEnd: newRangeEnd,
      updatedAt: serverTimestamp(),
    });

    const today = format(new Date(), 'yyyy-MM-dd');

    // Shrink end: delete tasks in (newEnd, oldEnd], keeping past + completed.
    if (newRangeEnd < oldSeries.rangeEnd) {
      const tasksSnap = await this.queryTasksOfSeries(seriesId);
      const toDelete = tasksSnap.filter(t => {
        const d = t.date;
        if (!d) return false;
        if (d <= newRangeEnd) return false;        // still in range
        if (d > oldSeries.rangeEnd) return false;  // outside old range too — ignore
        if (d < today) return false;               // history
        if (t.status === 'completed') return false; // completed future = history
        return true;
      });
      await this.batchDelete(toDelete.map(t => t.id));
    }

    // Extend end: add tasks for (oldEnd, newEnd]. Use updated rule from oldSeries
    // (caller hasn't changed rule in this code path).
    if (newRangeEnd > oldSeries.rangeEnd) {
      const fromInclusive = this.addOneDay(oldSeries.rangeEnd);
      const dates = this.expandDates(
        { ...oldSeries, rangeStart: newRangeStart, rangeEnd: newRangeEnd },
        fromInclusive, newRangeEnd,
      );
      await this.writeTasksForDates(seriesId, oldSeries, dates, createdBy);
    }

    // (Shrink/extend rangeStart cases are deliberately left as a no-op for
    // now since the UI doesn't expose rangeStart editing. Implement if
    // needed later.)
  }

  /**
   * Apply a rule change (frequency / weekdays / monthDay) to an existing
   * series. Updates the series doc, then for all tasks with date >= today
   * AND status != completed:
   *   - delete the ones the new rule wouldn't fire on
   *   - add tasks for new-rule dates that don't already have one
   *
   * Past tasks (date < today) and completed-future tasks are never touched
   * — they're history.
   *
   * This also re-fills "holes" the user previously created by deleting
   * specific occurrences, but only if the new rule fires on those dates.
   * Per user spec: rule change resets the future cleanly.
   */
  async applyRuleChange(
    seriesId: string,
    oldSeries: RecurringTask,
    newRule: { rule: 'daily' | 'weekly' | 'monthly'; weekdays?: number[]; monthDay?: number },
    createdBy: string,
  ): Promise<void> {
    await updateDoc(doc(this.firestore, `recurring_tasks/${seriesId}`), {
      rule: newRule.rule,
      weekdays: newRule.rule === 'weekly' ? newRule.weekdays : null,
      monthDay: newRule.rule === 'monthly' ? newRule.monthDay : null,
      updatedAt: serverTimestamp(),
    });

    const today = format(new Date(), 'yyyy-MM-dd');
    const fromDate = today > oldSeries.rangeStart ? today : oldSeries.rangeStart;
    const newSeriesView: RecurringTask = { ...oldSeries, ...newRule };

    const existingTasks = await this.queryTasksOfSeries(seriesId);

    // Delete future non-completed tasks (clean slate for the new rule).
    const toDelete = existingTasks.filter(t => {
      const d = t.date;
      if (!d) return false;
      if (d < today) return false;             // history
      if (t.status === 'completed') return false;
      return true;
    });
    await this.batchDelete(toDelete.map(t => t.id));

    // Generate new occurrences for today..rangeEnd, skipping dates where
    // a completed-historical task already exists (we keep history).
    const completedFutureKeys = new Set(
      existingTasks
        .filter(t => t.status === 'completed' && (t.date ?? '') >= today)
        .map(t => t.date!)
    );
    const dates = this.expandDates(newSeriesView, fromDate, oldSeries.rangeEnd)
      .filter(d => !completedFutureKeys.has(d));

    await this.writeTasksForDates(seriesId, newSeriesView, dates, createdBy);
  }

  /**
   * Update template-level series metadata (title / time / tags / etc) that
   * doesn't trigger any task regeneration. Doesn't touch existing tasks
   * — per design discussion, "title change applies only to this
   * occurrence" so we never propagate template edits.
   */
  async updateSeriesTemplate(seriesId: string, data: Partial<RecurringTask>): Promise<void> {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) cleaned[k] = v;
    }
    await updateDoc(doc(this.firestore, `recurring_tasks/${seriesId}`), {
      ...cleaned,
      updatedAt: serverTimestamp(),
    });
  }

  // ====================================================================
  // Internal helpers
  // ====================================================================

  /** Return the dates in [from, to] that the rule fires on. */
  private expandDates(rec: RecurringTask, from: string, to: string): string[] {
    if (from > to) return [];
    const out: string[] = [];
    let d = parseDate(from);
    const toD = parseDate(to);
    while (!isAfter(d, toD)) {
      const ds = format(d, 'yyyy-MM-dd');
      if (this.fires(rec, d, ds)) out.push(ds);
      d = addDays(d, 1);
    }
    return out;
  }

  /** True iff the rule fires on the given date. Boundary-inclusive against
   *  rec.rangeStart/rangeEnd. */
  private fires(rec: RecurringTask, d: Date, ds: string): boolean {
    if (ds < rec.rangeStart || ds > rec.rangeEnd) return false;
    switch (rec.rule) {
      case 'daily':
        return true;
      case 'weekly':
        if (!rec.weekdays || rec.weekdays.length === 0) return false;
        return rec.weekdays.includes(d.getDay());
      case 'monthly':
        if (!rec.monthDay) return false;
        return d.getDate() === rec.monthDay;
    }
    return false;
  }

  /** Write one Task doc per date, in writeBatch chunks of 480 (Firestore's
   *  limit is 500 per batch; we leave headroom). */
  private async writeTasksForDates(
    seriesId: string,
    template: RecurringTask,
    dates: string[],
    createdBy: string,
  ): Promise<void> {
    if (dates.length === 0) return;
    const tasksRef = collection(this.firestore, 'tasks');
    const chunk = 480;
    for (let i = 0; i < dates.length; i += chunk) {
      const batch = writeBatch(this.firestore);
      const slice = dates.slice(i, i + chunk);
      for (const d of slice) {
        const newDocRef = doc(tasksRef);
        const data: Record<string, any> = {
          workspaceId: template.workspaceId,
          title: template.title,
          date: d,
          startTime: template.startTime,
          endTime: template.endTime,
          tags: template.tags ?? [],
          isUrgent: template.isUrgent,
          createdBy,
          status: 'pending',
          reminderOffset: template.reminderOffset,
          order: 0,
          recurringId: seriesId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (template.description) data['description'] = template.description;
        if (template.categoryId) data['categoryId'] = template.categoryId;
        batch.set(newDocRef, data);
      }
      await batch.commit();
    }
  }

  /** Pull every task that belongs to this series (any date / status). */
  private async queryTasksOfSeries(seriesId: string): Promise<Array<{ id: string; date: string | null; status: string }>> {
    const snap = await getDocs(query(
      collection(this.firestore, 'tasks'),
      where('recurringId', '==', seriesId),
    ));
    return snap.docs.map(d => {
      const data = d.data() as any;
      return { id: d.id, date: data.date ?? null, status: data.status };
    });
  }

  /** Batch-delete a set of task ids. Splits across multiple batches if
   *  needed. */
  private async batchDelete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const chunk = 480;
    for (let i = 0; i < ids.length; i += chunk) {
      const batch = writeBatch(this.firestore);
      for (const id of ids.slice(i, i + chunk)) {
        batch.delete(doc(this.firestore, `tasks/${id}`));
      }
      await batch.commit();
    }
  }

  /** yyyy-MM-dd + 1 day, same form. */
  private addOneDay(ds: string): string {
    return format(addDays(parseDate(ds), 1), 'yyyy-MM-dd');
  }
}

function parseDate(ds: string): Date {
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(y, m - 1, d);
}
