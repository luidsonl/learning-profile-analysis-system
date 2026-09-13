import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';

import { Student } from '../../core/api/types';
import { AuthService } from '../../core/auth/auth.service';
import { StudentsService } from '../../core/students/students.service';
import { AssessmentSteps } from './steps';

type BlockState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; students: Student[] };

// Step 1 — choose the student under assessment. Educators see every student
// in scope (those they follow), guardians only their assigned students, and a
// student skips the choice entirely: their own linked profile is the target.
@Component({
  selector: 'app-select-student',
  imports: [AssessmentSteps, MatButtonModule, MatCardModule, MatProgressSpinnerModule, RouterLink],
  templateUrl: './select-student.html',
  styleUrl: './select-student.scss',
})
export class SelectStudent {
  private readonly auth = inject(AuthService);
  private readonly students = inject(StudentsService);

  readonly role = computed(() => this.auth.user()?.role ?? null);
  readonly isStudent = computed(() => this.role() === 'student');
  readonly ownStudentId = computed(() => (this.isStudent() ? this.auth.studentId() : null));

  readonly block = signal<BlockState>({ status: 'loading' });

  readonly items = computed(() => {
    const block = this.block();
    return block.status === 'ready' ? block.students : [];
  });

  readonly errorMessage = computed(() => {
    const block = this.block();
    return block.status === 'error' ? block.message : null;
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.block.set({ status: 'loading' });
    if (!this.isStudent()) {
      this.students.list().subscribe({
        next: (res) => this.block.set({ status: 'ready', students: res.data }),
        error: () =>
          this.block.set({ status: 'error', message: 'Não foi possível carregar os estudantes.' }),
      });
      return;
    }
    const own = this.ownStudentId();
    if (!own) {
      this.block.set({ status: 'ready', students: [] });
      return;
    }
    this.students.getStudent(own).subscribe({
      next: (res) => this.block.set({ status: 'ready', students: [res.student] }),
      error: () =>
        this.block.set({ status: 'error', message: 'Não foi possível carregar o seu perfil.' }),
    });
  }

  details(student: Student): string {
    return [student.grade, student.school].filter(Boolean).join(' · ');
  }
}