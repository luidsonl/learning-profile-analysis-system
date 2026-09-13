import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin } from 'rxjs';

import { Assessment, Prediction, Student } from '../../core/api/types';
import { StudentsService } from '../../core/students/students.service';
import { PredictionScores } from '../../shared/ui/prediction-scores/prediction-scores';
import { VARK_LABELS, VARK_DESCRIPTIONS } from '../../core/vark/vark-labels';

type ProfileState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; student: Student; assessments: Assessment[]; predictions: Prediction[] };

// Presentational student profile: VARK info, scores, assessments and
// predictions for one student. Used by "Meu perfil" (own, linked account) and
// as the "Perfil de aprendizagem" tab of the student ficha (educator/guardian
// acting on behalf).
@Component({
  selector: 'app-student-profile-view',
  imports: [
    MatCardModule,
    MatListModule,
    MatChipsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    PredictionScores,
  ],
  templateUrl: './student-profile-view.html',
  styleUrl: './student-profile.scss',
})
export class StudentProfileView {
  readonly studentId = input.required<string>();
  readonly isOwn = input(false);

  private readonly students = inject(StudentsService);
  private readonly fb = inject(FormBuilder);

  private loadedFor: string | null = null;

  readonly state = signal<ProfileState>({ status: 'loading' });

  readonly isRenaming = signal(false);
  readonly nameSaving = signal(false);
  readonly renameError = signal<string | null>(null);
  readonly nameForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
  });

  readonly errorMessage = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.message : null;
  });

  readonly isLoading = computed(() => this.state().status === 'loading');
  readonly profile = computed(() => {
    const s = this.state();
    return s.status === 'ready'
      ? { student: s.student, assessments: s.assessments, predictions: s.predictions }
      : null;
  });

  constructor() {
    effect(() => {
      const id = this.studentId();
      if (id !== this.loadedFor) {
        this.loadedFor = id;
        this.load();
      }
    });
  }

  load(): void {
    const studentId = this.studentId();
    this.state.set({ status: 'loading' });
    forkJoin({
      student: this.students.getStudent(studentId),
      assessments: this.students.assessments(studentId, 'vark'),
      predictions: this.students.predictions(studentId, 'vark'),
    }).subscribe({
      next: (data) =>
        this.state.set({
          status: 'ready',
          student: data.student.student,
          assessments: data.assessments.data,
          predictions: data.predictions.data,
        }),
      error: () => this.state.set({ status: 'error', message: 'Não foi possível carregar o perfil.' }),
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatLabel(label: string): string {
    return VARK_LABELS[label] ?? label;
  }

  describe(label: string): string {
    return VARK_DESCRIPTIONS[label] ?? '';
  }

  toggleRename(): void {
    if (this.isRenaming()) {
      this.isRenaming.set(false);
      this.renameError.set(null);
      return;
    }
    const current = this.profile()?.student.name ?? '';
    this.nameForm.setValue({ name: current });
    this.isRenaming.set(true);
  }

  rename(): void {
    const studentId = this.studentId();
    if (this.nameForm.invalid || this.nameSaving()) {
      return;
    }
    this.nameSaving.set(true);
    this.renameError.set(null);
    this.students
      .updateStudent(studentId, { name: this.nameForm.value.name ?? '' })
      .subscribe({
        next: () => {
          this.nameSaving.set(false);
          this.isRenaming.set(false);
          this.load();
        },
        error: () => {
          this.nameSaving.set(false);
          this.renameError.set('Não foi possível atualizar o nome.');
        },
      });
  }
}