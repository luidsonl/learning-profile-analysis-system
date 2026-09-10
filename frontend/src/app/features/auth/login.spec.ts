import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { readApiError } from '../../core/errors/api-error';
import { Login } from './login';

describe('Login', () => {
  let fixture: import('@angular/core/testing').ComponentFixture<Login>;

  const authStub = {
    login: (payload: unknown) => of({ token: 't', user: { role: 'guardian' } }),
    isAuthenticated: () => false,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [{ provide: AuthService, useValue: authStub }, provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
  });

  it('renders the pt-BR login form', () => {
    const title = fixture.nativeElement.querySelector('mat-card-title') as HTMLElement;
    expect(title.textContent).toContain('Entrar');
    expect(fixture.nativeElement.querySelector('[formControlName=email]')).toBeTruthy();
  });

  it('shows an alert when login fails', () => {
    const invalid = TestBed.inject(AuthService) as unknown as {
      login: (payload: unknown) => import('rxjs').Observable<unknown>;
    };
    invalid.login = () =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 401,
            error: { error: { code: 'unauthorized' } } as unknown,
          }),
      );

    const form = fixture.componentInstance.form;
    form.controls.email.setValue('maria@example.com');
    form.controls.password.setValue('senha12345');
    fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role=alert]') as HTMLElement;
    expect(alert?.textContent).toContain('Sua sessão');
  });
});