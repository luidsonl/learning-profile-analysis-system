import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe, KeyValuePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { Observation, Recommendation, Student } from '../../core/api/types';
import { AuthService } from '../../core/auth/auth.service';
import { StudentsService } from '../../core/students/students.service';
import { OBSERVATION_CATEGORY_LABELS } from '../../core/observations/observation-labels';
import { RECOMMENDATION_STATUS_LABELS } from '../../core/recommendations/recommendation-labels';

type SectionState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' };

type ObservationModel = Observation & { deletable: boolean };
type RecommendationModel = Recommendation & { mutable: boolean };

@Component({
  selector: 'app-student-workspace',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatListModule,
    DatePipe,
    KeyValuePipe,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './student-workspace.html',
  styleUrl: './student-workspace.scss',
})
export class StudentWorkspace {
  readonly studentId = input<string>();

  private readonly auth = inject(AuthService);
  private readonly students = inject(StudentsService);
  private readonly fb = inject(FormBuilder);

  readonly annotations = computed(() => ({
    observations: OBSERVATION_CATEGORY_LABELS,
    recoStatus: RECOMMENDATION_STATUS_LABELS,
  }));

  readonly student = signal<Student | null>(null);
  readonly studentError = signal<string | null>(null);

  readonly obsState = signal<SectionState>({ status: 'loading' });
  readonly obsList = signal<ObservationModel[]>([]);
  readonly obsError = signal<string | null>(null);
  readonly obsSubmitting = signal(false);

  readonly obsLoading = computed(() => this.obsState().status === 'loading');
  readonly obsErrorMessage = computed(() => {
    const s = this.obsState();
    return s.status === 'error' ? s.message : null;
  });

  readonly recoState = signal<SectionState>({ status: 'loading' });
  readonly recoList = signal<RecommendationModel[]>([]);
  readonly recoError = signal<string | null>(null);
  readonly recoSubmitting = signal(false);

  readonly recoLoading = computed(() => this.recoState().status === 'loading');
  readonly recoErrorMessage = computed(() => {
    const s = this.recoState();
    return s.status === 'error' ? s.message : null;
  });

  readonly observationForm = this.fb.group({
    category: ['behavior', Validators.required],
    text: ['', Validators.required],
    rating: [null as number | null],
  });

  readonly recoForm = this.fb.group({
    title: ['', Validators.required],
    text: ['', Validators.required],
  });

  constructor() {
    effect(() => {
      const id = this.studentId();
      if (id) {
        this.load(id);
      }
    });
  }

  private load(id: string): void {
    this.students.getStudent(id).subscribe({
      next: (res) => this.student.set(res.student),
      error: () => this.studentError.set('Não foi possível carregar o estudante.'),
    });
    this.loadObservations(id);
    this.loadRecommendations(id);
  }

  private loadObservations(id: string): void {
    this.obsState.set({ status: 'loading' });
    this.students.observations(id).subscribe({
      next: (res) => {
        const myId = this.auth.user()?.userId;
        this.obsList.set(res.data.map((o) => ({ ...o, deletable: o.submittedBy === myId })));
        this.obsState.set({ status: 'ready' });
      },
      error: () => this.obsState.set({ status: 'error', message: 'Não foi possível carregar as observações.' }),
    });
  }

  private loadRecommendations(id: string): void {
    this.recoState.set({ status: 'loading' });
    this.students.recommendations(id).subscribe({
      next: (res) => {
        const myId = this.auth.user()?.userId;
        this.recoList.set(res.data.map((r) => ({ ...r, mutable: r.createdBy === myId })));
        this.recoState.set({ status: 'ready' });
      },
      error: () => this.recoState.set({ status: 'error', message: 'Não foi possível carregar as recomendações.' }),
    });
  }

  categoryLabel(category: string): string {
    return OBSERVATION_CATEGORY_LABELS[category] ?? category;
  }

  statusLabel(status: string): string {
    return RECOMMENDATION_STATUS_LABELS[status] ?? status;
  }

  details(student: Student): string {
    return [student.grade, student.school].filter(Boolean).join(' · ');
  }

  canApprove(status: string): boolean {
    return status !== 'approved';
  }

  canReject(status: string): boolean {
    return status !== 'rejected';
  }

  canPublish(status: string): boolean {
    return status === 'approved' || status === 'published';
  }

  submitObservation(): void {
    const id = this.studentId();
    const form = this.observationForm;
    if (!id || form.invalid || this.obsSubmitting()) {
      return;
    }
    this.obsSubmitting.set(true);
    this.obsError.set(null);
    this.students
      .addObservation(id, {
        category: form.value.category as never,
        text: form.value.text ?? '',
        rating: form.value.rating ?? undefined,
      })
      .subscribe({
        next: () => {
          this.obsSubmitting.set(false);
          form.reset({ category: 'behavior', text: '', rating: null });
          this.loadObservations(id);
        },
        error: () => {
          this.obsSubmitting.set(false);
          this.obsError.set('Não foi possível registrar a observação.');
        },
      });
  }

  deleteObservation(timestamp: string): void {
    const id = this.studentId();
    if (!id) {
      return;
    }
    this.students.deleteObservation(id, timestamp).subscribe({ next: () => this.loadObservations(id) });
  }

  submitRecommendation(): void {
    const id = this.studentId();
    const form = this.recoForm;
    if (!id || form.invalid || this.recoSubmitting()) {
      return;
    }
    this.recoSubmitting.set(true);
    this.recoError.set(null);
    this.students
      .proposeRecommendation(id, { title: form.value.title ?? '', text: form.value.text ?? '' })
      .subscribe({
        next: () => {
          this.recoSubmitting.set(false);
          form.reset();
          this.loadRecommendations(id);
        },
        error: () => {
          this.recoSubmitting.set(false);
          this.recoError.set('Não foi possível propor a recomendação.');
        },
      });
  }

  updateRecommendation(recoId: string, change: { status?: never; visibility?: never } | Record<string, string>): void {
    const id = this.studentId();
    if (!id) {
      return;
    }
    this.students.updateRecommendation(id, recoId, change as never).subscribe({
      next: () => this.loadRecommendations(id),
      error: () => this.recoError.set('Não foi possível atualizar a recomendação.'),
    });
  }
}