import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PublicUser } from '../../core/api/types';
import { AuthService } from '../../core/auth/auth.service';
import { MeuPerfil } from './meu-perfil';

const adminUser: PublicUser = {
  userId: 'a1',
  name: 'Ana Souza',
  email: 'ana@example.com',
  role: 'admin',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
};

const studentUser: PublicUser = {
  userId: 's1',
  name: 'Leo Silva',
  email: 'leo@example.com',
  role: 'student',
  status: 'active',
  createdAt: '2026-02-01T00:00:00Z',
  birthDate: '2010-05-10',
};

describe('MeuPerfil', () => {
  let fixture: ComponentFixture<MeuPerfil>;

  function setup(user: PublicUser, studentId: string | null): void {
    TestBed.configureTestingModule({
      imports: [MeuPerfil],
      providers: [
        {
          provide: AuthService,
          useValue: { user: signal(user), studentId: signal<string | null>(studentId) },
        },
        provideRouter([]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MeuPerfil);
    fixture.detectChanges();
  }

  it('shows account info and an admin badge for admins', async () => {
    setup(adminUser, null);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('ana@example.com');
    expect(text).toContain('Administrador');
    expect(text).not.toContain('Área do administrador');
    const adminLink = fixture.nativeElement.querySelector('a[href="/admin"]') as HTMLAnchorElement;
    expect(adminLink).toBeFalsy();
  });

  it('keeps the waiting state for unlinked students', async () => {
    setup(studentUser, null);
    expect(fixture.nativeElement.textContent).toContain('Aguardando vínculo');
  });
});