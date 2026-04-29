import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, setDoc, deleteDoc, collectionData, query, where, orderBy, getDocs, writeBatch } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface Category {
  id: string;
  workspaceId: string;
  name: string;
  icon: string;
  order: number;
  createdBy: string;
  createdAt: number;
}

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private firestore = inject(Firestore);
  private collectionName = 'categories';

  getCategories(workspaceId: string): Observable<Category[]> {
    const categoriesRef = collection(this.firestore, this.collectionName);
    const q = query(
      categoriesRef,
      where('workspaceId', '==', workspaceId)
    );
    return collectionData(q, { idField: 'id' }) as Observable<Category[]>;
  }

  async addCategory(category: Omit<Category, 'id'>): Promise<string> {
    const newDocRef = doc(collection(this.firestore, this.collectionName));
    const newCategory = { ...category, id: newDocRef.id };
    await setDoc(newDocRef, newCategory);
    return newDocRef.id;
  }

  async updateCategory(id: string, data: Partial<Category>): Promise<void> {
    const docRef = doc(this.firestore, this.collectionName, id);
    await setDoc(docRef, data, { merge: true });
  }

  async deleteCategory(id: string): Promise<void> {
    const docRef = doc(this.firestore, this.collectionName, id);
    await deleteDoc(docRef);
  }

  async reorderCategories(categories: Category[]): Promise<void> {
    const batch = writeBatch(this.firestore);
    categories.forEach((cat, index) => {
      const docRef = doc(this.firestore, this.collectionName, cat.id);
      batch.update(docRef, { order: index });
    });
    await batch.commit();
  }
}
