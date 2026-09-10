import { Component, Input } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { VARK_LABELS } from '../../../core/vark/vark-labels';

@Component({
  selector: 'prediction-scores',
  imports: [MatListModule, MatProgressBarModule],
  templateUrl: './prediction-scores.html',
  styleUrl: './prediction-scores.scss',
})
export class PredictionScores {
  @Input({ required: true }) scores!: Record<string, number>;

  get bars(): { label: string; value: number }[] {
    return Object.entries(this.scores).map(([key, value]) => ({
      label: VARK_LABELS[key] ?? key,
      value: Math.round(value * 100),
    }));
  }
}