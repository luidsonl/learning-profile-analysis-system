import { Routes } from '@angular/router';

import { adminOrEducatorGuard, authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  {
    path: 'avaliacoes',
    canActivate: [authGuard],
    loadComponent: () => import('./features/assessment/select-student').then((m) => m.SelectStudent),
  },
  {
    path: 'avaliacoes/:studentId',
    canActivate: [authGuard],
    loadComponent: () => import('./features/assessment/select-form').then((m) => m.SelectForm),
  },
  {
    path: 'avaliacoes/:studentId/:formId',
    canActivate: [authGuard],
    loadComponent: () => import('./features/assessment/submission-history').then((m) => m.SubmissionHistory),
  },
  {
    path: 'perfil',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/meu-perfil').then((m) => m.MeuPerfil),
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminOrEducatorGuard],
    loadComponent: () => import('./features/admin/admin-area').then((m) => m.AdminArea),
  },
  {
    path: 'estudantes',
    canActivate: [authGuard],
    loadComponent: () => import('./features/students-list/students-list').then((m) => m.StudentsList),
  },
  {
    path: 'estudantes/novo',
    canActivate: [authGuard],
    loadComponent: () => import('./features/student-create/student-create').then((m) => m.StudentCreate),
  },
  {
    path: 'estudantes/:studentId',
    canActivate: [authGuard],
    loadComponent: () => import('./features/student-workspace/student-workspace').then((m) => m.StudentWorkspace),
  },
  {
    path: 'recomendacoes',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/recommendations/student-recommendations').then((m) => m.StudentRecommendations),
  },
  {
    path: 'relatorios',
    canActivate: [authGuard],
    loadComponent: () => import('./features/reports/student-reports').then((m) => m.StudentReports),
  },
  {
    path: 'observacoes',
    canActivate: [authGuard],
    loadComponent: () => import('./features/observations/student-observations').then((m) => m.StudentObservations),
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