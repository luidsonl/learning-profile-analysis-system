import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { FormsService } from '../../core/forms/forms.service';
import { PredictionPollingService, PollState } from '../../core/predictions/prediction-polling.service';
import { FormAssessment, AnswerValue } from './form-assessment';

const mixedForm = {
  form: {
    formId: 'anamnesis',
    version: 1,
    name: 'Anamnese',
    audience: 'guardian',
    description: 'Anamnese',
    result: { hasInference: false, type: 'none' },
    sections: [
      {
        id: 'sec1',
        title: 'Dados gerais',
        group: 'sec1',
        questions: [
          { id: 'a01', type: 'date', text: 'Data de nascimento', group: 'sec1' },
          { id: 'a02', type: 'single', text: 'Como foi o desenvolvimento da fala?', group: 'sec1', options: ['dentro do esperado', 'atrasado'] },
          { id: 'a08', type: 'multiple', text: 'Quais áreas chamam atenção?', group: 'sec1', options: ['leitura', 'matemática'] },
          { id: 'a07', type: 'text', text: 'Como foi a adaptação?', group: 'sec1' },
          { id: 'n1', type: 'number', text: 'Quantos irmãos?', group: 'sec1' },
          { id: 'l1', type: 'likert', text: 'Frequência', group: 'sec1', options: [1, 2, 3, 4, 5] },
        ],
      },
    ],
  },
};

// The vark definition serves result metadata declaring an async inference.
const varkLikeForm = {
  form: {
    ...mixedForm.form,
    formId: 'vark',
    name: 'VARK',
    result: { hasInference: true, type: 'label' },
  },
};

describe('FormAssessment', () => {
  let fixture: ComponentFixture<FormAssessment>;
  let pollingState: ReturnType<typeof signal<PollState>>;
  let submitSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    pollingState = signal({ status: 'idle' } satisfies PollState);
    submitSpy = vi.fn();
    await TestBed.configureTestingModule({
      imports: [FormAssessment],
      providers: [
        { provide: FormsService, useValue: { getForm: (id: string) => of(id === 'vark' ? varkLikeForm : mixedForm) } },
        {
          provide: PredictionPollingService,
          useValue: {
            state: pollingState,
            submit: submitSpy,
            retry: vi.fn(),
            reset: vi.fn(),
          },
        },
        provideRouter([]),
        provideAnimations(),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FormAssessment);
    fixture.componentRef.setInput('studentId', 's1');
    fixture.componentRef.setInput('formId', 'anamnesis');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders an input for every question type', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('input[type=date]')).toBeTruthy();
    expect(el.querySelector('textarea')).toBeTruthy();
    expect(el.querySelector('input[type=number]')).toBeTruthy();
    expect(el.querySelectorAll('mat-radio-button').length).toBe(7); // 2 single + 5 likert
    expect(el.querySelectorAll('mat-checkbox').length).toBe(2);
  });

  it('renders text-like inputs empty before answering (no "undefined")', () => {
    const el = fixture.nativeElement as HTMLElement;
    const date = el.querySelector('input[type=date]') as HTMLInputElement;
    const number = el.querySelector('input[type=number]') as HTMLInputElement;
    const textarea = el.querySelector('textarea') as HTMLTextAreaElement;
    expect(date.value).toBe('');
    expect(number.value).toBe('');
    expect(textarea.value).toBe('');
    expect(el.textContent).not.toContain('undefined');
  });

  it('submits the collected values and never triggers the native reload', () => {
    const event = { preventDefault: vi.fn() } as unknown as SubmitEvent;

    const component = fixture.componentInstance;
    component.onTextInput('a01', { target: { value: '2016-03-12' } } as unknown as Event);
    component.onAnswer('a02', 'atrasado');
    component.onToggleMultiple('a08', 'leitura', true);
    component.onToggleMultiple('a08', 'matemática', true);
    component.onTextInput('a07', { target: { value: 'Boa adaptação' } } as unknown as Event);
    component.onNumberInput('n1', { target: { valueAsNumber: 2 } } as unknown as Event);
    component.onAnswer('l1', 4);
    fixture.detectChanges();

    const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Enviar formulário'),
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.type).toBe('button');

    component.submit(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(submitSpy).toHaveBeenCalledTimes(1);
    const arg = submitSpy.mock.calls[0][0];
    expect(arg.studentId).toBe('s1');
    expect(arg.formId).toBe('anamnesis');
    const answers = arg.answers as Record<string, AnswerValue>;
    expect(answers).toEqual({
      a01: '2016-03-12',
      a02: 'atrasado',
      a08: ['leitura', 'matemática'],
      a07: 'Boa adaptação',
      n1: 2,
      l1: 4,
    });
  });

  it('shows a visual success state once the API accepts the submission', async () => {
    const accepted = vi.fn();
    fixture.componentInstance.accepted.subscribe(accepted);

    pollingState.set({ status: 'processing', submissionId: 'sub1' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(accepted).toHaveBeenCalledTimes(1);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Formulário enviado com sucesso!');
    // Forms without inference never promise an async result.
    expect(text).not.toContain('Gerando resultado');
  });

  it('emits predicted when the prediction lands (predicting forms)', async () => {
    fixture.componentRef.setInput('formId', 'vark');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const predicted = vi.fn();
    fixture.componentInstance.predicted.subscribe(predicted);

    pollingState.set({ status: 'ready', prediction: { label: 'K' } as never });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(predicted).toHaveBeenCalledTimes(1);
  });

  it('shows success + a "generating result" indicator for vark, then the result', async () => {
    fixture.componentRef.setInput('formId', 'vark');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    pollingState.set({ status: 'processing', submissionId: 'sub2' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    let text = fixture.nativeElement.textContent;
    expect(text).toContain('Formulário enviado com sucesso!');
    expect(text).toContain('Gerando resultado');

    pollingState.set({ status: 'ready', prediction: { label: 'K' } as never });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    text = fixture.nativeElement.textContent;
    expect(text).toContain('Resultado gerado!');
    expect(text).not.toContain('Gerando resultado');
  });
});