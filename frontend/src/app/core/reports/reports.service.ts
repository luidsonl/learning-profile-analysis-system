import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import {
  ReportDownloadResponse,
  ReportGenerateRequest,
  ReportGenerateResponse,
  ReportListResponse,
} from '../api/types';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly http = inject(HttpClient);

  listFor(studentId: string) {
    return this.http.get<ReportListResponse>(`/api/students/${studentId}/reports`);
  }

  generate(studentId: string, request: ReportGenerateRequest = {}) {
    return this.http.post<ReportGenerateResponse>(`/api/students/${studentId}/reports/generate`, request);
  }

  downloadUrl(reportId: string) {
    return this.http.get<ReportDownloadResponse>(`/api/reports/${reportId}/download`);
  }
}