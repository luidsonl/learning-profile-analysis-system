import { computed, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { PublicUser } from '../../core/api/types';
import { AdminService } from '../../core/admin/admin.service';
import { readApiError } from '../../core/errors/api-error';
import { ROLE_LABELS } from '../../core/users/user-labels';

type ApprovalsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; users: PublicUser[] };

type BusyAction = 'approve' | 'deny' | null;

// Approval of newly registered accounts. Guardians, educators and students all
// self-register as `pending`; an admin (or educator) approves (`active`) or
// denies them here via PATCH /admin/users/{id}.
@Component({
  selector: 'app-admin-approvals',
  imports: [
    MatCardModule,
    MatChipsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './approvals.html',
  styleUrl: './admin.scss',
})
export class AdminApprovals {
  private readonly admin = inject(AdminService);

  readonly state = signal<ApprovalsState>({ status: 'loading' });
  readonly busyFor = signal<string | null>(null);
  readonly busyAction = signal<Exclude<BusyAction, null>>('approve');
  readonly actionError = signal<string | null>(null);

  readonly isLoading = computed(() => this.state().status === 'loading');
  readonly errorMessage = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.message : null;
  });
  readonly pendingUsers = computed(() => {
    const s = this.state();
    return s.status === 'ready' ? s.users : null;
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.state.set({ status: 'loading' });
    this.actionError.set(null);
    this.admin.listUsers({ status: 'pending' }).subscribe({
      next: (res) => this.state.set({ status: 'ready', users: res.data }),
      error: (err) =>
        this.state.set({
          status: 'error',
          message: readApiError(err).pt,
        }),
    });
  }

  roleLabel(user: PublicUser): string {
    return ROLE_LABELS[user.role];
  }

  since(user: PublicUser): string {
    return new Date(user.createdAt).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  isBusy(user: PublicUser, action: 'approve' | 'deny'): boolean {
    return this.busyFor() === user.userId && this.busyAction() === action;
  }

  approve(user: PublicUser): void {
    this.apply(user, 'approve', { status: 'active' });
  }

  deny(user: PublicUser): void {
    this.apply(user, 'deny', { status: 'denied' });
  }

  private apply(user: PublicUser, action: 'approve' | 'deny', changes: { status: 'active' | 'denied' }): void {
    if (this.busyFor() !== null) {
      return;
    }
    this.busyFor.set(user.userId);
    this.busyAction.set(action);
    this.actionError.set(null);
    this.admin.updateUser(user.userId, changes).subscribe({
      next: () => {
        this.busyFor.set(null);
        this.load();
      },
      error: (err) => {
        this.busyFor.set(null);
        this.actionError.set(readApiError(err).pt);
      },
    });
  }
}