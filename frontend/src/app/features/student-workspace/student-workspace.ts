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
import { GuardianEdge, GuardianSearchHit, Observation, Recommendation, Student, StudentAccount, ConsentCurrent, ConsentHistoryEntry, LegalBasis } from '../../core/api/types';
import { AuthService } from '../../core/auth/auth.service';
import { StudentsService } from '../../core/students/students.service';
import { OBSERVATION_CATEGORY_LABELS } from '../../core/observations/observation-labels';
import { RECOMMENDATION_STATUS_LABELS } from '../../core/recommendations/recommendation-labels';
import { readApiError } from '../../core/errors/api-error';

type SectionState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' };

type ObservationModel = Observation & { deletable: boolean };
type RecommendationModel = Recommendation & { mutable: boolean };

const CONSENT_STATUS_LABELS: Record<string, string> = {
  not_granted: 'Não concedido',
  active: 'Concedido (ativo)',
  revoked: 'Revogado',
};

const LEGAL_BASIS_LABELS: Record<string, string> = {
  guardian: 'Responsável legal',
  institution_authorization: 'Autorização da instituição',
  self_consent: 'Autoconsentimento (maior de idade)',
};

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
  readonly guardianBusy = signal<string | null>(null);
  readonly guardianResultsError = signal<string | null>(null);

  // Catalog of every registered guardian account; filtered client-side by the
  // educator (name or email) so assigning a responsable is one click away.
  readonly guardianCatalogState = signal<SectionState>({ status: 'loading' });
  readonly guardianCatalog = signal<GuardianSearchHit[]>([]);
  readonly guardianFilter = signal('');

  readonly studentAccountState = signal<SectionState>({ status: 'loading' });
  readonly studentAccounts = signal<StudentAccount[]>([]);
  readonly linkBusy = signal<string | null>(null);
  readonly linkError = signal<string | null>(null);

  readonly guardiansLoading = computed(() => this.guardianState().status === 'loading');
  readonly guardiansErrorMessage = computed(() => {
    const s = this.guardianState();
    return s.status === 'error' ? s.message : null;
  });

  readonly guardianCatalogLoading = computed(() => this.guardianCatalogState().status === 'loading');
  readonly guardianCatalogErrorMessage = computed(() => {
    const s = this.guardianCatalogState();
    return s.status === 'error' ? s.message : null;
  });

  readonly filteredGuardians = computed(() => {
    const q = this.guardianFilter().trim().toLowerCase();
    const all = this.guardianCatalog();
    if (!q) {
      return all;
    }
    return all.filter((g) => g.name.toLowerCase().includes(q) || g.email.toLowerCase().includes(q));
  });

  readonly studentAccountLoading = computed(() => this.studentAccountState().status === 'loading');
  readonly studentAccountErrorMessage = computed(() => {
    const s = this.studentAccountState();
    return s.status === 'error' ? s.message : null;
  });

  // LGPD consent is granted on the student ENTITY (the ficha — the age
  // authority); the linked account carries no age or consent. Anyone scoped to
  // the ficha (educator/admin/guardian) may manage it.
  readonly consentState = signal<SectionState>({ status: 'loading' });
  readonly consentCurrent = signal<ConsentCurrent | null>(null);
  readonly consentHistory = signal<ConsentHistoryEntry[]>([]);
  readonly consentBusy = signal(false);
  readonly consentError = signal<string | null>(null);

  readonly consentLoading = computed(() => this.consentState().status === 'loading');
  readonly consentErrorMessage = computed(() => {
    const s = this.consentState();
    return s.status === 'error' ? s.message : null;
  });

  readonly consentForm = this.fb.group({
    version: ['1.0', Validators.required],
    // Defaults by role: a guardian consents in their own name; an educator or
    // admin consents as the institution (specs/lgpd.md).
    legalBasis: [this.defaultConsentBasis(), Validators.required],
  });

  // Accounts that can still be linked to a ficha (pending, no profile attributed).
  readonly availableAccounts = computed(() => this.studentAccounts().filter((a) => a.available));

  // Accounts that already own a student profile — they can never be used again.
  readonly unavailableAccounts = computed(() => this.studentAccounts().filter((a) => !a.available));

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
    this.loadConsent(id);
    if (this.isAccessManager()) {
      this.loadGuardians(id);
      this.loadGuardianCatalog();
      this.loadStudentAccounts();
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

  // Catalog of every registered guardian; the client-side filter keeps the
  // list current without a round-trip per keystroke.
  private loadGuardianCatalog(): void {
    this.guardianCatalogState.set({ status: 'loading' });
    this.students.searchGuardians('').subscribe({
      next: (res) => {
        this.guardianCatalog.set(res.data);
        this.guardianCatalogState.set({ status: 'ready' });
      },
      error: () =>
        this.guardianCatalogState.set({ status: 'error', message: 'Não foi possível carregar os responsáveis cadastrados.' }),
    });
  }

  private loadStudentAccounts(): void {
    this.studentAccountState.set({ status: 'loading' });
    this.auth.studentAccounts().subscribe({
      next: (res) => {
        this.studentAccounts.set(res.data);
        this.studentAccountState.set({ status: 'ready' });
      },
      error: () =>
        this.studentAccountState.set({ status: 'error', message: 'Não foi possível carregar as contas de estudante.' }),
    });
  }

  isGrantedFor(userId: string): boolean {
    return this.guardians().some((g) => g.userId === userId);
  }

  defaultConsentBasis(): LegalBasis {
    return this.auth.user()?.role === 'guardian' ? 'guardian' : 'institution_authorization';
  }

  consentStatusLabel(status: string | null | undefined): string {
    return CONSENT_STATUS_LABELS[status ?? 'not_granted'] ?? status ?? 'Não concedido';
  }

  legalBasisLabel(basis: string | null | undefined): string {
    return LEGAL_BASIS_LABELS[basis ?? ''] ?? basis ?? '—';
  }

  private loadConsent(id: string): void {
    this.consentState.set({ status: 'loading' });
    this.students.consent(id).subscribe({
      next: (res) => {
        this.consentCurrent.set(res.current);
        this.consentHistory.set(res.history);
        this.consentState.set({ status: 'ready' });
      },
      error: () => this.consentState.set({ status: 'error', message: 'Não foi possível carregar o consentimento.' }),
    });
  }

  submitConsent(status: 'active' | 'revoked'): void {
    const id = this.studentId();
    const form = this.consentForm;
    const basis = (form.value.legalBasis as LegalBasis | undefined) ?? this.defaultConsentBasis();
    // Keeps the current basis when revoking (revocation references the same term).
    const legalBasis = status === 'revoked' ? (this.consentCurrent()?.legalBasis ?? basis) : basis;
    if (!id || form.invalid || this.consentBusy()) {
      return;
    }
    this.consentBusy.set(true);
    this.consentError.set(null);
    this.students.setConsent(id, {
      consentVersion: form.value.version ?? '1.0',
      status,
      legalBasis,
    }).subscribe({
      next: () => {
        this.consentBusy.set(false);
        form.reset({ version: '1.0', legalBasis: this.defaultConsentBasis() });
        this.loadConsent(id);
      },
      error: (err) => {
        this.consentBusy.set(false);
        this.consentError.set(readApiError(err, 'Não foi possível atualizar o consentimento.').pt);
      },
    });
  }

  onGuardianFilterInput(value: string): void {
    this.guardianFilter.set(value);
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
        this.loadStudentAccounts();
      },
      error: (err) => {
        this.linkBusy.set(null);
        this.linkError.set(readApiError(err, 'Não foi possível vincular a conta do estudante.').pt);
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