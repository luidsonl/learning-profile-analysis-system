import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { AssessmentSteps } from './steps';

const authStub = (role: string | null) => ({
  user: () => (role ? { role } : null),
});

describe('AssessmentSteps', () => {
  let fixture: ComponentFixture<AssessmentSteps>;

  const setup = (role: string | null, step: 1 | 2 | 3, studentId = '') => {
    TestBed.configureTestingModule({
      imports: [AssessmentSteps],
      providers: [provideRouter([]), { provide: AuthService, useValue: authStub(role) }],
    });
    fixture = TestBed.createComponent(AssessmentSteps);
    fixture.componentRef.setInput('step', step);
    if (studentId) fixture.componentRef.setInput('studentId', studentId);
    fixture.detectChanges();
  };

  it('marks the current step and links the previous ones', () => {
    setup('educator', 3, 's1');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a[href="/avaliacoes"]')).toBeTruthy();
    expect(el.querySelector('a[href="/avaliacoes/s1"]')).toBeTruthy();
    expect(el.querySelector('.current')?.textContent?.trim()).toContain('3. Envios e resultados');
  });

  it('renders step 1 as the current one without links', () => {
    setup('educator', 1);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.current')?.textContent?.trim()).toContain('1. Estudante');
    expect(el.querySelector('a')).toBeNull();
  });

  it('for students, step 1 renders as a static "Meu perfil" label — never a link to the selector', () => {
    setup('student', 2, 's1');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.done')?.textContent?.trim()).toContain('1. Meu perfil');
    expect(el.querySelector('a[href="/avaliacoes"]')).toBeNull();
    expect(el.querySelector('a')).toBeNull();
  });

  it('for students at step 3, the current step is still marked', () => {
    setup('student', 3, 's1');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.done')?.textContent?.trim()).toContain('1. Meu perfil');
    expect(el.querySelector('.current')?.textContent?.trim()).toContain('3. Envios e resultados');
  });
});