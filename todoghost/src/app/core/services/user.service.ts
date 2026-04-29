import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, setDoc, getDoc, getDocs, query, limit } from '@angular/fire/firestore';
import { BehaviorSubject, Observable } from 'rxjs';

export interface User {
  id: string;
  name: string;
  avatar: string;
  pin?: string;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private firestore = inject(Firestore);
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  currentUser$ = this.currentUserSubject.asObservable();

  constructor() {
    this.hydrateUser();
    this.seedDefaultUsers();
  }

  private async hydrateUser() {
    const savedUserId = localStorage.getItem('currentUserId');
    if (savedUserId) {
      try {
        const userDoc = await getDoc(doc(this.firestore, `users/${savedUserId}`));
        if (userDoc.exists()) {
          const data = userDoc.data();
          this.currentUserSubject.next({
            id: savedUserId,
            name: data['name'],
            avatar: data['avatar'],
            pin: data['pin'] || '0000'
          });
        } else {
           localStorage.removeItem('currentUserId');
        }
      } catch (e) {
        console.error('Error hydrating user:', e);
      }
    }
  }

  private async seedDefaultUsers() {
      try {
          const usersRef = collection(this.firestore, 'users');
          const q = query(usersRef, limit(1));
          const snap = await getDocs(q);
          if (snap.empty) {
              await setDoc(doc(this.firestore, 'users/user1'), { name: 'R張', avatar: 'tiger', pin: '0000' });
              await setDoc(doc(this.firestore, 'users/user2'), { name: '小芷', avatar: 'rabbit', pin: '0000' });
          }
      } catch (e) {
          console.error('Failed to seed users', e);
      }
  }

  getUsers(): Observable<User[]> {
    const usersRef = collection(this.firestore, 'users');
    return collectionData(usersRef, { idField: 'id' }) as Observable<User[]>;
  }

  async addUser(name: string, avatar: string = 'default'): Promise<void> {
    const id = Date.now().toString(); // simple ID gen
    const userRef = doc(this.firestore, `users/${id}`);
    await setDoc(userRef, { name, avatar, pin: '0000' });
  }

  login(user: User): void {
    localStorage.setItem('currentUserId', user.id);
    this.currentUserSubject.next(user);
  }

  logout(): void {
    localStorage.removeItem('currentUserId');
    this.currentUserSubject.next(null);
  }
}
