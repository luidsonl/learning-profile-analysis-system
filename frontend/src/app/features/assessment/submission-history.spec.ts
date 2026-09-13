import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { FormsService } from '../../core/forms/forms.service';
import { StudentsService } from '../../core/students/students.service';
import { PredictionPollingService } from '../../core/predictions/prediction-polling.service';
import { SubmissionHistory } from './submission-history';

const varkForm = {
  formId: 'vark',
  version: 2,
  name: 'VARK',
  audience: 'student',
  description: 'Questionário VARK',
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

const pendingItem = { ...responseItem, submissionId: 'sub9', prediction: null };

describe('SubmissionHistory', () => {
  let fixture: ComponentFixture<SubmissionHistory>;
  let responsesSpy: ReturnType<typeof vi.fn>;
  let pollForSpy: ReturnType<typeof vi.fn>;
  let pollingState: ReturnType<typeof signal<import('../../core/predictions/prediction-polling.service').PollState>>;

  beforeEach(() => {
    responsesSpy = vi.fn(() => of({ data: [responseItem], count: 1 }));
    pollingState = signal({ status: 'idle' });
    pollForSpy = vi.fn((opts: { submissionId: string }) =>
      pollingState.set({ status: 'processing', submissionId: opts.submissionId }),
    );
    TestBed.configureTestingModule({
      imports: [SubmissionHistory],
      providers: [
        { provide: AuthService, useValue: { user: () => ({ role: 'educator', userId: 'u1' }), studentId: () => null } },
        {
          provide: StudentsService,
          useValue: {
            getStudent: () => of({ student: { studentId: 's1', name: 'Ana Lima', status: 'active', createdBy: 'u1', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' } }),
            responses: responsesSpy,
          },
        },
        {
          provide: FormsService,
          useValue: {
            listForms: () => of({ data: [varkForm], count: 1 }),
            getForm: () => of({ form: varkForm }),
          },
        },
        {
          provide: PredictionPollingService,
          useValue: { state: pollingState, submit: vi.fn(), retry: vi.fn(), reset: vi.fn(), pollFor: pollForSpy },
        },
        provideRouter([]),
        provideAnimations(),
      ],
    });
    fixture = TestBed.createComponent(SubmissionHistory);
  });

  const mount = async () => {
    fixture.componentRef.setInput('studentId', 's1');
    fixture.componentRef.setInput('formId', 'vark');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('renders the submission history with prediction and assessment', async () => {
    await mount();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Ana Lima');
    expect(el.textContent).toContain('Perfil: Cinestésico');
    expect(el.textContent).toContain('Confiança 81%');
    expect(el.textContent).toContain('Classificação: Cinestésico');
    expect(responsesSpy).toHaveBeenCalledWith('s1', 'vark');
  });

  it('reveals the questionnaire on "Enviar nova avaliação" and collapses on cancel', async () => {
    await mount();

    const el = fixture.nativeElement as HTMLElement;
    const openButton = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Enviar nova avaliação')) as HTMLButtonElement;
    openButton.click();
    fixture.detectChanges();

    expect(el.textContent).toContain('Enviar formulário');

    const cancelButton = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Cancelar')) as HTMLButtonElement;
    cancelButton.click();
    fixture.detectChanges();

    expect(el.textContent).not.toContain('Enviar formulário');
  });

  it('refreshes the history once the API accepts the submission', async () => {
    await mount();
    expect(responsesSpy).toHaveBeenCalledTimes(1);

    const openButton = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) => b.textContent?.includes('Enviar nova avaliação')) as HTMLButtonElement;
    openButton.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    pollingState.set({ status: 'processing', submissionId: 'sub9' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(responsesSpy).toHaveBeenCalledTimes(2);
  });

  it('empty history prompts the first fill', async () => {
    responsesSpy.mockReturnValue(of({ data: [], count: 0 }));
    await mount();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Nenhum envio ainda');
  });

  it('auto-polls a pending prediction and reveals the result when it lands', async () => {
    responsesSpy.mockReturnValue(of({ data: [pendingItem], count: 1 }));
    await mount();

    expect(pollForSpy).toHaveBeenCalledWith({ studentId: 's1', formId: 'vark', submissionId: 'sub9' });
    let el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Resultado em geração');

    responsesSpy.mockReturnValue(
      of({ data: [{ ...pendingItem, prediction: responseItem.prediction }], count: 1 }),
    );
    pollingState.set({ status: 'ready', prediction: { predictionId: 'p9', label: 'K', scores: {}, confidence: 0.8 } as never });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Perfil: Cinestésico');
    expect(el.textContent).not.toContain('Resultado em geração');
  });
});