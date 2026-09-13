import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { of, switchMap } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { FormsService } from '../../core/forms/forms.service';
import { PredictionPollingService } from '../../core/predictions/prediction-polling.service';
import { PredictionScores } from '../../shared/ui/prediction-scores/prediction-scores';
import { VARK_LABELS, VARK_DESCRIPTIONS } from '../../core/vark/vark-labels';

@Component({
  selector: 'app-vark-assessment',
  imports: [
    MatCardModule,
    MatRadioModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    PredictionScores,
  ],
  templateUrl: './vark-assessment.html',
  styleUrl: './vark-assessment.scss',
})
export class VarkAssessment {
  // Optional route param (educator/guardian acting for a student); falls back
  // to the own studentId for a linked student's self-assessment. The input name
  // must match the route param so withComponentInputBinding binds it.
  readonly studentId = input<string>();
  // Which form is filled; only "vark" ships today (curated forms registry).
  readonly formId = input<string>('vark');
  // Emitted when a submission completes and its prediction lands (the parent
  // uses it to refresh the history list).
  readonly submitted = output<void>();

  private readonly forms = inject(FormsService);
  private readonly auth = inject(AuthService);
  readonly polling = inject(PredictionPollingService);

  readonly scopeStudentId = computed(() => this.studentId() ?? this.auth.studentId() ?? undefined);

  private readonly formRequest = toObservable(this.formId).pipe(
    switchMap((id) => this.forms.getForm(id)),
  );
  readonly form = toSignal(this.formRequest, { initialValue: undefined });

  readonly answers = signal<Record<string, number>>({});

  readonly readyPrediction = computed(() => {
    const state = this.polling.state();
    return state.status === 'ready' ? state.prediction : null;
  });

  readonly failMessage = computed(() => {
    const state = this.polling.state();
    return state.status === 'failed' ? state.message : null;
  });

  readonly isProcessing = computed(() => this.polling.state().status === 'processing');

  readonly totalQuestions = computed(() => {
    const formDef = this.form();
    if (!formDef) {
      return 0;
    }
    return formDef.form.sections.reduce((n, s) => n + s.questions.length, 0);
  });

  readonly answeredCount = computed(() => {
    const total = this.totalQuestions();
    if (total === 0) {
      return 0;
    }
    return Math.min(Object.keys(this.answers()).length, total);
  });

  readonly allAnswered = computed(() => this.answeredCount() >= this.totalQuestions());

  constructor() {
    // Switching the target student or form restarts the fill flow, so stale
    // answers or a finished prediction never leak into the next questionnaire.
    effect(() => {
      void this.studentId();
      void this.formId();
      this.reset();
    });

    // Let the parent know the history list should be refreshed.
    effect(() => {
      if (this.polling.state().status === 'ready') {
        this.submitted.emit();
      }
    });
  }

  onAnswer(questionId: string, value: number): void {
    this.answers.update((current) => ({ ...current, [questionId]: value }));
  }

  submit(event?: Event): void {
    // Without preventDefault the native form does a GET to the current URL and
    // reloads the page, aborting the request (observed in the deployed SPA).
    event?.preventDefault();
    const studentId = this.scopeStudentId();
    const formId = this.formId();
    if (!studentId || !this.allAnswered()) {
      return;
    }
    this.polling.submit({
      studentId,
      formId,
      answers: { ...this.answers() },
      requestId: crypto.randomUUID(),
    });
  }

  reset(): void {
    this.answers.set({});
    this.polling.reset();
  }

  retry(): void {
    this.polling.retry();
  }

  describe(label: string): string {
    return VARK_DESCRIPTIONS[label] ?? '';
  }

  formatLabel(label: string): string {
    return VARK_LABELS[label] ?? label;
  }
}