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
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';

import { VarkAssessment } from '../assessment/vark-assessment';
import { StudentProfileView } from '../profile/student-profile-view';
import { StudentForm } from '../../shared/ui/student-form/student-form';
import { GuardianEdge, GuardianSearchHit, Observation, PendingAccount, Recommendation, Student } from '../../core/api/types';
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

// Centralized student ficha: every management action lives in tabs on this one
// page — data + removal, VARK profile, assessment, observations,
// recommendations and access (responsables + linked account).
@Component({
  selector: 'app-student-workspace',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatListModule,
    MatTabsModule,
    DatePipe,
    KeyValuePipe,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    StudentForm,
    StudentProfileView,
    VarkAssessment,
  ],
  templateUrl: './student-workspace.html',
  styleUrl: './student-workspace.scss',
})
export class StudentWorkspace {
  readonly studentId = input.required<string>();

  private readonly auth = inject(AuthService);
  private readonly students = inject(StudentsService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly selectedTabIndex = signal(0);

  readonly annotations = computed(() => ({
    observations: OBSERVATION_CATEGORY_LABELS,
    recoStatus: RECOMMENDATION_STATUS_LABELS,
  }));

  readonly student = signal<Student | null>(null);
  readonly studentError = signal<string | null>(null);

  // Access-management (educator/admin only): responsables assigned to the
  // student and the linked self-registered student account.
  readonly isAccessManager = computed(() => {
    const role = this.auth.user()?.role;
    return role === 'educator' || role === 'admin';
  });

  readonly confirmDelete = signal(false);
  readonly deleteBusy = signal(false);
  readonly deleteError = signal<string | null>(null);

  readonly guardianState = signal<SectionState>({ status: 'loading' });
  readonly guardians = signal<GuardianEdge[]>([]);
  readonly guardianSearch = signal('');
  readonly guardianSearchResults = signal<GuardianSearchHit[]>([]);
  readonly guardianSearching = signal(false);
  readonly guardianBusy = signal<string | null>(null);
  readonly guardianResultsError = signal<string | null>(null);

  readonly pendingState = signal<SectionState>({ status: 'loading' });
  readonly pendingAccounts = signal<PendingAccount[]>([]);
  readonly linkBusy = signal<string | null>(null);
  readonly linkError = signal<string | null>(null);

  readonly guardiansLoading = computed(() => this.guardianState().status === 'loading');
  readonly guardiansErrorMessage = computed(() => {
    const s = this.guardianState();
    return s.status === 'error' ? s.message : null;
  });

  readonly pendingLoading = computed(() => this.pendingState().status === 'loading');
  readonly pendingErrorMessage = computed(() => {
    const s = this.pendingState();
    return s.status === 'error' ? s.message : null;
  });

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
    if (this.isAccessManager()) {
      this.loadGuardians(id);
      this.loadPendingAccounts();
    }
  }

  askDelete(): void {
    this.confirmDelete.set(true);
    this.deleteError.set(null);
  }

  cancelDelete(): void {
    this.confirmDelete.set(false);
    this.deleteError.set(null);
  }

  deleteStudent(): void {
    const id = this.studentId();
    if (!id || this.deleteBusy()) {
      return;
    }
    this.deleteBusy.set(true);
    this.deleteError.set(null);
    this.students.deleteStudent(id).subscribe({
      next: () => void this.router.navigate(['/estudantes']).catch(() => undefined),
      error: () => {
        this.deleteBusy.set(false);
        this.deleteError.set('Não foi possível remover o estudante.');
      },
    });
  }

  private loadGuardians(id: string): void {
    this.guardianState.set({ status: 'loading' });
    this.students.guardians(id).subscribe({
      next: (res) => {
        this.guardians.set(res.data);
        this.guardianState.set({ status: 'ready' });
      },
      error: () => this.guardianState.set({ status: 'error', message: 'Não foi possível carregar os responsáveis.' }),
    });
  }

  private loadPendingAccounts(): void {
    this.pendingState.set({ status: 'loading' });
    this.auth.pendingAccounts().subscribe({
      next: (res) => {
        this.pendingAccounts.set(res.data);
        this.pendingState.set({ status: 'ready' });
      },
      error: () =>
        this.pendingState.set({ status: 'error', message: 'Não foi possível carregar as contas pendentes.' }),
    });
  }

  onGuardianSearchInput(value: string): void {
    this.guardianSearch.set(value);
    if (value.trim().length < 3) {
      this.guardianSearchResults.set([]);
    }
  }

  isGrantedFor(userId: string): boolean {
    return this.guardians().some((g) => g.userId === userId);
  }

  searchGuardians(): void {
    const id = this.studentId();
    const email = this.guardianSearch().trim();
    if (!id || email.length < 3 || this.guardianBusy() !== null || this.guardianSearching()) {
      return;
    }
    this.guardianSearching.set(true);
    this.guardianResultsError.set(null);
    this.students.searchGuardians(email).subscribe({
      next: (res) => {
        this.guardianSearchResults.set(res.data);
        this.guardianSearching.set(false);
      },
      error: () => {
        this.guardianSearching.set(false);
        this.guardianResultsError.set('Não foi possível buscar responsáveis.');
      },
    });
  }

  grantGuardian(userId: string): void {
    const id = this.studentId();
    if (!id || this.guardianBusy() !== null) {
      return;
    }
    this.guardianBusy.set(userId);
    this.students.grantGuardian(id, userId).subscribe({
      next: () => {
        this.guardianBusy.set(null);
        this.guardianSearch.set('');
        this.guardianSearchResults.set([]);
        this.loadGuardians(id);
      },
      error: () => {
        this.guardianBusy.set(null);
        this.guardianResultsError.set('Não foi possível atribuir o responsável.');
      },
    });
  }

  revokeGuardian(userId: string): void {
    const id = this.studentId();
    if (!id || this.guardianBusy() !== null) {
      return;
    }
    this.guardianBusy.set(userId);
    this.students.revokeGuardian(id, userId).subscribe({
      next: () => {
        this.guardianBusy.set(null);
        this.loadGuardians(id);
      },
      error: () => {
        this.guardianBusy.set(null);
        this.guardianResultsError.set('Não foi possível remover o responsável.');
      },
    });
  }

  linkStudentAccount(userId: string): void {
    const id = this.studentId();
    if (!id || this.linkBusy() !== null) {
      return;
    }
    this.linkBusy.set(userId);
    this.students.linkStudentAccount(id, userId).subscribe({
      next: () => {
        this.linkBusy.set(null);
        this.students.getStudent(id).subscribe({
          next: (res) => this.student.set(res.student),
        });
        this.loadPendingAccounts();
      },
      error: () => {
        this.linkBusy.set(null);
        this.linkError.set('Não foi possível vincular a conta do estudante.');
      },
    });
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