import { Component, input } from '@angular/core';

import { StudentProfileView } from './student-profile-view';

// Routed page for /perfil/:studentId — an educator/guardian opens a student's
// profile (acting on their behalf, no rename/edit affordances).
@Component({
  selector: 'app-student-profile',
  imports: [StudentProfileView],
  templateUrl: './student-profile.html',
  styleUrl: './student-profile.scss',
})
export class StudentProfile {
  readonly routeStudentId = input.required<string>();
}