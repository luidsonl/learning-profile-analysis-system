import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { AuthService } from '../../core/auth/auth.service';
import { Home } from './home';

describe('Home', () => {
  describe('anonymous', () => {
    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [Home],
        providers: [
          provideRouter([]),
          {
            provide: AuthService,
            useValue: {
              user: () => null,
              isAuthenticated: () => false,
            },
          },
        ],
      }).compileComponents();
    });

    it('renders the landing card', () => {
      const fixture = TestBed.createComponent(Home);
      fixture.detectChanges();
      const title = fixture.nativeElement.querySelector('mat-card-title') as HTMLElement;
      expect(title.textContent).toContain('Bem-vindo ao Perfil de Aprendizado');
    });
  });

  describe('authenticated', () => {
    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [Home],
        providers: [
          provideRouter([]),
          {
            provide: AuthService,
            useValue: {
              user: signal({ name: 'Maria Souza' }),
              isAuthenticated: () => true,
            },
          },
        ],
      }).compileComponents();
    });

    it('greets the user by first name', () => {
      const fixture = TestBed.createComponent(Home);
      fixture.detectChanges();
      const title = fixture.nativeElement.querySelector('mat-card-title') as HTMLElement;
      expect(title.textContent).toContain('Olá, Maria!');
    });
  });
});