import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { FormsService } from '../../core/forms/forms.service';
import { StudentsService } from '../../core/students/students.service';
import { PredictionPollingService } from '../../core/predictions/prediction-polling.service';
import { Assessments } from './assessments';

const varkForm = {
  formId: 'vark',
  version: 2,
  name: 'VARK',
  audience: 'student',
  description: 'Estilos de aprendizagem',
  sections: [
    {
      id: 'reading',
      title: 'Leitura',
      group: 'reading',
      questions: [
        {
          id: 'q01',
          type: 'likert',
          text: 'Texto da pergunta 1',
          group: 'reading',
          options: [1, 2, 3, 4, 5],
        },
      ],
    },
  ],
};

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

const responseItem = {
  submissionId: 'sub1',
  formId: 'vark',
  formVersion: 2,
  answers: { q01: 5 },
  submittedBy: 'u1',
  submittedByRole: 'educator',
  createdAt: '2026-09-01T12:00:00Z',
  prediction: {
    predictionId: 'p1',
    model: 'vark',
    modelVersion: '2.0.0',
    method: 'logistic_regression',
    label: 'K',
    form: 'vark',
    submission: 'sub1',
    formVersion: 2,
    createdAt: '2026-09-01T12:00:03Z',
    scores: { R: 0.1, A: 0.2, K: 0.7 },
    confidence: 0.81,
  },
  assessment: {
    kind: 'vark',
    scores: { R: 15, A: 20, K: 30 },
    label: 'K',
    multimodal: false,
    method: 'flemming',
    submission: 'sub1',
    createdAt: '2026-09-01T12:00:01Z',
  },
};

describe('Assessments', () => {
  let fixture: ComponentFixture<Assessments>;

  const setup = (user: { role: string; userId: string }, studentId: string | null) => {
    const responsesSpy = vi.fn(() => of({ data: [responseItem], count: 1 }));
    const studentsStub = {
      list: () =>
        of({
          data: [studentA, studentB],
          count: 2,
        }),
      getStudent: () => of({ student: studentA }),
      responses: responsesSpy,
    };
    const authStub = { user: () => user, studentId: () => studentId };
    const pollingStub = {
      state: signal({ status: 'idle' }),
      submit: vi.fn(),
      retry: vi.fn(),
      reset: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [Assessments],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: StudentsService, useValue: studentsStub },
        {
          provide: FormsService,
          useValue: {
            listForms: () => of({ data: [varkForm], count: 1 }),
            getForm: () => of({ form: varkForm }),
          },
        },
        { provide: PredictionPollingService, useValue: pollingStub },
        provideRouter([]),
        provideAnimations(),
      ],
    });

    fixture = TestBed.createComponent(Assessments);
    fixture.detectChanges();
    return responsesSpy;
  };

  const flush = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('educator picks a student, then sees history and the fill area', async () => {
    const responsesSpy = setup({ role: 'educator', userId: 'u1' }, null);
    await flush();

    const select = fixture.nativeElement.querySelector('.student-select mat-select') as HTMLElement;
    expect(select).toBeTruthy();
    expect(fixture.nativeElement.querySelector('mat-chip')?.textContent).toContain('VARK');
    expect(responsesSpy).not.toHaveBeenCalled();

    fixture.componentInstance.onSelectStudent('s1');
    await flush();

    expect(responsesSpy).toHaveBeenCalledWith('s1', 'vark');
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Perfil: Cinestésico');
    expect(text).toContain('Confiança 81%');
    expect(text).toContain('01/09/2026');
  });

  it('student acts on their own profile: no selector, own history loads', async () => {
    const responsesSpy = setup({ role: 'student', userId: 'u1' }, 's1');
    await flush();

    expect(fixture.nativeElement.querySelector('.student-select')).toBeNull();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Perfil próprio');
    expect(text).toContain('Ana Lima');
    expect(responsesSpy).toHaveBeenCalledWith('s1', 'vark');
    expect(text).toContain('Perfil: Cinestésico');
  });

  it('student without a linked profile gets a hint instead of a questionnaire', async () => {
    setup({ role: 'student', userId: 'u1' }, null);
    await flush();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('ainda não está vinculada a um perfil de estudante');
  });
});