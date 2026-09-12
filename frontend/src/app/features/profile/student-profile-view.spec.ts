import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { StudentsService } from '../../core/students/students.service';
import { StudentProfileView } from './student-profile-view';

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

describe('StudentProfileView', () => {
  let fixture: ComponentFixture<StudentProfileView>;

  function setup(isOwn: boolean): void {
    TestBed.configureTestingModule({
      imports: [StudentProfileView],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: StudentsService, useValue: studentsStub },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StudentProfileView);
    fixture.componentRef.setInput('studentId', 's1');
    fixture.componentRef.setInput('isOwn', isOwn);
    fixture.detectChanges();
  }

  it('renders the student name and VARK label', async () => {
    setup(false);
    const heading = fixture.nativeElement.querySelector('h1') as HTMLElement;
    expect(heading.textContent).toContain('Ana Lima');
    const chips = Array.from(fixture.nativeElement.querySelectorAll('mat-chip')).map((el) =>
      (el as HTMLElement).textContent?.trim(),
    );
    expect(chips).toContain('Leitura e escrita');
  });

  it('exposes the rename affordance only on the own profile', async () => {
    setup(true);
    expect(fixture.componentInstance.isOwn()).toBe(true);
    fixture.componentInstance.toggleRename();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[formcontrolname="name"]') as HTMLInputElement;
    expect(input).toBeTruthy();
  });
});