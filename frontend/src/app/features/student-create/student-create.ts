import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';

import { StudentsService } from '../../core/students/students.service';

@Component({
  selector: 'app-student-create',
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
  templateUrl: './student-create.html',
  styleUrl: './student-create.scss',
})
export class StudentCreate {
  private readonly students = inject(StudentsService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.group({
    name: ['', Validators.required],
    birthDate: ['', Validators.required],
    gender: [''],
    grade: [''],
    school: [''],
  });

  submit(): void {
    if (this.form.invalid || this.isLoading()) {
      return;
    }
    this.isLoading.set(true);
    this.errorMessage.set(null);
    const form = this.form.value;
    this.students
      .createStudent({
        name: form.name ?? '',
        birthDate: form.birthDate ?? '',
        gender: form.gender ?? undefined,
        grade: form.grade ?? undefined,
        school: form.school ?? undefined,
      })
      .subscribe({
        next: () => this.router.navigate(['/estudantes']),
        error: () => {
          this.isLoading.set(false);
          this.errorMessage.set('Não foi possível cadastrar o estudante. Verifique os dados e tente novamente.');
        },
      });
  }
}