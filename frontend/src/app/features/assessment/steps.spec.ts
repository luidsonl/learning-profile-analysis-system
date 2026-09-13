import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AssessmentSteps } from './steps';

describe('AssessmentSteps', () => {
  let fixture: ComponentFixture<AssessmentSteps>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AssessmentSteps],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(AssessmentSteps);
  });

  it('marks the current step and links the previous ones', () => {
    fixture.componentRef.setInput('step', 3);
    fixture.componentRef.setInput('studentId', 's1');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a[href="/avaliacoes"]')).toBeTruthy();
    expect(el.querySelector('a[href="/avaliacoes/s1"]')).toBeTruthy();
    expect(el.querySelector('.current')?.textContent?.trim()).toContain('3. Envios e resultados');
  });

  it('renders step 1 as the current one without links', () => {
    fixture.componentRef.setInput('step', 1);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.current')?.textContent?.trim()).toContain('1. Estudante');
    expect(el.querySelector('a')).toBeNull();
  });
});