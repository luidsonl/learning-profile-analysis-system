import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { FormsService } from '../../core/forms/forms.service';
import { PredictionPollingService, PollState } from '../../core/predictions/prediction-polling.service';
import { VarkAssessment } from './vark-assessment';

const formStub = {
  form: {
    formId: 'vark',
    version: 1,
    name: 'VARK',
    audience: 'student',
    description: 'teste',
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
  },
};

describe('VarkAssessment', () => {
  let fixture: ComponentFixture<VarkAssessment>;
  let pollingSpy: {
    submit: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
    state: ReturnType<typeof signal<PollState>>;
  };

  beforeEach(async () => {
    pollingSpy = {
      submit: vi.fn(),
      retry: vi.fn(),
      reset: vi.fn(),
      state: signal({ status: 'idle' } satisfies PollState),
    };
    await TestBed.configureTestingModule({
      imports: [VarkAssessment],
      providers: [
        {
          provide: FormsService,
          useValue: { getForm: () => of(formStub) },
        },
        {
          provide: AuthService,
          useValue: { studentId: () => 's1' },
        },
        { provide: PredictionPollingService, useValue: pollingSpy },
        provideRouter([]),
        provideAnimations(),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(VarkAssessment);
    fixture.detectChanges();
  });

  it('renders questions from the form definition', () => {
    const question = fixture.nativeElement.querySelector('.question-text') as HTMLElement;
    expect(question.textContent).toContain('Texto da pergunta 1');
  });

  it('enables submit only after all questions are answered', () => {
    const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Enviar avaliação'),
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fixture.componentInstance.onAnswer('q01', 5);
    fixture.detectChanges();

    expect(button.disabled).toBe(false);
  });

  it('submits to the polling service with the student and a request id', () => {
    fixture.componentInstance.onAnswer('q01', 5);
    fixture.detectChanges();
    fixture.componentInstance.submit();

    expect(pollingSpy.submit).toHaveBeenCalledTimes(1);
    const arg = pollingSpy.submit.mock.calls[0][0] as {
      studentId: string;
      formId: string;
      answers: Record<string, number>;
      requestId: string;
    };
    expect(arg.studentId).toBe('s1');
    expect(arg.formId).toBe('vark');
    expect(arg.answers).toEqual({ q01: 5 });
    expect(arg.requestId).toBeTruthy();
  });

  it('prevents the native form submission to avoid a page reload', () => {
    const event = { preventDefault: vi.fn() } as unknown as SubmitEvent;
    fixture.componentInstance.submit(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });
});