import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import {
  AssessmentsList,
  GuardianListResponse,
  GuardianSearchResponse,
  ObservationCreateRequest,
  ObservationListResponse,
  PredictionsList,
  RecommendationCreateRequest,
  RecommendationListResponse,
  RecommendationUpdateRequest,
  StudentCreateRequest,
  StudentCreateResponse,
  StudentListResponse,
  StudentResponse,
  StudentUpdateRequest,
  StudentUpdateResponse,
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

  updateStudent(id: string, body: StudentUpdateRequest) {
    return this.http.patch<StudentUpdateResponse>(`/api/students/${id}`, body);
  }

  deleteStudent(id: string) {
    return this.http.delete<void>(`/api/students/${id}`);
  }

  linkStudentAccount(id: string, userId: string) {
    return this.http.post<never>(`/api/students/${id}/accounts/${userId}/link`, {});
  }

  searchGuardians(email: string) {
    return this.http.get<GuardianSearchResponse>('/api/users', {
      params: { role: 'guardian', email },
    });
  }

  guardians(id: string) {
    return this.http.get<GuardianListResponse>(`/api/students/${id}/guardians`);
  }

  grantGuardian(id: string, userId: string) {
    return this.http.post<never>(`/api/students/${id}/guardians`, { userId });
  }

  revokeGuardian(id: string, userId: string) {
    return this.http.delete<never>(`/api/students/${id}/guardians/${userId}`);
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

  addObservation(id: string, body: ObservationCreateRequest) {
    return this.http.post<never>(`/api/students/${id}/observations`, body);
  }

  deleteObservation(id: string, timestamp: string) {
    return this.http.delete(`/api/students/${id}/observations/${encodeURIComponent(timestamp)}`);
  }

  proposeRecommendation(id: string, body: RecommendationCreateRequest) {
    return this.http.post<never>(`/api/students/${id}/recommendations`, body);
  }

  updateRecommendation(id: string, recoId: string, body: RecommendationUpdateRequest) {
    return this.http.patch<never>(`/api/students/${id}/recommendations/${recoId}`, body);
  }
}