import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';

const PUBLIC_AUTH_ENDPOINTS = ['/api/auth/login', '/api/auth/register'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const isPublicAuth = PUBLIC_AUTH_ENDPOINTS.some((endpoint) => req.url.startsWith(endpoint));

  const request = auth.token() && !isPublicAuth
    ? req.clone({ setHeaders: { Authorization: `Bearer ${auth.token()}` } })
    : req;

  return next(request).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !isPublicAuth) {
        auth.clearSession();
        void router.navigateByUrl('/login');
      }
      return throwError(() => err);
    }),
  );
};