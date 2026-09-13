import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { StudentsService } from '../../core/students/students.service';
import { SelectStudent } from './select-student';

const studentA = {
  studentId: 's1',
  name: 'Ana Lima',
  grade: '6º ano',
  school: 'Escola Coop',
  status: 'active',
  createdBy: 'u1',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

const studentB = {
  studentId: 's2',
  name: 'Bruno Sá',
  status: 'active',
  createdBy: 'u1',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

describe('SelectStudent', () => {
  let fixture: ComponentFixture<SelectStudent>;

  const setup = (user: { role: string; userId: string }, studentId: string | null) => {
    const studentsStub = {
      list: () => of({ data: [studentA, studentB], count: 2 }),
      getStudent: () => of({ student: studentA }),
    };
    TestBed.configureTestingModule({
      imports: [SelectStudent],
      providers: [
        { provide: AuthService, useValue: { user: () => user, studentId: () => studentId } },
        { provide: StudentsService, useValue: studentsStub },
        provideRouter([]),
      ],
    });
    fixture = TestBed.createComponent(SelectStudent);
    fixture.detectChanges();
  };

  it('educator/guardian pick from the in-scope student cards', () => {
    setup({ role: 'educator', userId: 'u1' }, null);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Ana Lima');
    expect(el.textContent).toContain('Bruno Sá');
    expect(el.textContent).toContain('6º ano · Escola Coop');
    expect(el.querySelector('a[href="/avaliacoes/s1"]')).toBeTruthy();
    expect(el.querySelector('a[href="/avaliacoes/s2"]')).toBeTruthy();
  });

  it('student sees only their own linked profile', () => {
    setup({ role: 'student', userId: 'u1' }, 's1');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Ana Lima');
    expect(el.textContent).not.toContain('Bruno Sá');
    expect(el.querySelector('a[href="/avaliacoes/s1"]')).toBeTruthy();
  });

  it('unlinked student gets a hint instead of a list', () => {
    setup({ role: 'student', userId: 'u1' }, null);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('ainda não está vinculada a um perfil de estudante');
  });
});