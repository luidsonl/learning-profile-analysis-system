import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { StudentsService } from '../../../core/students/students.service';
import { StudentForm } from './student-form';

const student = {
  studentId: 's1',
  name: 'Pedro Reis',
  birthDate: '2012-04-01',
  gender: 'masculino',
  grade: '7º ano',
  school: 'Colégio Bela Vista',
  status: 'active' as const,
  createdBy: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const createSpy = vi.fn(() => of({ studentId: 's9' }));
const updateSpy = vi.fn(() => of({ studentId: 's1', updated: ['name', 'grade'] }));
const getStudentSpy = vi.fn(() => of({ student: student }));

describe('StudentForm', () => {
  let fixture: ComponentFixture<StudentForm>;

  beforeEach(async () => {
    createSpy.mockClear();
    updateSpy.mockClear();
    getStudentSpy.mockClear();
    TestBed.configureTestingModule({
      imports: [StudentForm],
      providers: [
        {
          provide: StudentsService,
          useValue: { createStudent: createSpy, updateStudent: updateSpy, getStudent: getStudentSpy },
        },
        provideRouter([]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StudentForm);
  });

  it('builds the create request from the form', () => {
    fixture.componentRef.setInput('mode', 'create');
    fixture.detectChanges();
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
    fixture.componentRef.setInput('mode', 'create');
    fixture.detectChanges();
    fixture.componentInstance.form.markAllAsTouched();
    fixture.detectChanges();
    fixture.componentInstance.submit();
    expect(createSpy).not.toHaveBeenCalled();
    const error = fixture.nativeElement.querySelector('mat-error') as HTMLElement;
    expect(error).toBeTruthy();
  });

  it('pre-fills the form from the existing student in edit mode', () => {
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('studentId', 's1');
    fixture.detectChanges();
    expect(getStudentSpy).toHaveBeenCalledWith('s1');
    expect(fixture.componentInstance.form.value.name).toBe('Pedro Reis');
  });

  it('patches the edited fields', () => {
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('studentId', 's1');
    fixture.detectChanges();
    fixture.componentInstance.form.patchValue({ name: 'Pedro R.', grade: '8º ano' });
    fixture.componentInstance.submit();
    expect(updateSpy).toHaveBeenCalledWith('s1', {
      name: 'Pedro R.',
      birthDate: '2012-04-01',
      gender: 'masculino',
      grade: '8º ano',
      school: 'Colégio Bela Vista',
    });
  });
});