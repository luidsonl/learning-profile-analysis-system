import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { AppShell } from './app-shell';

describe('AppShell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [provideRouter([]), provideAnimations()],
    }).compileComponents();
  });

  it('renders the pt-BR brand', () => {
    const fixture = TestBed.createComponent(AppShell);
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('.app-title') as HTMLElement;
    expect(title.textContent).toContain('Perfil de Aprendizado');
  });

  it('offers a navigation link to the home page', () => {
    const fixture = TestBed.createComponent(AppShell);
    fixture.detectChanges();
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('mat-nav-list a'),
    ).map((el) => (el as HTMLElement).textContent?.trim());
    expect(links).toContain('Início');
  });

  it('renders a skip link for keyboard users', () => {
    const fixture = TestBed.createComponent(AppShell);
    fixture.detectChanges();
    const skip = fixture.nativeElement.querySelector('.skip-link') as HTMLElement;
    expect(skip).toBeTruthy();
    expect(skip.textContent).toContain('Pular para o conteúdo');
  });
});