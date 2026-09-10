import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { StudentsService } from '../../core/students/students.service';
import { StudentWorkspace } from './student-workspace';

const observation = {
  observationTimestamp: '2026-08-01T00:00:00Z',
  category: 'attention',
  text: 'Foco mantido em leitura.',
  rating: 4,
  submittedBy: 'u1',
};

const recommendation = {
  recoId: 'r1',
  kind: 'learning-strategy' as const,
  title: 'Leitura em voz alta',
  text: 'Ler trechos em voz alta para reforçar a compreensão.',
  tags: ['leitura'],
  status: 'proposed' as const,
  visibility: 'private' as const,
  source: null,
  createdBy: 'u1',
  createdAt: '2026-08-01T00:00:00Z',
};

const proposeSpy = vi.fn(() => of({ studentId: 's1', recoId: 'r2' }));
const updateSpy = vi.fn(() => of({ studentId: 's1', recoId: 'r1' }));

const studentsStub = {
  getStudent: () => of({ student: { studentId: 's1', name: 'Ana Lima', grade: '6º ano', status: 'active' } }),
  observations: () => of({ data: [observation], count: 1 }),
  recommendations: () => of({ data: [recommendation], count: 1 }),
  addObservation: () => of({}),
  deleteObservation: () => of({}),
  proposeRecommendation: proposeSpy,
  updateRecommendation: updateSpy,
};

const authStub = {
  user: () => ({ userId: 'u1' }),
};

describe('StudentWorkspace', () => {
  let fixture: ComponentFixture<StudentWorkspace>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [StudentWorkspace],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: StudentsService, useValue: studentsStub },
        provideRouter([]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StudentWorkspace);
    fixture.componentRef.setInput('studentId', 's1');
    fixture.detectChanges();
  });

  it('renders observations for the student', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Foco mantido em leitura.');
  });

  it('renders proposed recommendations with a propose form', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Leitura em voz alta');
    expect(text).toContain('Proposta');
  });

  it('proposes a recommendation from the form', () => {
    fixture.componentInstance.recoForm.setValue({ title: 'Mapas mentais', text: 'Usar organizadores gráficos.' });
    fixture.componentInstance.submitRecommendation();
    expect(proposeSpy).toHaveBeenCalledWith('s1', { title: 'Mapas mentais', text: 'Usar organizadores gráficos.' });
  });

  it('can approve a proposed recommendation', () => {
    fixture.componentInstance.updateRecommendation('r1', { status: 'approved' });
    expect(updateSpy).toHaveBeenCalledWith('s1', 'r1', { status: 'approved' });
  });
});