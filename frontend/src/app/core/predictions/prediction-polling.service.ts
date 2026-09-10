import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { skipWhile, switchMap } from 'rxjs/operators';

import { FormSubmissionAccepted, Prediction, PredictionsList } from '../api/types';
import { readApiError } from '../errors/api-error';

// Polling strategy pinned in specs/frontend.md: 1s → 2s → 5s backoff, soft stop
// at ~15s with a terminal "processing" state plus manual retry. The submission
// is stored immediately (idempotent via requestId); the ML prediction lands
// asynchronously. Anything else cancels the poll.
const POLL_DELAYS_MS = [1000, 2000, 5000, 5000];

export type PollState =
  | { status: 'idle' }
  | { status: 'processing'; submissionId: string | null }
  | { status: 'ready'; prediction: Prediction }
  | { status: 'failed'; message: string };

@Injectable({ providedIn: 'root' })
export class PredictionPollingService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly state$ = signal<PollState>({ status: 'idle' });
  private timerSub?: Subscription;
  private lastRequest: { studentId: string; formId: string; submissionId: string } | null = null;

  readonly state = this.state$.asReadonly();

  constructor() {
    // A navigation clears the poll; the user can start it again from a terminal state.
    this.router.events.pipe(skipWhile((event) => !(event instanceof NavigationStart))).subscribe(() => this.stop());
  }

  submit(opts: { studentId: string; formId: string; answers: Record<string, number>; requestId: string }): void {
    this.stop();
    this.state$.set({ status: 'processing', submissionId: null });

    this.http
      .post<FormSubmissionAccepted>(`/api/students/${opts.studentId}/forms/${opts.formId}/responses`, {
        answers: opts.answers,
        requestId: opts.requestId,
      })
      .subscribe({
        next: (accepted) => {
          this.lastRequest = { studentId: opts.studentId, formId: opts.formId, submissionId: accepted.submissionId };
          this.state$.set({ status: 'processing', submissionId: accepted.submissionId });
          this.poll(opts.formId, 0);
        },
        error: (err: unknown) => {
          this.state$.set({ status: 'failed', message: readApiError(err).pt });
        },
      });
  }

  retry(): void {
    if (!this.lastRequest) {
      return;
    }
    this.poll(this.lastRequest.formId, 0);
  }

  reset(): void {
    this.stop();
    this.lastRequest = null;
    this.state$.set({ status: 'idle' });
  }

  private poll(formId: string, attempt: number): void {
    const last = this.lastRequest;
    if (!last) {
      return;
    }
    const delay = Math.min(attempt, POLL_DELAYS_MS.length - 1);
    this.timerSub = timer(POLL_DELAYS_MS[delay])
      .pipe(
        switchMap(() =>
          this.http.get<PredictionsList>(
            `/api/students/${last.studentId}/predictions?form=${formId}`,
          ),
        ),
      )
      .subscribe({
        next: (list) => {
          const prediction = list.data.find((p) => p.submission === last.submissionId);
          if (prediction) {
            this.state$.set({ status: 'ready', prediction });
          } else if (attempt < POLL_DELAYS_MS.length - 1) {
            this.poll(formId, attempt + 1);
          } else {
            // Soft stop: prediction still in flight server-side — keep terminal state, retry available.
            this.state$.set({ status: 'processing', submissionId: last.submissionId });
          }
        },
        error: () => {
          if (attempt < POLL_DELAYS_MS.length - 1) {
            this.poll(formId, attempt + 1);
          } else {
            this.state$.set({ status: 'failed', message: 'Não foi possível consultar o resultado. Tente novamente.' });
          }
        },
      });
  }

  private stop(): void {
    this.timerSub?.unsubscribe();
    this.timerSub = undefined;
  }
}