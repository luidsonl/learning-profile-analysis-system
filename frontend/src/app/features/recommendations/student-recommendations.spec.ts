import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { StudentsService } from '../../core/students/students.service';
import { StudentRecommendations } from './student-recommendations';

const recommendations = {
  data: [
    {
      recoId: 'r1',
      kind: 'manual',
      title: 'Leitura em voz alta',
      text: 'Praticar leitura compartilhada com o estudante.',
      tags: ['leitura'],
      status: 'published',
      visibility: 'published',
      createdBy: 'u1',
      createdAt: '2026-08-01T00:00:00Z',
    },
  ],
  count: 1,
};

const studentsStub = {
  recommendations: () => of(recommendations),
};

describe('StudentRecommendations', () => {
  let fixture: ComponentFixture<StudentRecommendations>;

  async function setup(studentIdValue: string | null): Promise<void> {
    TestBed.configureTestingModule({
      imports: [StudentRecommendations],
      providers: [
        { provide: AuthService, useValue: { studentId: () => studentIdValue } },
        { provide: StudentsService, useValue: studentsStub },
        provideRouter([]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StudentRecommendations);
    fixture.detectChanges();
  }

  it('renders published recommendations', async () => {
    await setup('s1');
    const title = fixture.nativeElement.querySelector('mat-card-title') as HTMLElement;
    expect(title.textContent).toContain('Leitura em voz alta');
  });

  it('shows guidance for unlinked accounts', async () => {
    await setup(null);
    const card = fixture.nativeElement.querySelector('.state-content') as HTMLElement;
    expect(card.textContent).toContain('Vincule a conta');
  });
});