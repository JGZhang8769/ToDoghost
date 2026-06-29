import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, addDoc, updateDoc, deleteDoc, deleteField, query, where, serverTimestamp } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface Task {
  id: string;
  workspaceId: string;
  categoryId?: string;     // Category ID
  title: string;
  description?: string;
  date: string | null;     // 'yyyy-MM-dd' or null if unscheduled
  startTime: string | null; // 'HH:mm' or null
  endTime: string | null;   // 'HH:mm' or null
  tags: string[];
  isUrgent: boolean;
  createdBy: string;       // User ID
  status: 'pending' | 'completed';
  reminderOffset: number | null; // minutes before start time to notify
  order: number;
  /** When set, this task was generated as part of a recurring series and
   *  the series doc lives at recurring_tasks/{recurringId}. The link is
   *  one-way: tasks know their series, the series doc doesn't list its
   *  tasks (we always discover them via where(recurringId == ?)). Drives
   *  the 系列設定 footer in the edit page. */
  recurringId?: string;
  createdAt?: any;
  updatedAt?: any;
}

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private firestore = inject(Firestore);

  getTasks(workspaceId: string): Observable<Task[]> {
    const tasksRef = collection(this.firestore, 'tasks');
    const q = query(
      tasksRef,
      where('workspaceId', '==', workspaceId)
    );
    return collectionData(q, { idField: 'id' }) as Observable<Task[]>;
  }

  async addTask(taskData: Omit<Task, 'id'>) {
    const tasksRef = collection(this.firestore, 'tasks');
    // Firestore rejects undefined values — strip them before send so callers
    // can pass categoryId/description/etc as undefined for "not set".
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(taskData)) {
      if (v !== undefined) cleaned[k] = v;
    }
    const enrichedData = {
      ...cleaned,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    try {
      const docRef = await addDoc(tasksRef, enrichedData);
      return docRef.id;
    } catch (e) {
      console.error("Error adding document: ", e);
      throw e;
    }
  }

  async updateTask(taskId: string, data: Partial<Task>) {
    const taskRef = doc(this.firestore, `tasks/${taskId}`);
    try {
      // Map values:
      //   undefined → strip (caller didn't pass this key)
      //   null on optional fields (categoryId) → deleteField() so Firestore
      //     actually removes the property; passing literal null leaves stale
      //     data on read and won't match `where(..., '==', undefined)` queries.
      const cleanData: Record<string, any> = {};
      for (const [k, v] of Object.entries(data)) {
        if (v === undefined) continue;
        if (v === null && k === 'categoryId') {
          cleanData[k] = deleteField();
        } else {
          cleanData[k] = v;
        }
      }

      await updateDoc(taskRef, {
        ...cleanData,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error("Error updating document: ", e);
      throw e;
    }
  }

  async deleteTask(taskId: string) {
    const taskRef = doc(this.firestore, `tasks/${taskId}`);
    try {
      await deleteDoc(taskRef);
    } catch (e) {
      console.error("Error deleting document: ", e);
      throw e;
    }
  }
}
