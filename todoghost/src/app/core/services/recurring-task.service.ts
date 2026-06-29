import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, addDoc, updateDoc, deleteDoc,
  query, where, getDoc, getDocs, serverTimestamp, writeBatch,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { addDays, format, isAfter } from 'date-fns';

/**
 * Recurring task: a rule (daily / weekly / monthly) plus a date range.
 * On creation the service eagerly materialises every occurrence in
 * [rangeStart, rangeEnd] as a real Task linked back via `recurringId`.
 *
 * Deliberately simplified semantics (we tried richer models and every
 * variant produced race conditions or respawn loops):
 *  - Creating a series writes all its tasks in one batch.
 *  - After creation, the rule and rangeStart are IMMUTABLE.
 *  - rangeEnd can only be shrunk. Shrinking deletes tasks in
 *    (newEnd, oldEnd] where date >= today AND status != completed.
 *    Past + completed-future are kept as history.
 *  - Individual occurrences are just plain Tasks. Delete / edit / complete
 *    them through TaskService like any other task; no respawn logic.
 *
 * The footer in the edit page therefore only offers a single editable
 * field — rangeEnd — and even that only allows values in
 * [max(today, rangeStart), currentRangeEnd]. Users wanting to extend or
 * change the rule should delete the series and create a new one.
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
  // Series CRUD
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
  // Public ops
  // ====================================================================

  /**
   * Create a new series and write every occurrence in [rangeStart, rangeEnd]
   * to tasks/ as a real Task. Returns the new series id.
   *
   * Uses writeBatch (500-op limit per batch) and splits into multiple
   * batches if needed. In practice users pick rangeEnd ≤ one month so we
   * typically stay under 30 tasks.
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
   * Shrink a series' rangeEnd. Deletes tasks in (newEnd, oldEnd] where
   * `date >= today` AND `status != completed`. Past + completed-future
   * are kept as history.
   *
   * Validates `newEnd <= oldEnd` and `newEnd >= max(today, rangeStart)`;
   * out-of-range requests are no-ops. (UI enforces these too via input
   * min/max, but the service is the single source of truth.)
   */
  async shrinkRangeEnd(
    seriesId: string,
    oldSeries: RecurringTask,
    newRangeEnd: string,
  ): Promise<void> {
    const today = format(new Date(), 'yyyy-MM-dd');
    const minAllowed = oldSeries.rangeStart > today ? oldSeries.rangeStart : today;
    if (newRangeEnd > oldSeries.rangeEnd) return;     // can't extend
    if (newRangeEnd < minAllowed) return;             // can't go past history boundary
    if (newRangeEnd === oldSeries.rangeEnd) return;   // no-op

    await updateDoc(doc(this.firestore, `recurring_tasks/${seriesId}`), {
      rangeEnd: newRangeEnd,
      updatedAt: serverTimestamp(),
    });

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
}

function parseDate(ds: string): Date {
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(y, m - 1, d);
}
