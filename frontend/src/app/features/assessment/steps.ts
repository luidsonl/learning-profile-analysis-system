import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'assessment-steps',
  imports: [RouterLink],
  templateUrl: './steps.html',
  styleUrl: './steps.scss',
})
export class AssessmentSteps {
  readonly auth = inject(AuthService);
  readonly step = input.required<1 | 2 | 3>();
  readonly studentId = input<string>('');

  // A student targets only their own attributed profile — there is no step-1
  // chooser, so "1. Meu perfil" renders as a static label, never a link back.
  readonly isStudent = computed(() => this.auth.user()?.role === 'student');
}