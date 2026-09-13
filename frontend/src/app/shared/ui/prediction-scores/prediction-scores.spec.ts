import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';

import { PredictionScores } from './prediction-scores';

describe('PredictionScores', () => {
  let fixture: ComponentFixture<PredictionScores>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PredictionScores],
      providers: [provideRouter([]), provideAnimations()],
    }).compileComponents();
    fixture = TestBed.createComponent(PredictionScores);
    fixture.componentRef.setInput('scores', { R: 0.1, A: 0.2, K: 0.7 });
    fixture.detectChanges();
  });

  it('renders probabilities as raw ratios without "%" by default', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('0.7');
    expect(el.textContent).not.toContain('%');
  });

  it('bars are relative to the strongest score, not to 100%', () => {
    const bars = fixture.componentInstance.bars;
    expect(bars.map((b) => b.value)).toEqual([14, 29, 100]); // 0.1/0.7·100, rounded
    expect(bars.map((b) => b.display)).toEqual(['0.1', '0.2', '0.7']);
  });

  it('renders percentages when format=percentage', () => {
    fixture.componentRef.setInput('scores', { R: 0.1, A: 0.2, K: 0.7 });
    fixture.componentRef.setInput('format', 'percentage');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('10%');
    expect(el.textContent).toContain('20%');
    expect(el.textContent).toContain('70%');
  });
});