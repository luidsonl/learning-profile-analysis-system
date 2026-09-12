import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';

import { PublicUser, Role, UserStatus } from '../../core/api/types';
import { AdminService } from '../../core/admin/admin.service';
import { AuthService } from '../../core/auth/auth.service';
import { readApiError } from '../../core/errors/api-error';
import { ROLE_LABELS, USER_STATUS_LABELS } from '../../core/users/user-labels';

type UsersState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; users: PublicUser[] };

type BusyAction = 'approve' | 'block' | 'role' | 'password' | 'delete';

const ROLES: Role[] = ['guardian', 'educator', 'student', 'admin'];
const STATUSES: UserStatus[] = ['pending', 'active', 'denied'];

// User management: list with role/status filters and per-user actions —
// approve/block, promote/demote role, reset password and delete. The backend
// guards self-demotion, last-admin removal and self-deletion; errors surface
// here with actionable messages.
@Component({
  selector: 'app-admin-users',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatChipsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  templateUrl: './users.html',
  styleUrl: './admin.scss',
})
export class AdminUsers {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);

  readonly roles = ROLES;
  readonly statuses = STATUSES;
  readonly roleLabels = ROLE_LABELS;
  readonly statusLabels = USER_STATUS_LABELS;

  readonly roleFilter = signal<Role | ''>('');
  readonly statusFilter = signal<UserStatus | ''>('');

  readonly state = signal<UsersState>({ status: 'loading' });
  readonly busyFor = signal<string | null>(null);
  readonly busyAction = signal<BusyAction>('approve');
  readonly actionError = signal<string | null>(null);

  readonly passwordUserId = signal<string | null>(null);
  readonly passwordControl = new FormControl('', [Validators.required, Validators.minLength(8)]);

  readonly isLoading = computed(() => this.state().status === 'loading');
  readonly errorMessage = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.message : null;
  });
  readonly users = computed(() => {
    const s = this.state();
    return s.status === 'ready' ? s.users : null;
  });

  constructor() {
    this.load();
  }

  load(): void {
    const params: { role?: string; status?: string } = {};
    if (this.roleFilter()) {
      params.role = this.roleFilter();
    }
    if (this.statusFilter()) {
      params.status = this.statusFilter();
    }
    this.state.set({ status: 'loading' });
    this.actionError.set(null);
    this.admin.listUsers(params).subscribe({
      next: (res) => this.state.set({ status: 'ready', users: res.data }),
      error: (err) => {
        this.state.set({ status: 'error', message: readApiError(err).pt });
      },
    });
  }

  onRoleFilter(value: Role | ''): void {
    this.roleFilter.set(value);
    this.load();
  }

  onStatusFilter(value: UserStatus | ''): void {
    this.statusFilter.set(value);
    this.load();
  }

  since(user: PublicUser): string {
    return new Date(user.createdAt).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  isSelf(user: PublicUser): boolean {
    return user.userId === this.auth.user()?.userId;
  }

  isBusy(user: PublicUser, action: BusyAction): boolean {
    return this.busyFor() === user.userId && this.busyAction() === action;
  }

  approve(user: PublicUser): void {
    this.apply(user, 'approve', { status: 'active' });
  }

  block(user: PublicUser): void {
    this.apply(user, 'block', { status: 'denied' });
  }

  changeRole(user: PublicUser, role: Role): void {
    if (role === user.role) {
      return;
    }
    this.apply(user, 'role', { role });
  }

  togglePassword(user: PublicUser): void {
    if (this.passwordUserId() === user.userId) {
      this.passwordUserId.set(null);
      this.passwordControl.reset();
      return;
    }
    this.passwordUserId.set(user.userId);
    this.passwordControl.reset();
  }

  savePassword(user: PublicUser): void {
    const password = this.passwordControl.value ?? '';
    if (!password || this.passwordControl.invalid || this.busyFor() !== null) {
      return;
    }
    this.busyFor.set(user.userId);
    this.busyAction.set('password');
    this.actionError.set(null);
    this.admin.resetPassword(user.userId, password).subscribe({
      next: () => {
        this.busyFor.set(null);
        this.togglePassword(user);
      },
      error: (err) => {
        this.busyFor.set(null);
        this.actionError.set(readApiError(err).pt);
      },
    });
  }

  deleteUser(user: PublicUser): void {
    if (this.busyFor() !== null) {
      return;
    }
    const confirmed = window.confirm(
      `Excluir a conta de ${user.name}? Esta ação remove a conta, sessões e vínculos.`,
    );
    if (!confirmed) {
      return;
    }
    this.busyFor.set(user.userId);
    this.busyAction.set('delete');
    this.actionError.set(null);
    this.admin.deleteUser(user.userId).subscribe({
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

  private apply(
    user: PublicUser,
    action: Exclude<BusyAction, 'password' | 'delete'>,
    changes: { status?: 'active' | 'denied'; role?: Role },
  ): void {
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