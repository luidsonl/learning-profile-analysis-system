import { Component, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';

import { StudentsService } from '../../../core/students/students.service';

type StudentFormMode = 'create' | 'edit';

// Shared student form used by both the "new student" and "edit student" pages.
// In create mode it POSTs and navigates back to the list; in edit mode it loads
// the existing student, lets the user change the editable fields and PATCHes.
@Component({
  selector: 'app-student-form',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RouterLink,
  ],
  templateUrl: './student-form.html',
  styleUrl: './student-form.scss',
})
export class StudentForm {
  readonly mode = input<StudentFormMode>('create');
  readonly studentId = input<string | null>(null);

  private readonly students = inject(StudentsService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly isLoading = signal(false);
  readonly inEditLoad = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.group({
    name: ['', Validators.required],
    birthDate: ['', Validators.required],
    gender: [''],
    grade: [''],
    school: [''],
  });

  constructor() {
    effect(() => {
      if (this.mode() === 'edit' && this.studentId()) {
        this.loadStudent();
      }
    });
  }

  private loadStudent(): void {
    const id = this.studentId();
    if (!id) {
      return;
    }
    this.inEditLoad.set(true);
    this.errorMessage.set(null);
    this.students.getStudent(id).subscribe({
      next: (res) => {
        const s = res.student;
        this.form.setValue({
          name: s.name,
          birthDate: s.birthDate ?? '',
          gender: s.gender ?? '',
          grade: s.grade ?? '',
          school: s.school ?? '',
        });
        this.inEditLoad.set(false);
      },
      error: () => {
        this.inEditLoad.set(false);
        this.errorMessage.set('Não foi possível carregar o estudante.');
      },
    });
  }

  submit(): void {
    if (this.form.invalid || this.isLoading()) {
      return;
    }
    this.isLoading.set(true);
    this.errorMessage.set(null);
    const form = this.form.value;
    const payload = {
      name: form.name ?? '',
      birthDate: form.birthDate ?? '',
      gender: form.gender ?? undefined,
      grade: form.grade ?? undefined,
      school: form.school ?? undefined,
    };

    const request =
      this.mode() === 'edit'
        ? this.students.updateStudent(this.studentId() ?? '', payload)
        : this.students.createStudent(payload);

    request.subscribe({
      next: () => void this.router.navigate([this.mode() === 'edit' ? `/estudantes/${this.studentId()}` : '/estudantes']).catch(() => undefined),
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Não foi possível salvar o estudante. Verifique os dados e tente novamente.');
      },
    });
  }
}