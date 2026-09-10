import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import { AssessmentsList, PredictionsList, StudentResponse } from '../api/types';

@Injectable({ providedIn: 'root' })
export class StudentsService {
  private readonly http = inject(HttpClient);

  getStudent(id: string) {
    return this.http.get<StudentResponse>(`/api/students/${id}`);
  }

  predictions(id: string, form?: string) {
    const query = form ? `?form=${encodeURIComponent(form)}` : '';
    return this.http.get<PredictionsList>(`/api/students/${id}/predictions${query}`);
  }

  assessments(id: string, profile?: string) {
    const query = profile ? `?profile=${encodeURIComponent(profile)}` : '';
    return this.http.get<AssessmentsList>(`/api/students/${id}/assessments${query}`);
  }
}