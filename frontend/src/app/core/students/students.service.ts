import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import {
  AssessmentsList,
  ObservationListResponse,
  PredictionsList,
  RecommendationListResponse,
  StudentCreateRequest,
  StudentCreateResponse,
  StudentListResponse,
  StudentResponse,
} from '../api/types';

@Injectable({ providedIn: 'root' })
export class StudentsService {
  private readonly http = inject(HttpClient);

  list() {
    return this.http.get<StudentListResponse>('/api/students');
  }

  getStudent(id: string) {
    return this.http.get<StudentResponse>(`/api/students/${id}`);
  }

  createStudent(body: StudentCreateRequest) {
    return this.http.post<StudentCreateResponse>('/api/students', body);
  }

  predictions(id: string, form?: string) {
    const query = form ? `?form=${encodeURIComponent(form)}` : '';
    return this.http.get<PredictionsList>(`/api/students/${id}/predictions${query}`);
  }

  assessments(id: string, profile?: string) {
    const query = profile ? `?profile=${encodeURIComponent(profile)}` : '';
    return this.http.get<AssessmentsList>(`/api/students/${id}/assessments${query}`);
  }

  recommendations(id: string) {
    return this.http.get<RecommendationListResponse>(`/api/students/${id}/recommendations`);
  }

  observations(id: string) {
    return this.http.get<ObservationListResponse>(`/api/students/${id}/observations`);
  }
}