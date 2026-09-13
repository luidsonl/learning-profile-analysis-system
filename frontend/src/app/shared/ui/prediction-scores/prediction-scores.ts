import { Component, Input } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { VARK_LABELS } from '../../../core/vark/vark-labels';

export type ScoreFormat = 'ratio' | 'percentage';

@Component({
  selector: 'prediction-scores',
  imports: [MatListModule, MatProgressBarModule],
  templateUrl: './prediction-scores.html',
  styleUrl: './prediction-scores.scss',
})
export class PredictionScores {
  /** How scores are presented. 'ratio' shows raw 0-1 values (bars relative to
   * the strongest score, no "%"); 'percentage' renders them as percentages. */
  @Input({ required: true }) scores!: Record<string, number>;
  @Input() format: ScoreFormat = 'ratio';

  private get entries(): [string, number][] {
    return Object.entries(this.scores);
  }

  get bars(): { label: string; value: number; display: string }[] {
    const raw = this.entries;
    const max = Math.max(...raw.map(([, v]) => v), 0) || 1;
    return raw.map(([key, value]) => {
      const ratio = Math.max(0, Math.min(1, value / max));
      return {
        label: VARK_LABELS[key] ?? key,
        value: this.format === 'ratio' ? Math.round(ratio * 100) : Math.round(value * 100),
        display:
          this.format === 'percentage'
            ? `${Math.round(value * 100)}%`
            : Number(value.toFixed(2)).toString(),
      };
    });
  }
}