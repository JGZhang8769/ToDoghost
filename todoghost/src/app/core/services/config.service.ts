import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface SystemConfig {
  valid: boolean;
}

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private firestore = inject(Firestore);

  // Read system_configs/loginAuth
  getLoginAuthFeatureFlag(): Observable<boolean> {
    const configDocRef = doc(this.firestore, 'system_configs/loginAuth');
    return docData(configDocRef).pipe(
      map(data => {
        if (!data) return false;
        return data['valid'] === true;
      })
    );
  }
}
