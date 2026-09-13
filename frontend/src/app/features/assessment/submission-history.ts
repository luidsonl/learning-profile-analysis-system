import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { FormDefinition, FormResponseItem, Prediction } from '../../core/api/types';
import { FormsService } from '../../core/forms/forms.service';
import { PredictionPollingService } from '../../core/predictions/prediction-polling.service';
import { StudentsService } from '../../core/students/students.service';
import { ROLE_LABELS } from '../../core/users/user-labels';
import { VARK_LABELS } from '../../core/vark/vark-labels';
import { PredictionScores, ScoreFormat } from '../../shared/ui/prediction-scores/prediction-scores';
import { FormAssessment } from './form-assessment';
import { AssessmentSteps } from './steps';

type BlockState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: FormResponseItem[] };

// Step 3 — the selected student + form: the submission history (answers,
// deterministic assessment and async ML prediction) and an "Enviar nova
// avaliação" action that reveals the questionnaire in place.
@Component({
  selector: 'app-submission-history',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatExpansionModule,
    MatIconModule,
    MatProgressSpinnerModule,
    AssessmentSteps,
    PredictionScores,
    FormAssessment,
  ],
  templateUrl: './submission-history.html',
  styleUrl: './submission-history.scss',
})
export class SubmissionHistory {
  readonly studentId = input.required<string>();
  readonly formId = input.required<string>();

  private readonly students = inject(StudentsService);
  private readonly forms = inject(FormsService);
  private readonly polling = inject(PredictionPollingService);

  // Guards the history refresh triggered when a poll turns ready, so the
  // effect reloads the list once per prediction instead of looping.
  private handledReadyPrediction: string | null = null;

  readonly filling = signal(false);

  readonly studentName = signal<string | null>(null);
  readonly formsState = signal<FormDefinition[] | null>(null);

  readonly block = signal<BlockState>({ status: 'loading' });

  readonly history = computed(() => {
    const block = this.block();
    return block.status === 'ready' ? block.items : [];
  });

  readonly errorMessage = computed(() => {
    const block = this.block();
    return block.status === 'error' ? block.message : null;
  });

  readonly selectedForm = computed(() =>
    this.formsState()?.find((form) => form.formId === this.formId()) ?? null,
  );

  // Result semantics come from the served form definition: whether an async
  // inference (bundled ML model) exists at all and how to present the outcome.
  readonly formResult = computed(() => this.selectedForm()?.result ?? null);
  readonly formHasInference = computed(() => this.formResult()?.hasInference ?? false);
  readonly resultIsPercentage = computed(() => this.formResult()?.type === 'percentage');
  readonly scoresFormat = computed<ScoreFormat>(() =>
    this.resultIsPercentage() ? 'percentage' : 'ratio',
  );

  constructor() {
    // Route params bind after construction: react to both of them.
    effect(() => {
      const id = this.studentId();
      const formId = this.formId();
      if (!id || !formId) {
        return;
      }
      this.students.getStudent(id).subscribe({
        next: (res) => this.studentName.set(res.student.name),
        error: () => undefined,
      });
      this.loadHistory();
    });

    this.forms.listForms().subscribe({
      next: (res) => this.formsState.set(res.data),
      error: () => this.formsState.set(null),
    });

    // Catch-up polling: a stored submission whose prediction is still pending
    // (e.g. navigating straight into a form that was filled before) is polled
    // automatically so the result appears without a manual refresh. When the
    // poll turns ready the history reloads and the row reveals the prediction.
    // Only forms that declare hasInference are pollable — others never produce
    // a prediction, so skipping them avoids an endless idle→poll loop.
    effect(() => {
      const state = this.polling.state();

      if (state.status === 'ready') {
        if (this.handledReadyPrediction !== state.prediction.predictionId) {
          this.handledReadyPrediction = state.prediction.predictionId;
          this.loadHistory();
        }
        return;
      }

      if (state.status !== 'idle' || !this.formHasInference()) {
        return;
      }
      const pending = this.history().find((item) => !item.prediction);
      if (pending) {
        this.handledReadyPrediction = null;
        this.polling.pollFor({
          studentId: this.studentId(),
          formId: this.formId(),
          submissionId: pending.submissionId,
        });
      }
    });
  }

  loadHistory(): void {
    const id = this.studentId();
    const formId = this.formId();
    if (!id || !formId) {
      return;
    }
    this.block.set({ status: 'loading' });
    this.students.responses(id, formId).subscribe({
      next: (res) => this.block.set({ status: 'ready', items: res.data }),
      error: () => this.block.set({ status: 'error', message: 'Não foi possível carregar os envios.' }),
    });
  }

  // The questionnaire accepted the submission: leave the fill screen so the
  // refreshed history (including the pending row) becomes visible; the
  // prediction, where a model exists, lands asynchronously and the subsequent
  // refresh reveals it.
  onAccepted(): void {
    this.filling.set(false);
    this.loadHistory();
  }

  onPredicted(): void {
    this.filling.set(false);
    this.loadHistory();
  }

  answeredQuestions(item: FormResponseItem): { id: string; text: string }[] {
    const selected = this.selectedForm();
    if (!selected) {
      return [];
    }
    const questions: { id: string; text: string }[] = [];
    for (const section of selected.sections) {
      for (const question of section.questions) {
        questions.push({ id: question.id, text: question.text });
      }
    }
    return questions.filter((question) => item.answers[question.id] !== undefined);
  }

  roleLabel(role: string): string {
    return ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role;
  }

  formatLabel(label: string | null | undefined): string {
    return label ? (VARK_LABELS[label] ?? label) : '';
  }

  confidence(prediction: Prediction): string {
    return `${Math.round(prediction.confidence * 100)}%`;
  }

  hasScores(scores: Record<string, number> | null | undefined): boolean {
    return !!scores && Object.keys(scores).length > 0;
  }
}