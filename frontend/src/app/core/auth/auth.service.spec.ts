import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    sessionStorage.clear();
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('starts logged out', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.user()).toBeNull();
  });

  it('login stores the token and user', () => {
    const user = {
      userId: 'u1',
      name: 'Maria Souza',
      email: 'maria@example.com',
      role: 'guardian',
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
    };
    service.login({ email: 'maria@example.com', password: 'senha12345' }).subscribe();

    http.expectOne('/api/auth/login').flush({ token: 'tok-1', user });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.token()).toBe('tok-1');
    expect(service.user()?.name).toBe('Maria Souza');
    expect(sessionStorage.getItem('lp_auth_token')).toBe('tok-1');
  });

  it('logout clears the session', () => {
    sessionStorage.setItem('lp_auth_token', 'tok-1');
    service.logout().subscribe();
    http.expectOne('/api/auth/logout').flush({ message: 'ok' });

    expect(service.isAuthenticated()).toBe(false);
    expect(service.user()).toBeNull();
    expect(sessionStorage.getItem('lp_auth_token')).toBeNull();
  });
});