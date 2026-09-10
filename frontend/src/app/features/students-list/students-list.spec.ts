import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { StudentsService } from '../../core/students/students.service';
import { StudentsList } from './students-list';

const students = {
  data: [
    {
      studentId: 's1',
      name: 'Ana Lima',
      grade: '6º ano',
      school: 'Escola Aurora',
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      createdBy: 'u1',
      varkLabel: 'R',
    },
  ],
  count: 1,
};

const studentsStub = {
  list: () => of(students),
};

describe('StudentsList', () => {
  let fixture: ComponentFixture<StudentsList>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [StudentsList],
      providers: [{ provide: StudentsService, useValue: studentsStub }, provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(StudentsList);
    fixture.detectChanges();
  });

  it('renders the students in scope', () => {
    const title = fixture.nativeElement.querySelector('mat-card-title') as HTMLElement;
    expect(title.textContent).toContain('Ana Lima');
    const subtitle = fixture.nativeElement.querySelector('mat-card-subtitle') as HTMLElement;
    expect(subtitle.textContent).toContain('6º ano');
  });

  it('offers an apply-assessment action per student', () => {
    const link = fixture.nativeElement.querySelector(
      'a[href="/avaliacao/s1"]',
    ) as HTMLElement;
    expect(link).toBeTruthy();
  });
});