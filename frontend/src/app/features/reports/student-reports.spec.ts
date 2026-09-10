import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { ReportsService } from '../../core/reports/reports.service';
import { StudentReports } from './student-reports';

describe('ReportsService', () => {
  let service: ReportsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReportsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists reports for a student', () => {
    service.listFor('s1').subscribe((res) => expect(res.count).toBe(0));
    http.expectOne('/api/students/s1/reports').flush({ data: [], count: 0 });
  });

  it('generates a report', () => {
    service.generate('s1', { kind: 'profile' }).subscribe();
    const req = http.expectOne('/api/students/s1/reports/generate');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ kind: 'profile' });
    req.flush({ reportId: 'r1', studentId: 's1', kind: 'profile', status: 'queued' });
  });

  it('fetches the presigned download url', () => {
    service.downloadUrl('r1').subscribe((res) => expect(res.url).toContain('https://'));
    http.expectOne('/api/reports/r1/download').flush({ url: 'https://s3.example/report.pdf', reportId: 'r1' });
  });
});

describe('StudentReports', () => {
  let fixture: ComponentFixture<StudentReports>;
  const reportsStub = {
    listFor: () => of({ data: [], count: 0 }),
    generate: () => of({ reportId: 'r1', studentId: 's1', kind: 'profile', status: 'queued' }),
    downloadUrl: () => of({ url: 'https://s3.example/report.pdf' }),
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [StudentReports],
      providers: [
        { provide: AuthService, useValue: { studentId: () => 's1' } },
        { provide: ReportsService, useValue: reportsStub },
        provideRouter([]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StudentReports);
    fixture.detectChanges();
  });

  it('renders the report page with a generate action', () => {
    const heading = fixture.nativeElement.querySelector('h1') as HTMLElement;
    expect(heading.textContent).toContain('Relatórios');
    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLElement).textContent?.includes('Gerar'),
    );
    expect(button).toBeTruthy();
  });

  it('shows the empty state when no reports exist', () => {
    const empty = fixture.nativeElement.querySelector('.state-content') as HTMLElement;
    expect(empty.textContent).toContain('Nenhum relatório');
  });
});