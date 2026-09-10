import { computed, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';

import { Student } from '../../core/api/types';
import { StudentsService } from '../../core/students/students.service';
import { VARK_LABELS } from '../../core/vark/vark-labels';

type StudentsListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; students: Student[] };

@Component({
  selector: 'app-students-list',
  imports: [MatCardModule, MatChipsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, RouterLink],
  templateUrl: './students-list.html',
  styleUrl: './students-list.scss',
})
export class StudentsList {
  private readonly students = inject(StudentsService);

  readonly state = signal<StudentsListState>({ status: 'loading' });

  readonly isLoading = computed(() => this.state().status === 'loading');
  readonly errorMessage = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.message : null;
  });
  readonly studentList = computed(() => {
    const s = this.state();
    return s.status === 'ready' ? s.students : null;
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.state.set({ status: 'loading' });
    this.students.list().subscribe({
      next: (res) => this.state.set({ status: 'ready', students: res.data }),
      error: () => this.state.set({ status: 'error', message: 'Não foi possível carregar os estudantes.' }),
    });
  }

  formatLabel(label: string | null | undefined): string {
    return label ? (VARK_LABELS[label] ?? label) : '';
  }

  details(student: Student): string {
    return [student.grade, student.school].filter(Boolean).join(' · ');
  }
}