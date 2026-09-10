import { computed, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Recommendation } from '../../core/api/types';
import { AuthService } from '../../core/auth/auth.service';
import { StudentsService } from '../../core/students/students.service';

type RecommendationsState =
  | { status: 'pending' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; recommendations: Recommendation[] };

@Component({
  selector: 'app-student-recommendations',
  imports: [MatCardModule, MatChipsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './student-recommendations.html',
  styleUrl: './student-recommendations.scss',
})
export class StudentRecommendations {
  private readonly auth = inject(AuthService);
  private readonly students = inject(StudentsService);

  readonly state = signal<RecommendationsState>({ status: 'loading' });

  readonly isPending = computed(() => this.state().status === 'pending');
  readonly isLoading = computed(() => this.state().status === 'loading');
  readonly errorMessage = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.message : null;
  });
  readonly recommendations = computed(() => {
    const s = this.state();
    return s.status === 'ready' ? s.recommendations : null;
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
    this.students.recommendations(studentId).subscribe({
      next: (res) => this.state.set({ status: 'ready', recommendations: res.data }),
      error: () => this.state.set({ status: 'error', message: 'Não foi possível carregar as recomendações.' }),
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}