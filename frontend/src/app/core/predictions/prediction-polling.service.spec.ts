import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PredictionPollingService } from './prediction-polling.service';

const prediction = {
  predictionId: 'p1',
  model: 'vark',
  modelVersion: '2026.08',
  method: 'ml',
  label: 'R',
  submission: 'SUBMISSION#vark#2026-09-10T12:00:00Z',
  createdAt: '2026-09-10T12:00:04Z',
  scores: { R: 0.72, A: 0.18, K: 0.1 },
  confidence: 0.72,
};

describe('PredictionPollingService', () => {
  let service: PredictionPollingService;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    service = TestBed.inject(PredictionPollingService);
    http = TestBed.inject(HttpTestingController);
    sessionStorage.clear();
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it('polls with backoff until the prediction appears', async () => {
    service.submit({
      studentId: 's1',
      formId: 'vark',
      answers: { q01: 5, q02: 4 },
      requestId: 'req-1',
    });

    http.expectOne('/api/students/s1/forms/vark/responses').flush({
      submissionId: 'SUBMISSION#vark#2026-09-10T12:00:00Z',
      formId: 'vark',
    } as never);

    await vi.advanceTimersByTimeAsync(1000);
    http.expectOne('/api/students/s1/predictions?form=vark').flush({ data: [], count: 0 });

    await vi.advanceTimersByTimeAsync(2000);
    http.expectOne('/api/students/s1/predictions?form=vark').flush({ data: [prediction], count: 1 });

    const state = service.state();
    expect(state.status).toBe('ready');
    if (state.status === 'ready') {
      expect(state.prediction.label).toBe('R');
    }
  });

  it('soft-stops in the processing state with a retry available', async () => {
    service.submit({
      studentId: 's1',
      formId: 'vark',
      answers: { q01: 5 },
      requestId: 'req-2',
    });
    http.expectOne('/api/students/s1/forms/vark/responses').flush({
      submissionId: 'SUBMISSION#vark#2026-09-10T12:00:00Z',
      formId: 'vark',
    } as never);

    for (const delay of [1000, 2000, 5000, 5000]) {
      await vi.advanceTimersByTimeAsync(delay);
      http.expectOne('/api/students/s1/predictions?form=vark').flush({ data: [], count: 0 });
    }

    const state = service.state();
    expect(state.status).toBe('processing');
    if (state.status === 'processing') {
      expect(state.submissionId).toBe('SUBMISSION#vark#2026-09-10T12:00:00Z');
    }
  });

  it('recovers via retry after the soft stop', async () => {
    service.submit({
      studentId: 's1',
      formId: 'vark',
      answers: { q01: 5 },
      requestId: 'req-3',
    });
    http.expectOne('/api/students/s1/forms/vark/responses').flush({
      submissionId: 'SUBMISSION#vark#2026-09-10T12:00:00Z',
      formId: 'vark',
    } as never);
    for (const delay of [1000, 2000, 5000, 5000]) {
      await vi.advanceTimersByTimeAsync(delay);
      http.expectOne('/api/students/s1/predictions?form=vark').flush({ data: [], count: 0 });
    }

    service.retry();
    await vi.advanceTimersByTimeAsync(1000);
    http.expectOne('/api/students/s1/predictions?form=vark').flush({ data: [prediction], count: 1 });

    expect(service.state().status).toBe('ready');
  });
});