import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { Home } from './home';

describe('Home', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the landing card', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('mat-card-title') as HTMLElement;
    expect(title.textContent).toContain('Bem-vindo ao Perfil de Aprendizado');
  });
});