import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, addDoc, updateDoc, deleteDoc,
  query, where, getDocs, serverTimestamp,
} from '@angular/fire/firestore';
import { TaskService } from './task.service';
import { Observable } from 'rxjs';
import { addDays, format, isAfter, isBefore } from 'date-fns';

import { Task } from './task.service';

/**
 * A recurrence rule. The series defines a template task and a rule that
 * "stamps" copies of it onto specific dates between `rangeStart` and
 * `rangeEnd` (inclusive).
 *
 * Choice of data shape: rule + range. We deliberately do NOT pre-materialise
 * every occurrence into the tasks/ collection — for a year-long daily series
 * that would write 365 docs at create time, and changing the rule means
 * batch-updating them all. Instead, occurrences are computed lazily by
 * `expandOccurrences()` and only get written to tasks/ when the user
 * interacts with them (edit, complete, etc) — see materialiseOccurrence().
 *
 * If the user shrinks rangeEnd, any tasks already materialised after the
 * new end date must be deleted so the calendar visually drops them — see
 * pruneFutureMaterialised().
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

/**
 * A task as displayed in the UI. Either a real Task (from tasks/) or a
 * virtual occurrence synthesised by the expander. Virtual occurrences carry
 * an `isVirtual: true` flag and use a stable string id of the form
 * `virtual:{recurringId}:{occurrenceDate}` so they survive change detection.
 */
export interface VirtualOccurrence extends Task {
  isVirtual: true;
  recurringId: string;
  occurrenceDate: string;
}

export type DisplayTask = Task | VirtualOccurrence;

@Injectable({ providedIn: 'root' })
export class RecurringTaskService {
  private firestore = inject(Firestore);
  private taskService = inject(TaskService);

  getRecurringTasks(workspaceId: string): Observable<RecurringTask[]> {
    const ref = collection(this.firestore, 'recurring_tasks');
    const q = query(ref, where('workspaceId', '==', workspaceId));
    return collectionData(q, { idField: 'id' }) as Observable<RecurringTask[]>;
  }

