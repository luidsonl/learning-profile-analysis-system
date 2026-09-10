import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { TestBed } from '@angular/core/testing';

import { StudentsService } from './students.service';

const student = {
  studentId: 's1',
  name: 'Ana Lima',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  createdBy: 'u1',
  varkLabel: 'R',
  varkScores: { R: 5, A: 1, K: 2 },
  varkMultimodal: false,
};

describe('StudentsService', () => {
  let service: StudentsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StudentsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('fetches the student', () => {
    service.getStudent('s1').subscribe((res) => expect(res.student.name).toBe('Ana Lima'));
    http.expectOne('/api/students/s1').flush({ student });
  });

  it('lists predictions filtered by form', () => {
    service.predictions('s1', 'vark').subscribe();
    http.expectOne('/api/students/s1/predictions?form=vark').flush({ data: [], count: 0 });
  });

  it('lists assessments without a profile filter by default', () => {
    service.assessments('s1').subscribe();
    http.expectOne('/api/students/s1/assessments').flush({ data: [], count: 0 });
  });
});