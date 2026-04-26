import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, addDoc, updateDoc, deleteDoc, query, where, serverTimestamp } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface Task {
  id: string;
  workspaceId: string;
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
    const enrichedData = {
      ...taskData,
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
      await updateDoc(taskRef, {
        ...data,
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