  async addRecurringTask(data: Omit<RecurringTask, 'id'>): Promise<string> {
    const ref = collection(this.firestore, 'recurring_tasks');
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) cleaned[k] = v;
    }
    const docRef = await addDoc(ref, {
      ...cleaned,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async updateRecurringTask(id: string, data: Partial<RecurringTask>): Promise<void> {
    const ref = doc(this.firestore, `recurring_tasks/${id}`);
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) cleaned[k] = v;
    }
    await updateDoc(ref, { ...cleaned, updatedAt: serverTimestamp() });
  }

  async deleteRecurringTask(id: string): Promise<void> {
    const ref = doc(this.firestore, `recurring_tasks/${id}`);
    await deleteDoc(ref);
  }

  /**
   * After shrinking a series' rangeEnd, delete every materialised task whose
   * occurrenceDate is strictly after the new end. Tasks on the new end date
   * itself are KEPT — semantically the user said "end on this day", so
   * that day is still inclusive. Past occurrences (including already
   * completed ones) are also kept regardless: they're history, not future.
   *
   * Returns the count of deleted docs so callers can confirm to the user.
   */
  async pruneFutureMaterialised(recurringId: string, newRangeEnd: string): Promise<number> {
    const ref = collection(this.firestore, 'tasks');
    // Strict greater-than: newRangeEnd day is preserved, only later dates
    // get dropped. Don't change this to >= without re-checking the
    // expander's `ds <= rangeEnd` boundary — they must agree.
    const q = query(
      ref,
      where('recurringId', '==', recurringId),
      where('occurrenceDate', '>', newRangeEnd),
    );
    const snap = await getDocs(q);
    const deletions = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletions);
    return snap.size;
  }

  // ====================================================================
  // Rule expansion (lazy, runtime-only)
  // ====================================================================

  /**
   * Given a recurring series and a [fromDate, toDate] window, return every
   * date string within that window where the rule fires AND which falls
   * inside the series' own range.
   *
   * Pass concrete dates (no Date arithmetic surprises): always use
   * yyyy-MM-dd strings as input and output.
   */
  occurrenceDatesIn(rec: RecurringTask, fromDate: string, toDate: string): string[] {
    if (rec.status !== 'active') return [];
    // Clip window to the rule's own range so we don't iterate decades.
    const start = maxDate(rec.rangeStart, fromDate);
    const end = minDate(rec.rangeEnd, toDate);
    if (start > end) return [];

    const out: string[] = [];
    let d = parseDate(start);
    const endD = parseDate(end);
    while (!isAfter(d, endD)) {
      const ds = format(d, 'yyyy-MM-dd');
      if (this.fires(rec, d, ds)) out.push(ds);
      d = addDays(d, 1);
    }
    return out;
  }

  /** True if the rule fires on the given Date. */
  private fires(rec: RecurringTask, d: Date, ds: string): boolean {
    if (ds < rec.rangeStart || ds > rec.rangeEnd) return false;
    switch (rec.rule) {
      case 'daily':
        return true;
      case 'weekly': {
        if (!rec.weekdays || rec.weekdays.length === 0) return false;
        return rec.weekdays.includes(d.getDay());
      }
      case 'monthly':
        if (!rec.monthDay) return false;
        // Skip months that don't have this day (e.g. monthDay=31 in Feb).
        return d.getDate() === rec.monthDay;
    }
    return false;
  }

  /**
   * Convert a virtual occurrence into a real task document and return its
   * new id. Used at the moment the user first interacts with the
   * occurrence (edit, toggle complete, reschedule, delete) — until then we
   * keep the series untouched and only synthesise virtuals at runtime.
   */
  async materialiseOccurrence(virtual: VirtualOccurrence): Promise<string> {
    const id = await this.taskService.addTask({
      workspaceId: virtual.workspaceId,
      title: virtual.title,
      description: virtual.description,
      date: virtual.date,
      startTime: virtual.startTime,
      endTime: virtual.endTime,
      tags: virtual.tags ?? [],
      isUrgent: virtual.isUrgent,
      createdBy: virtual.createdBy,
      status: virtual.status,
      reminderOffset: virtual.reminderOffset,
      order: 0,
      categoryId: virtual.categoryId,
      recurringId: virtual.recurringId,
      occurrenceDate: virtual.occurrenceDate,
    } as any);
    return id;
  }

  /**
   * Build a virtual Task object for showing in lists / calendar / counts.
   * The id is deterministic ("virtual:{recId}:{date}") so when the user
   * later materialises it, the UI can swap the real id in without flicker.
   */
  buildVirtualOccurrence(rec: RecurringTask, date: string): VirtualOccurrence {
    return {
      id: `virtual:${rec.id}:${date}`,
      workspaceId: rec.workspaceId,
      categoryId: rec.categoryId,
      title: rec.title,
      description: rec.description,
      date,
      startTime: rec.startTime,
      endTime: rec.endTime,
      tags: rec.tags ?? [],
      isUrgent: rec.isUrgent,
      createdBy: rec.createdBy,
      status: 'pending',
      reminderOffset: rec.reminderOffset,
      order: 0,
      isVirtual: true,
      recurringId: rec.id,
      occurrenceDate: date,
    };
  }

  /**
   * Merge a list of real tasks with virtual occurrences from a set of
   * recurring series, within [fromDate, toDate]. Real tasks "win": if a
   * task with `recurringId === rec.id && occurrenceDate === d` exists in
   * `tasks`, we keep the real one and skip the virtual.
   *
   * This is the function views should call before filtering for date /
   * urgent / category / etc.
   */
  expandMerged(
    realTasks: Task[],
    recurrings: RecurringTask[],
    fromDate: string,
    toDate: string,
  ): DisplayTask[] {
    const materialisedKey = new Set<string>();
    for (const t of realTasks) {
      if ((t as any).recurringId && (t as any).occurrenceDate) {
        materialisedKey.add(`${(t as any).recurringId}:${(t as any).occurrenceDate}`);
      }
    }
    const virtuals: VirtualOccurrence[] = [];
    for (const rec of recurrings) {
      for (const ds of this.occurrenceDatesIn(rec, fromDate, toDate)) {
        if (materialisedKey.has(`${rec.id}:${ds}`)) continue;
        virtuals.push(this.buildVirtualOccurrence(rec, ds));
      }
    }
    return [...realTasks, ...virtuals];
  }
}

// -------- date helpers (no external deps so this stays self-contained) --------
function parseDate(ds: string): Date {
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function maxDate(a: string, b: string): string { return a > b ? a : b; }
function minDate(a: string, b: string): string { return a < b ? a : b; }
