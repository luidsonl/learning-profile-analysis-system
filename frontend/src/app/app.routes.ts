import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  {
    path: 'avaliacao',
    canActivate: [authGuard],
    loadComponent: () => import('./features/assessment/vark-assessment').then((m) => m.VarkAssessment),
  },
  {
    path: 'perfil',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/student-profile').then((m) => m.StudentProfile),
  },
  {
    path: 'recomendacoes',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/recommendations/student-recommendations').then((m) => m.StudentRecommendations),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register').then((m) => m.Register),
  },
  { path: '**', redirectTo: '' },
];