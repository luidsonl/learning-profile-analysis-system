import { computed, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Observation } from '../../core/api/types';
import { AuthService } from '../../core/auth/auth.service';
import { StudentsService } from '../../core/students/students.service';

type ObservationsState =
  | { status: 'pending' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; observations: Observation[] };

@Component({
  selector: 'app-student-observations',
  imports: [MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './student-observations.html',
  styleUrl: './student-observations.scss',
})
export class StudentObservations {
  private readonly auth = inject(AuthService);
  private readonly students = inject(StudentsService);

  readonly state = signal<ObservationsState>({ status: 'loading' });

  readonly isPending = computed(() => this.state().status === 'pending');
  readonly isLoading = computed(() => this.state().status === 'loading');
  readonly errorMessage = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.message : null;
  });
  readonly observations = computed(() => {
    const s = this.state();
    return s.status === 'ready' ? s.observations : null;
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
    this.students.observations(studentId).subscribe({
      next: (res) => this.state.set({ status: 'ready', observations: res.data }),
      error: () => this.state.set({ status: 'error', message: 'Não foi possível carregar as observações.' }),
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}