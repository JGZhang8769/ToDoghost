import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent) },
  { path: 'workspaces', loadComponent: () => import('./features/workspace-list/workspace-list.component').then(m => m.WorkspaceListComponent) },
  { path: 'main', loadComponent: () => import('./features/main-view/main-view.component').then(m => m.MainViewComponent) },
  // /pro dispatches to either ProMainView (desktop) or ProMobileView (touch
  // + narrow screen) at runtime — see ProDispatcherComponent.detectPhone().
  { path: 'pro', loadComponent: () => import('./features/pro-dispatcher/pro-dispatcher.component').then(m => m.ProDispatcherComponent) },
  // Pro Mobile-only full-screen detail / edit / create views.
  { path: 'pro/new', loadComponent: () => import('./features/pro-mobile-task/pro-mobile-task.component').then(m => m.ProMobileTaskComponent) },
  { path: 'pro/task/:id', loadComponent: () => import('./features/pro-mobile-task/pro-mobile-task.component').then(m => m.ProMobileTaskComponent) },
  { path: 'settings', loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent) },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' }
];
