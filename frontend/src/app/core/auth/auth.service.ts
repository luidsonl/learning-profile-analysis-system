import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { tap } from 'rxjs';

import {
  LoginRequest,
  LoginResponse,
  MeResponse,
  PublicUser,
  RegisterRequest,
  RegisterResponse,
} from '../api/types';

const TOKEN_KEY = 'lp_auth_token';

// Session follows the backend decision: token in `sessionStorage` (survives
// reload within the tab) plus in-memory signal; no idle auto-logout locally —
// the SESSION# TTL server-side governs expiry.
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly token$ = signal<string | null>(sessionStorage.getItem(TOKEN_KEY));
  private readonly user$ = signal<PublicUser | null>(null);

  readonly token = this.token$.asReadonly();
  readonly user = this.user$.asReadonly();
  readonly isAuthenticated = computed(() => this.token$() !== null);

  login(payload: LoginRequest) {
    return this.http.post<LoginResponse>('/api/auth/login', payload).pipe(
      tap(({ token, user }) => {
        this.token$.set(token);
        this.user$.set(user);
        sessionStorage.setItem(TOKEN_KEY, token);
      }),
    );
  }

  register(payload: RegisterRequest) {
    return this.http.post<RegisterResponse>('/api/auth/register', payload);
  }

  me() {
    return this.http.get<MeResponse>('/api/auth/me').pipe(tap(({ user }) => this.user$.set(user)));
  }

  logout() {
    return this.http.post<unknown>('/api/auth/logout', null).pipe(tap(() => this.clearSession()));
  }

  clearSession() {
    this.token$.set(null);
    this.user$.set(null);
    sessionStorage.removeItem(TOKEN_KEY);
  }
}