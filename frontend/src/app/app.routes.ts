import { Routes } from '@angular/router';

import { adminGuard, authGuard } from './core/auth/auth.guard';

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
    path: 'avaliacao/:studentId',
    canActivate: [authGuard],
    loadComponent: () => import('./features/assessment/vark-assessment').then((m) => m.VarkAssessment),
  },
  {
    path: 'perfil',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/meu-perfil').then((m) => m.MeuPerfil),
  },
  {
    path: 'perfil/:studentId',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/student-profile').then((m) => m.StudentProfile),
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
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