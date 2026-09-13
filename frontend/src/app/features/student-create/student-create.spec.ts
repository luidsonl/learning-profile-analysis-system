import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { StudentsService } from '../../core/students/students.service';
import { StudentCreate } from './student-create';

describe('StudentCreate', () => {
  let fixture: ComponentFixture<StudentCreate>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [StudentCreate],
      providers: [{ provide: StudentsService, useValue: {} }, provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(StudentCreate);
    fixture.detectChanges();
  });

  it('renders the shared student form', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Novo estudante');
    expect(text).toContain('Cadastrar');
  });
});