import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { StudentsService } from '../../core/students/students.service';
import { StudentCreate } from './student-create';

const createSpy = vi.fn(() => of({ studentId: 's9' }));

describe('StudentCreate', () => {
  let fixture: ComponentFixture<StudentCreate>;

  beforeEach(async () => {
    createSpy.mockClear();
    TestBed.configureTestingModule({
      imports: [StudentCreate],
      providers: [{ provide: StudentsService, useValue: { createStudent: createSpy } }, provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(StudentCreate);
    fixture.detectChanges();
  });

  it('builds the create request from the form', () => {
    fixture.componentInstance.form.setValue({
      name: 'Pedro Reis',
      birthDate: '2012-04-01',
      gender: 'masculino',
      grade: '7º ano',
      school: 'Colégio Bela Vista',
    });
    fixture.componentInstance.submit();
    expect(createSpy).toHaveBeenCalledWith({
      name: 'Pedro Reis',
      birthDate: '2012-04-01',
      gender: 'masculino',
      grade: '7º ano',
      school: 'Colégio Bela Vista',
    });
  });

  it('blocks submission without required fields', () => {
    fixture.componentInstance.form.markAllAsTouched();
    fixture.detectChanges();
    fixture.componentInstance.submit();
    expect(createSpy).not.toHaveBeenCalled();
    const error = fixture.nativeElement.querySelector('mat-error') as HTMLElement;
    expect(error).toBeTruthy();
  });
});