import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'assessment-steps',
  imports: [RouterLink],
  templateUrl: './steps.html',
  styleUrl: './steps.scss',
})
export class AssessmentSteps {
  readonly step = input.required<1 | 2 | 3>();
  readonly studentId = input<string>('');
}