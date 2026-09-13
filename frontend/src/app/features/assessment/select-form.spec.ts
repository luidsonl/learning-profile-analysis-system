import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { FormsService } from '../../core/forms/forms.service';
import { StudentsService } from '../../core/students/students.service';
import { SelectForm } from './select-form';

const varkForm = {
  formId: 'vark',
  version: 2,
  name: 'VARK',
  audience: 'student',
  description: 'Questionário VARK — como você prefere aprender?',
  sections: [],
};

describe('SelectForm', () => {
  let fixture: ComponentFixture<SelectForm>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SelectForm],
      providers: [
        {
          provide: StudentsService,
          useValue: {
            getStudent: () => of({ student: { studentId: 's1', name: 'Ana Lima', status: 'active', createdBy: 'u1', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' } }),
          },
        },
        {
          provide: FormsService,
          useValue: {
            listForms: () => of({ data: [varkForm], count: 1 }),
          },
        },
        provideRouter([]),
      ],
    });
    fixture = TestBed.createComponent(SelectForm);
  });

  it('offers the available forms for the selected student', async () => {
    fixture.componentRef.setInput('studentId', 's1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Ana Lima');
    expect(el.textContent).toContain('VARK');
    expect(el.querySelector('a[href="/avaliacoes/s1/vark"]')).toBeTruthy();
  });
});