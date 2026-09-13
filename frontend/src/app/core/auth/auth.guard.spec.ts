import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';

import { AuthService } from './auth.service';
import { skipStudentSelectorGuard } from './auth.guard';

describe('skipStudentSelectorGuard', () => {
  const snapshot = {} as ActivatedRouteSnapshot;
  const state = { url: '/avaliacoes' } as RouterStateSnapshot;

  const run = (user: { role: string } | null, studentId: string | null): unknown => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user: () => user, studentId: () => studentId } },
        {
          provide: Router,
          useValue: { createUrlTree: (commands: unknown[]) => ({ commands }) as unknown as UrlTree },
        },
      ],
    });
    return TestBed.runInInjectionContext(() => skipStudentSelectorGuard(snapshot, state));
  };

  it('lets non-students reach the selector', () => {
    expect(run({ role: 'educator' }, null)).toBe(true);
  });

  it('sends a linked student straight to their own profile', () => {
    const result = run({ role: 'student' }, 's1') as unknown as { commands: unknown[] };
    expect(result.commands).toEqual(['/avaliacoes', 's1']);
  });

  it('keeps an unlinked student on the selector (hint page)', () => {
    expect(run({ role: 'student' }, null)).toBe(true);
  });
});