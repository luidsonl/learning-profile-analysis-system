import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, tap } from 'rxjs';

import {
  LoginRequest,
  LoginResponse,
  MeResponse,
  PublicUser,
  RegisterRequest,
  RegisterResponse,
  StudentAccountsResponse,
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
  private readonly studentId$ = signal<string | null>(null);

  readonly token = this.token$.asReadonly();
  readonly user = this.user$.asReadonly();
  readonly studentId = this.studentId$.asReadonly();
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

  studentAccounts() {
    return this.http.get<StudentAccountsResponse>('/api/auth/student-accounts');
  }

  me() {
    return this.http
      .get<MeResponse>('/api/auth/me')
      .pipe(tap(({ user, studentId }) => {
        this.user$.set(user);
        this.studentId$.set(studentId);
      }));
  }

  // Resolves the current session user, rehydrating from /auth/me when needed
  // (route guards may run before the app-level me() call finishes).
  async ensureSession(): Promise<PublicUser | null> {
    if (this.user$()) {
      return this.user$();
    }
    if (!this.token$()) {
      return null;
    }
    try {
      await firstValueFrom(this.me());
    } catch {
      this.clearSession();
      return null;
    }
    return this.user$();
  }

  logout() {
    return this.http.post<unknown>('/api/auth/logout', null).pipe(tap(() => this.clearSession()));
  }

  clearSession() {
    this.token$.set(null);
    this.user$.set(null);
    this.studentId$.set(null);
    sessionStorage.removeItem(TOKEN_KEY);
  }
}