import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin } from 'rxjs';

import { Assessment, Prediction, Student } from '../../core/api/types';
import { AuthService } from '../../core/auth/auth.service';
import { StudentsService } from '../../core/students/students.service';
import { PredictionScores } from '../../shared/ui/prediction-scores/prediction-scores';
import { VARK_LABELS, VARK_DESCRIPTIONS } from '../../core/vark/vark-labels';

type ProfileState =
  | { status: 'pending' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; student: Student; assessments: Assessment[]; predictions: Prediction[] };

const NOT_LOADED = Symbol('never-loaded');

@Component({
  selector: 'app-student-profile',
  imports: [
    MatCardModule,
    MatListModule,
    MatChipsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    PredictionScores,
  ],
  templateUrl: './student-profile.html',
  styleUrl: './student-profile.scss',
})
export class StudentProfile {
  // Optional route param (educator/guardian acting for a student); falls back
  // to the own studentId for a linked student's self-view.
  readonly routeStudentId = input<string>();

  private readonly auth = inject(AuthService);
  private readonly students = inject(StudentsService);

  private readonly scopeStudentId = computed(
    () => this.routeStudentId() ?? this.auth.studentId() ?? undefined,
  );
  private loadedFor: unknown = NOT_LOADED;

  readonly state = signal<ProfileState>({ status: 'loading' });

  readonly errorMessage = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.message : null;
  });

  readonly isPending = computed(() => this.state().status === 'pending');
  readonly isLoading = computed(() => this.state().status === 'loading');
  readonly profile = computed(() => {
    const s = this.state();
    return s.status === 'ready'
      ? { student: s.student, assessments: s.assessments, predictions: s.predictions }
      : null;
  });

  constructor() {
    effect(() => {
      const studentId = this.scopeStudentId();
      if (studentId !== this.loadedFor) {
        this.loadedFor = studentId;
        this.load(studentId);
      }
    });
  }

  load(studentId?: string): void {
    const id = studentId ?? this.scopeStudentId();
    if (!studentId) {
      this.state.set({ status: 'pending' });
      return;
    }
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
}