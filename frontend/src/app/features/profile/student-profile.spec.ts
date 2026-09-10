import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { StudentsService } from '../../core/students/students.service';
import { StudentProfile } from './student-profile';

const student = {
  studentId: 's1',
  name: 'Ana Lima',
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  createdBy: 'u1',
  varkLabel: 'R',
  varkScores: { R: 5, A: 1, K: 2 },
  varkMultimodal: false,
};

const studentsStub = {
  getStudent: () => of({ student }),
  assessments: () => of({ data: [], count: 0 }),
  predictions: () => of({ data: [], count: 0 }),
  updateStudent: (id: string, body: unknown) => of({ studentId: id, updated: ['name'], received: body }),
};

describe('StudentProfile', () => {
  let fixture: ComponentFixture<StudentProfile>;

  function setup(studentIdValue: string | null): void {
    TestBed.configureTestingModule({
      imports: [StudentProfile],
      providers: [
        { provide: AuthService, useValue: { studentId: () => studentIdValue } },
        { provide: StudentsService, useValue: studentsStub },
        provideRouter([]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StudentProfile);
    fixture.detectChanges();
  }

  it('renders the student name and VARK label when linked', async () => {
    await setup('s1');
    const heading = fixture.nativeElement.querySelector('h1') as HTMLElement;
    expect(heading.textContent).toContain('Ana Lima');
    const chips = Array.from(fixture.nativeElement.querySelectorAll('mat-chip')).map((el) =>
      (el as HTMLElement).textContent?.trim(),
    );
    expect(chips).toContain('Leitura e escrita');
  });

  it('shows the waiting state for unlinked accounts', async () => {
    await setup(null);
    const card = fixture.nativeElement.querySelector('.state-content') as HTMLElement;
    expect(card?.textContent).toContain('Aguardando vínculo');
  });

  it('allows renaming only on the own profile', async () => {
    await setup('s1');
    expect(fixture.componentInstance.isOwnProfile()).toBe(true);
    fixture.componentInstance.toggleRename();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[formcontrolname="name"]') as HTMLInputElement;
    expect(input).toBeTruthy();
  });
});