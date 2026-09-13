import { Component, input } from '@angular/core';

import { StudentProfileView } from './student-profile-view';

// Routed page for /perfil/:studentId — an educator/guardian opens a student's
// profile (acting on their behalf, no rename/edit affordances). The input name
// must match the route param so withComponentInputBinding binds it.
@Component({
  selector: 'app-student-profile',
  imports: [StudentProfileView],
  templateUrl: './student-profile.html',
  styleUrl: './student-profile.scss',
})
export class StudentProfile {
  readonly studentId = input.required<string>();
}