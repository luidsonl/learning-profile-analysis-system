import { Component } from '@angular/core';

import { StudentForm } from '../../shared/ui/student-form/student-form';

@Component({
  selector: 'app-student-create',
  imports: [StudentForm],
  templateUrl: './student-create.html',
  styleUrl: './student-create.scss',
})
export class StudentCreate {}