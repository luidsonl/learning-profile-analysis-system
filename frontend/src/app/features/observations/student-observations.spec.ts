import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { StudentsService } from '../../core/students/students.service';
import { StudentObservations } from './student-observations';

const observations = {
  data: [
    {
      observationTimestamp: '2026-08-01T00:00:00Z',
      category: 'Atenção',
      text: 'Mantém o foco em atividades de leitura.',
      rating: 4,
      submittedBy: 'u1',
    },
  ],
  count: 1,
};

const studentsStub = {
  observations: () => of(observations),
};

describe('StudentObservations', () => {
  let fixture: ComponentFixture<StudentObservations>;

  async function setup(studentIdValue: string | null): Promise<void> {
    TestBed.configureTestingModule({
      imports: [StudentObservations],
      providers: [
        { provide: AuthService, useValue: { studentId: () => studentIdValue } },
        { provide: StudentsService, useValue: studentsStub },
        provideRouter([]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StudentObservations);
    fixture.detectChanges();
  }

  it('renders educator observations read-only', async () => {
    await setup('s1');
    const title = fixture.nativeElement.querySelector('mat-card-title') as HTMLElement;
    expect(title.textContent).toContain('Atenção');
    const content = fixture.nativeElement.querySelector('.state-content') as HTMLElement;
    expect(content).toBeNull();
  });

  it('shows guidance for unlinked accounts', async () => {
    await setup(null);
    const card = fixture.nativeElement.querySelector('.state-content') as HTMLElement;
    expect(card.textContent).toContain('Vincule a conta');
  });
});