import { Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';

import { PublicUser } from '../../core/api/types';
import { AuthService } from '../../core/auth/auth.service';
import { ROLE_LABELS, USER_STATUS_LABELS } from '../../core/users/user-labels';
import { StudentProfileView } from './student-profile-view';

// "Meu perfil" (/perfil, reached via the account menu in the top bar): the
// signed-in account's own info (role badge included — admins show their role).
// A linked student also sees their VARK profile below; an unlinked student gets
// the waiting state. Admin operations live in the /admin area, not here.
@Component({
  selector: 'app-meu-perfil',
  imports: [
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    StudentProfileView,
  ],
  templateUrl: './meu-perfil.html',
  styleUrl: './meu-perfil.scss',
})
export class MeuPerfil {
  private readonly auth = inject(AuthService);

  readonly user = this.auth.user;

  readonly isStudent = computed(() => this.auth.user()?.role === 'student');
  // A linked student's own VARK self-view; null for unlinked/other roles.
  readonly studentScopeId = computed(() =>
    this.isStudent() ? (this.auth.studentId() ?? null) : null,
  );

  readonly roleLabel = computed(() => {
    const u = this.auth.user();
    return u ? ROLE_LABELS[u.role] : '';
  });
  readonly statusLabel = computed(() => {
    const u = this.auth.user();
    return u ? USER_STATUS_LABELS[u.status] : '';
  });

  memberSince(user: PublicUser): string {
    return new Date(user.createdAt).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  birthDate(user: PublicUser): string {
    if (!user.birthDate) {
      return '';
    }
    return new Date(user.birthDate).toLocaleDateString('pt-BR');
  }
}