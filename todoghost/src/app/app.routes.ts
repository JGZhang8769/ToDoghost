import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'workspaces',
    loadComponent: () =>
      import('./features/workspace-list/workspace-list.component').then(
        (m) => m.WorkspaceListComponent,
      ),
  },
  {
    path: 'main',
    loadComponent: () =>
      import('./features/main-view/main-view.component').then(
        (m) => m.MainViewComponent,
      ),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings.component').then(
        (m) => m.SettingsComponent,
      ),
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
];
