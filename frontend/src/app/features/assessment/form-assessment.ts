import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { switchMap } from 'rxjs';

import { FormQuestion } from '../../core/api/types';
import { FormsService } from '../../core/forms/forms.service';
import { PredictionPollingService } from '../../core/predictions/prediction-polling.service';

export type AnswerValue = string | number | string[];

// Forms that carry a bundled ML model and therefore produce a PRED# item (the
// inference Lambda routes by formId; only `vark` ships today). Other forms are
// stored and answered immediately — there is nothing to poll for asynchronously.
const PREDICTING_FORMS = ['vark'];

// Generic questionnaire renderer: reads the form definition via GET /forms/:id
// and renders every question type (single/multiple/likert/text/date/number).
// The submission is stored immediately (idempotent via requestId); on acceptance
// the parent refreshes the history, and forms with a bundled model keep polling
// for the async prediction.
@Component({
  selector: 'app-form-assessment',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatRadioModule,
  ],
  templateUrl: './form-assessment.html',
  styleUrl: './form-assessment.scss',
})
export class FormAssessment {
  readonly studentId = input.required<string>();
  readonly formId = input.required<string>();
  // The submission was accepted by the API (the row now shows in the history).
  readonly accepted = output<void>();
  // The async prediction landed (only for forms with a bundled model).
  readonly predicted = output<void>();

  private readonly forms = inject(FormsService);
  readonly polling = inject(PredictionPollingService);

  private readonly formRequest = toObservable(this.formId).pipe(
    switchMap((id) => this.forms.getForm(id)),
  );
  readonly form = toSignal(this.formRequest, { initialValue: undefined });

  readonly answers = signal<Record<string, AnswerValue>>({});
  readonly done = signal(false);

  private acceptedAnnounced = false;
  private predictedAnnounced = false;

  readonly predicts = computed(() => PREDICTING_FORMS.includes(this.formId()));

  readonly questions = computed(() => {
    const def = this.form();
    if (!def) {
      return [];
    }
    return def.form.sections.flatMap((section) => section.questions);
  });

  readonly totalQuestions = computed(() => this.questions().length);

  readonly answeredCount = computed(
    () => this.questions().filter((question) => this.isAnswered(question)).length,
  );

  readonly allAnswered = computed(
    () => this.totalQuestions() > 0 && this.answeredCount() >= this.totalQuestions(),
  );

  readonly isProcessing = computed(() => this.polling.state().status === 'processing');

  readonly failMessage = computed(() => {
    const state = this.polling.state();
    return state.status === 'failed' ? state.message : null;
  });

  constructor() {
    // Switching the target student or form restarts the fill flow.
    effect(() => {
      void this.studentId();
      void this.formId();
      this.reset();
    });

    // Announce the submission as accepted as soon as the API confirms it, and
    // the prediction once it lands. Forms without a bundled model stop polling
    // right after acceptance — the history list shows the row immediately.
    effect(() => {
      const state = this.polling.state();
      if (state.status === 'processing' && state.submissionId && !this.acceptedAnnounced) {
        this.acceptedAnnounced = true;
        this.accepted.emit();
        this.done.set(true);
        if (!this.predicts()) {
          this.polling.reset();
        }
      } else if (state.status === 'ready' && !this.predictedAnnounced) {
        this.predictedAnnounced = true;
        this.predicted.emit();
        this.done.set(true);
        this.polling.reset();
      }
    });
  }

  onAnswer(questionId: string, value: AnswerValue): void {
    this.answers.update((current) => ({ ...current, [questionId]: value }));
  }

  onToggleMultiple(questionId: string, option: string | number, checked: boolean): void {
    this.answers.update((current) => {
      const existing: string[] = Array.isArray(current[questionId])
        ? (current[questionId] as string[])
        : [];
      const selected = checked
        ? [...existing, String(option)]
        : existing.filter((value) => value !== option);
      return { ...current, [questionId]: selected };
    });
  }

  onTextInput(questionId: string, event: Event): void {
    this.onAnswer(questionId, (event.target as HTMLInputElement).value);
  }

  onNumberInput(questionId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.onAnswer(questionId, Number.isNaN(value) ? '' : value);
  }

  submit(event?: Event): void {
    event?.preventDefault();
    if (!this.studentId() || !this.allAnswered()) {
      return;
    }
    const answers: Record<string, AnswerValue> = {};
    for (const question of this.questions()) {
      if (this.isAnswered(question)) {
        answers[question.id] = this.answers()[question.id];
      }
    }
    this.polling.submit({
      studentId: this.studentId(),
      formId: this.formId(),
      answers,
      requestId: crypto.randomUUID(),
    });
  }

  reset(): void {
    this.answers.set({});
    this.done.set(false);
    this.acceptedAnnounced = false;
    this.predictedAnnounced = false;
    this.polling.reset();
  }

  isAnswered(question: FormQuestion): boolean {
    const value = this.answers()[question.id];
    if (value === undefined || value === null) {
      return false;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    return true;
  }

  isMultipleChecked(questionId: string, option: string | number): boolean {
    const value = this.answers()[questionId];
    return Array.isArray(value) && value.includes(option as string);
  }
}