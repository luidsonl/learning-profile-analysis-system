import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import {
  UserListResponse,
  UserResetPasswordRequest,
  UserUpdateRequest,
  UserUpdateResponse,
} from '../api/types';

// Backend surface for the Admin function (specs/api.yaml, tag `Admin`).
// Educators share GET/PATCH on /admin/users, but the admin pages that use this
// service are admin-only (adminGuard); role/password/delete stay admin gated.
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  listUsers(params?: { role?: string; status?: string }) {
    return this.http.get<UserListResponse>('/api/admin/users', { params });
  }

  updateUser(id: string, changes: UserUpdateRequest) {
    return this.http.patch<UserUpdateResponse>(`/api/admin/users/${id}`, changes);
  }

  resetPassword(id: string, password: string) {
    return this.http.post<{ message: string }>(`/api/admin/users/${id}/password`, {
      password,
    } satisfies UserResetPasswordRequest);
  }

  deleteUser(id: string) {
    return this.http.delete<{ message: string }>(`/api/admin/users/${id}`);
  }
}