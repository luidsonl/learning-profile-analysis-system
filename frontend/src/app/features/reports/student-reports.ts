import { computed, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription, timer } from 'rxjs';
import { take } from 'rxjs/operators';

import { ReportMetadata } from '../../core/api/types';
import { AuthService } from '../../core/auth/auth.service';
import { ReportsService } from '../../core/reports/reports.service';

type ReportsState =
  | { status: 'pending' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; reports: ReportMetadata[] };

const REFRESH_INTERVAL_MS = 3000;
const MAX_REFRESHES = 5;

@Component({
  selector: 'app-student-reports',
  imports: [MatCardModule, MatListModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './student-reports.html',
  styleUrl: './student-reports.scss',
})
export class StudentReports {
  private readonly auth = inject(AuthService);
  private readonly reports = inject(ReportsService);

  readonly state = signal<ReportsState>({ status: 'loading' });
  readonly generating = signal(false);
  private refreshSub?: Subscription;

  readonly isPending = computed(() => this.state().status === 'pending');
  readonly isLoading = computed(() => this.state().status === 'loading');
  readonly errorMessage = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.message : null;
  });
  readonly reportList = computed(() => {
    const s = this.state();
    return s.status === 'ready' ? s.reports : null;
  });

  constructor() {
    this.load();
  }

  load(): void {
    const studentId = this.auth.studentId();
    if (!studentId) {
      this.state.set({ status: 'pending' });
      return;
    }
    this.state.set({ status: 'loading' });
    this.fetch(studentId);
  }

  private fetch(studentId: string): void {
    this.reports.listFor(studentId).subscribe({
      next: (res) => {
        this.state.set({ status: 'ready', reports: res.data });
        if (this.generating() && !res.data.some((r) => r.status === 'queued')) {
          this.generating.set(false);
          this.refreshSub?.unsubscribe();
        }
      },
      error: () => this.state.set({ status: 'error', message: 'Não foi possível carregar os relatórios.' }),
    });
  }

  generate(): void {
    const studentId = this.auth.studentId();
    if (!studentId || this.generating()) {
      return;
    }
    this.generating.set(true);
    this.reports.generate(studentId).subscribe({
      next: () => {
        // Generation is asynchronous (SQS); poll until generated or give up.
        let attempts = 0;
        this.refreshSub = timer(REFRESH_INTERVAL_MS, REFRESH_INTERVAL_MS)
          .pipe(take(MAX_REFRESHES))
          .subscribe(() => {
            attempts += 1;
            this.fetch(studentId);
            if (attempts >= MAX_REFRESHES) {
              this.generating.set(false);
            }
          });
      },
      error: () => {
        this.generating.set(false);
        this.state.set({ status: 'error', message: 'Não foi possível gerar o relatório.' });
      },
    });
  }

  download(reportId: string): void {
    this.reports.downloadUrl(reportId).subscribe({
      next: (res) => {
        const link = document.createElement('a');
        link.href = res.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.click();
      },
      error: () => {
        this.state.set({ status: 'error', message: 'Não foi possível preparar o download.' });
      },
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}