import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { readApiError } from '../../core/errors/api-error';
import { RegisterRole } from '../../core/api/types';

const ROLE_LABELS: Record<RegisterRole, string> = {
  guardian: 'Responsável',
  educator: 'Educador(a)',
  student: 'Estudante',
};

@Component({
  selector: 'app-register',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly submitted = signal(false);
  readonly error = signal<string | null>(null);
  readonly roleLabels = ROLE_LABELS;
  readonly roles = Object.keys(ROLE_LABELS) as RegisterRole[];

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    role: ['guardian' as RegisterRole, Validators.required],
    birthDate: [''],
  });

  get isStudent(): boolean {
    return this.form.controls.role.value === 'student';
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    this.submitted.set(true);
    this.error.set(null);
    const { name, email, password, role, birthDate } = this.form.getRawValue();
    this.auth
      .register({
        name,
        email,
        password,
        role,
        birthDate: birthDate || undefined,
      })
      .subscribe({
        next: () => void this.router.navigateByUrl('/login'),
        error: (err: unknown) => {
          this.submitted.set(false);
          this.error.set(readApiError(err).pt);
        },
      });
  }
}