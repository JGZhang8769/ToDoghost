import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, setDoc, query, where, updateDoc, arrayUnion, getDocs, getDoc } from '@angular/fire/firestore';
import { BehaviorSubject, Observable } from 'rxjs';

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
  users: string[];
  inviteCode: string | null;
  userPreferences?: Record<string, WorkspaceUserPreferences>;
}

export interface WorkspaceUserPreferences {
  tabs: ('month' | 'week' | 'day' | 'monthApple')[];
}

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private firestore = inject(Firestore);

  private currentWorkspaceSubject = new BehaviorSubject<Workspace | null>(null);
  currentWorkspace$ = this.currentWorkspaceSubject.asObservable();

  constructor() {
    this.hydrateWorkspace();
  }

  private async hydrateWorkspace() {
    const savedWsId = localStorage.getItem('currentWorkspaceId');
    if (savedWsId) {
      try {
        const wsDoc = await getDoc(doc(this.firestore, `workspaces/${savedWsId}`));
        if (wsDoc.exists()) {
          this.currentWorkspaceSubject.next({ id: savedWsId, ...(wsDoc.data() as Omit<Workspace, 'id'>) });
        } else {
          localStorage.removeItem('currentWorkspaceId');
        }
      } catch(e) {
        console.error('Error hydrating workspace:', e);
      }
    }
  }

  setCurrentWorkspace(ws: Workspace | null): void {
    if(ws) localStorage.setItem('currentWorkspaceId', ws.id);
    else localStorage.removeItem('currentWorkspaceId');
    this.currentWorkspaceSubject.next(ws);
  }

  getWorkspacesForUser(userId: string): Observable<Workspace[]> {
    const wsRef = collection(this.firestore, 'workspaces');
    const q = query(wsRef, where('users', 'array-contains', userId));
    return collectionData(q, { idField: 'id' }) as Observable<Workspace[]>;
  }

  generateInviteCode(): string {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  async createWorkspace(userId: string, name: string = ''): Promise<Workspace> {
    const id = Date.now().toString();
    const ws: Workspace = {
      id,
      name,
      createdAt: Date.now(),
      users: [userId],
      inviteCode: this.generateInviteCode()
    };
    await setDoc(doc(this.firestore, `workspaces/${id}`), ws);
    return ws;
  }

  async updateWorkspace(workspaceId: string, data: Partial<Workspace>) {
    const wsRef = doc(this.firestore, `workspaces/${workspaceId}`);
    await updateDoc(wsRef, data);

    // Update local subject if it is the current workspace
    const current = this.currentWorkspaceSubject.value;
    if (current && current.id === workspaceId) {
      this.currentWorkspaceSubject.next({ ...current, ...data });
    }
  }

  async updateUserPreferences(workspaceId: string, userId: string, preferences: WorkspaceUserPreferences) {
    const wsRef = doc(this.firestore, `workspaces/${workspaceId}`);
    const updateKey = `userPreferences.${userId}`;
    await updateDoc(wsRef, {
      [updateKey]: preferences
    });

    const current = this.currentWorkspaceSubject.value;
    if (current && current.id === workspaceId) {
      const prefs = current.userPreferences || {};
      this.currentWorkspaceSubject.next({
        ...current,
        userPreferences: {
          ...prefs,
          [userId]: preferences
        }
      });
    }
  }

  async joinWorkspaceByCode(userId: string, code: string): Promise<boolean> {
    const wsRef = collection(this.firestore, 'workspaces');
    const q = query(wsRef, where('inviteCode', '==', code));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return false;

    const docSnap = snapshot.docs[0];
    const wsData = docSnap.data() as Workspace;

    if (wsData.users.length >= 2) return false; // Max 2 users
    if (wsData.users.includes(userId)) return true; // Already in

    const updates: any = {
      users: arrayUnion(userId)
    };

    if (wsData.users.length === 1) {
      updates.inviteCode = null; // Invalidate code when full
    }

    await updateDoc(docSnap.ref, updates);
    return true;
  }
}
