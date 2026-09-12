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

// Admin-only area (approvals + user management). Rehydrates the session first
// because admin nav/routes can be deep-linked before app bootstrapping loads me().
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = await auth.ensureSession();
  if (user?.role === 'admin') {
    return true;
  }
  return router.createUrlTree(['/']);
};