import { Component, input } from '@angular/core';

import { StudentForm } from '../../shared/ui/student-form/student-form';

@Component({
  selector: 'app-student-edit',
  imports: [StudentForm],
  templateUrl: './student-edit.html',
  styleUrl: './student-edit.scss',
})
export class StudentEdit {
  readonly studentId = input.required<string>();
}