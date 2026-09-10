import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';

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
  private readonly forms = inject(FormsService);
  private readonly auth = inject(AuthService);
  readonly polling = inject(PredictionPollingService);

  readonly form = toSignal(this.forms.getForm('vark'), { initialValue: undefined });

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

  onAnswer(questionId: string, value: number): void {
    this.answers.update((current) => ({ ...current, [questionId]: value }));
  }

  submit(): void {
    const studentId = this.auth.studentId();
    if (!studentId || !this.allAnswered()) {
      return;
    }
    this.polling.submit({
      studentId,
      formId: 'vark',
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