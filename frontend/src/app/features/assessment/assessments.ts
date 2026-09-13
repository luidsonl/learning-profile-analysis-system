import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import {
  FormDefinition,
  FormResponseItem,
  Prediction,
  Student,
} from '../../core/api/types';
import { AuthService } from '../../core/auth/auth.service';
import { FormsService } from '../../core/forms/forms.service';
import { StudentsService } from '../../core/students/students.service';
import { ROLE_LABELS } from '../../core/users/user-labels';
import { VARK_LABELS } from '../../core/vark/vark-labels';
import { PredictionScores } from '../../shared/ui/prediction-scores/prediction-scores';
import { VarkAssessment } from './vark-assessment';

type SectionState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: T[] };

// Assessment workspace with four levels:
//   1. student selection — educators see every student (all they follow);
//      guardians only their assigned students; a student skips the selector
//      and acts on their own linked profile (there is no list to pick from);
//   2. form selection — the curated registry (only `vark` ships today);
//   3. submissions/results — answers per submission plus the deterministic
//      assessment and the ML prediction, when available;
//   4. fill area — a fresh questionnaire for the selected student + form.
@Component({
  selector: 'app-assessments',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    PredictionScores,
    VarkAssessment,
  ],
  templateUrl: './assessments.html',
  styleUrl: './assessments.scss',
})
export class Assessments {
  // Deep link from /estudantes. Bound via withComponentInputBinding on the
  // /avaliacoes/:studentId route.
  readonly studentId = input<string>();

  private readonly auth = inject(AuthService);
  private readonly students = inject(StudentsService);
  private readonly forms = inject(FormsService);

  readonly role = computed(() => this.auth.user()?.role ?? null);

  // Only students act on their own profile without a selector.
  readonly needsStudentSelection = computed(() => this.role() !== 'student');
  readonly ownStudentId = computed(() => (this.role() === 'student' ? this.auth.studentId() : null));

  readonly studentsState = signal<SectionState<Student>>({ status: 'loading' });
  readonly selectedStudentId = signal<string | null>(null);
  readonly ownStudent = signal<Student | null>(null);

  // The target of the fill area: an explicit selection (educator/guardian/
  // admin) or the linked own profile (student).
  readonly activeStudentId = computed(() => this.selectedStudentId() ?? this.ownStudentId() ?? null);

  readonly activeStudent = computed(() => {
    const id = this.activeStudentId();
    const own = this.ownStudent();
    if (own && own.studentId === id) {
      return own;
    }
    const s = this.studentsState();
    return s.status === 'ready' && id ? s.items.find((x) => x.studentId === id) ?? null : null;
  });

  readonly formsState = signal<SectionState<FormDefinition>>({ status: 'loading' });
  readonly selectedFormId = signal<string | null>(null);

  readonly selectedForm = computed(() => {
    const s = this.formsState();
    return s.status === 'ready'
      ? s.items.find((f) => f.formId === this.selectedFormId()) ?? null
      : null;
  });

  readonly historyState = signal<SectionState<FormResponseItem>>({ status: 'loading' });

  readonly studentsLoading = computed(() => this.studentsState().status === 'loading');
  readonly studentsError = computed(() => {
    const s = this.studentsState();
    return s.status === 'error' ? s.message : null;
  });
  readonly studentsList = computed(() => {
    const s = this.studentsState();
    return s.status === 'ready' ? s.items : null;
  });

  readonly formsLoading = computed(() => this.formsState().status === 'loading');
  readonly formsError = computed(() => {
    const s = this.formsState();
    return s.status === 'error' ? s.message : null;
  });
  readonly formsList = computed(() => {
    const s = this.formsState();
    return s.status === 'ready' ? s.items : null;
  });

  readonly historyLoading = computed(() => this.historyState().status === 'loading');
  readonly historyError = computed(() => {
    const s = this.historyState();
    return s.status === 'error' ? s.message : null;
  });
  readonly history = computed(() => {
    const s = this.historyState();
    return s.status === 'ready' ? s.items : null;
  });

  constructor() {
    // Deep link preselects the student; a student always lands on their own profile.
    effect(() => {
      const param = this.studentId();
      if (param) {
        this.selectedStudentId.set(param);
      }
    });
    effect(() => {
      const own = this.ownStudentId();
      if (own) {
        this.selectedStudentId.set(own);
      }
    });

    this.loadStudents();
    this.loadForms();

    // Fetch the student record of a self-assessor so the header can show a name.
    effect(() => {
      const own = this.ownStudentId();
      if (!own) {
        return;
      }
      this.students.getStudent(own).subscribe({
        next: (res) => this.ownStudent.set(res.student),
        error: () => undefined,
      });
    });

    // Default to the first available form (only vark today).
    effect(() => {
      const s = this.formsState();
      if (s.status === 'ready' && !this.selectedFormId()) {
        this.selectedFormId.set(s.items[0]?.formId ?? null);
      }
    });

    // History follows the active student + form.
    effect(() => {
      const id = this.activeStudentId();
      const formId = this.selectedFormId();
      if (id && formId) {
        this.loadHistory(id, formId);
      } else {
        this.historyState.set({ status: 'ready', items: [] });
      }
    });
  }

  loadStudents(): void {
    if (!this.needsStudentSelection()) {
      return;
    }
    this.studentsState.set({ status: 'loading' });
    this.students.list().subscribe({
      next: (res) => this.studentsState.set({ status: 'ready', items: res.data }),
      error: () =>
        this.studentsState.set({ status: 'error', message: 'Não foi possível carregar os estudantes.' }),
    });
  }

  loadForms(): void {
    this.formsState.set({ status: 'loading' });
    this.forms.listForms().subscribe({
      next: (res) => this.formsState.set({ status: 'ready', items: res.data }),
      error: () =>
        this.formsState.set({ status: 'error', message: 'Não foi possível carregar os formulários.' }),
    });
  }

  private loadHistory(studentId: string, formId: string): void {
    this.historyState.set({ status: 'loading' });
    this.students.responses(studentId, formId).subscribe({
      next: (res) => this.historyState.set({ status: 'ready', items: res.data }),
      error: () => this.historyState.set({ status: 'error', message: 'Não foi possível carregar os envios.' }),
    });
  }

  // A submission just completed in the fill area: refresh the history list so
  // the new submission + its prediction show up.
  onSubmitted(): void {
    const id = this.activeStudentId();
    const formId = this.selectedFormId();
    if (id && formId) {
      this.loadHistory(id, formId);
    }
  }

  onSelectStudent(id: string | null): void {
    this.selectedStudentId.set(id);
  }

  onSelectForm(id: string | null): void {
    this.selectedFormId.set(id);
  }

  answeredQuestions(item: FormResponseItem): { id: string; text: string }[] {
    const form = this.selectedForm();
    if (!form) {
      return [];
    }
    const questions: { id: string; text: string }[] = [];
    for (const section of form.sections) {
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

  details(student: Student): string {
    return [student.grade, student.school].filter(Boolean).join(' · ');
  }
}