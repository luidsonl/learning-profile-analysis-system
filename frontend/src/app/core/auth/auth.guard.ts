import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

// Requires a session token; pending student accounts are allowed in (they get
// the restricted self-service area) — status is not a routable gate.
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};

// Admin + educator area (approvals + user management). Educators get a
// role-conditional UI: they can only approve/deny guardian and student
// accounts (status only) — role/password/delete stay admin-gated.
export const adminOrEducatorGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = await auth.ensureSession();
  if (user?.role === 'admin' || user?.role === 'educator') {
    return true;
  }
  return router.createUrlTree(['/']);
};

// A student has exactly one target profile — the one attributed to them — so
// the `/avaliacoes` step-1 selector is skipped: the student is sent straight
// to `/avaliacoes/:ownStudentId` (form selection). An unlinked student stays
// on `/avaliacoes` where the "conta não vinculada" hint lives.
export const skipStudentSelectorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.user()?.role !== 'student') {
    return true;
  }
  const ownId = auth.studentId();
  return ownId ? router.createUrlTree(['/avaliacoes', ownId]) : true;
};