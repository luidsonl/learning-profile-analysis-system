import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { input } from '@angular/core';

import { FormDefinition } from '../../core/api/types';
import { FormsService } from '../../core/forms/forms.service';
import { StudentsService } from '../../core/students/students.service';
import { AssessmentSteps } from './steps';

type BlockState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; forms: FormDefinition[] };

// Step 2 — choose the form for the selected student. Only the curated forms
// registry is offered (just `vark` ships today); the audience is enforced by
// the API, not re-implemented here.
@Component({
  selector: 'app-select-form',
  imports: [AssessmentSteps, MatButtonModule, MatCardModule, MatProgressSpinnerModule, RouterLink],
  templateUrl: './select-form.html',
  styleUrl: './select-form.scss',
})
export class SelectForm {
  readonly studentId = input.required<string>();

  private readonly students = inject(StudentsService);
  private readonly forms = inject(FormsService);

  readonly studentName = signal<string | null>(null);
  readonly studentLoadFailed = signal(false);

  readonly block = signal<BlockState>({ status: 'loading' });

  readonly formsList = computed(() => {
    const block = this.block();
    return block.status === 'ready' ? block.forms : [];
  });

  readonly errorMessage = computed(() => {
    const block = this.block();
    return block.status === 'error' ? block.message : null;
  });

  constructor() {
    // Component inputs bind after construction, so react to the route param.
    effect(() => {
      const id = this.studentId();
      if (!id) {
        return;
      }
      this.students.getStudent(id).subscribe({
        next: (res) => this.studentName.set(res.student.name),
        error: () => this.studentLoadFailed.set(true),
      });
    });

    this.loadForms();
  }

  loadForms(): void {
    this.block.set({ status: 'loading' });
    this.forms.listForms().subscribe({
      next: (res) => this.block.set({ status: 'ready', forms: res.data }),
      error: () =>
        this.block.set({ status: 'error', message: 'Não foi possível carregar os formulários.' }),
    });
  }
}