import { provideAnimations } from '@angular/platform-browser/animations';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideAnimations()],
    }).compileComponents();
  });

  it('renders the app shell', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const toolbar = fixture.nativeElement.querySelector('.app-title') as HTMLElement;
    expect(toolbar).toBeTruthy();
    expect(toolbar.textContent).toContain('Perfil de Aprendizado');
  });
});