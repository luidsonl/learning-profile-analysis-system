import { apiFetch } from "./client";
import type {
  AuditEvent,
  ConsentResponse,
  CreateObservationRequest,
  CreateRecommendationRequest,
  CreateStudentRequest,
  CreateStudentResponse,
  EducatorInfo,
  FormDefinition,
  FormResponse,
  GenerateReportResponse,
  GuardianInfo,
  ListResponse,
  LoginRequest,
  LoginResponse,
  MeResponse,
  Observation,
  Prediction,
  Recommendation,
  RegisterRequest,
  RegisterResponse,
  Report,
  ReportDownloadResponse,
  SetConsentRequest,
  Student,
  StudentResponse,
  Submission,
  SubmitResponseRequest,
  SubmitResponseResult,
  UpdateStudentRequest,
  UpdateStudentResponse,
} from "./types";

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (body: RegisterRequest) =>
    apiFetch<RegisterResponse>("/api/auth/register", { method: "POST", body }),
  login: (body: LoginRequest) =>
    apiFetch<LoginResponse>("/api/auth/login", { method: "POST", body }),
  logout: () => apiFetch<void>("/api/auth/logout", { method: "POST" }),
  me: () => apiFetch<MeResponse>("/api/auth/me"),
};

// ── Students & guardianship ──────────────────────────────────────────────────
export const studentsApi = {
  list: () => apiFetch<ListResponse<Student>>("/api/students"),
  get: (id: string) => apiFetch<StudentResponse>(`/api/students/${id}`),
  create: (body: CreateStudentRequest) =>
    apiFetch<CreateStudentResponse>("/api/students", { method: "POST", body }),
  update: (id: string, body: UpdateStudentRequest) =>
    apiFetch<UpdateStudentResponse>(`/api/students/${id}`, { method: "PATCH", body }),
  consent: (id: string) => apiFetch<ConsentResponse>(`/api/students/${id}/consent`),
  setConsent: (id: string, body: SetConsentRequest) =>
    apiFetch<ConsentResponse>(`/api/students/${id}/consent`, { method: "POST", body }),
  createStudentAccount: (id: string, body: { email: string; name: string; password: string }) =>
    apiFetch<{ userId: string }>(`/api/students/${id}/student-account`, { method: "POST", body }),
  guardians: (id: string) => apiFetch<ListResponse<GuardianInfo>>(`/api/students/${id}/guardians`),
  educators: (id: string) => apiFetch<ListResponse<EducatorInfo>>(`/api/students/${id}/educators`),
  grantGuardian: (id: string, body: { userId: string; relation?: string }) =>
    apiFetch<{ studentId: string }>(`/api/students/${id}/guardians`, { method: "POST", body }),
  revokeGuardian: (id: string, userId: string) =>
    apiFetch<void>(`/api/students/${id}/guardians/${userId}`, { method: "DELETE" }),
  follow: (id: string) => apiFetch<{ studentId: string }>(`/api/students/${id}/follow`, { method: "POST" }),
  unfollow: (id: string) => apiFetch<void>(`/api/students/${id}/follow`, { method: "DELETE" }),
};

// ── Forms ────────────────────────────────────────────────────────────────────
export const formsApi = {
  list: (audience?: string) =>
    apiFetch<ListResponse<FormDefinition>>(
      audience ? `/api/forms?audience=${encodeURIComponent(audience)}` : "/api/forms",
    ),
  get: (formId: string) => apiFetch<FormResponse>(`/api/forms/${formId}`),
  responses: (studentId: string, formId: string) =>
    apiFetch<ListResponse<Submission>>(`/api/students/${studentId}/forms/${formId}/responses`),
  submissions: (studentId: string) =>
    apiFetch<ListResponse<Submission>>(`/api/students/${studentId}/submissions`),
  submit: (studentId: string, formId: string, body: SubmitResponseRequest) =>
    apiFetch<SubmitResponseResult>(`/api/students/${studentId}/forms/${formId}/responses`, {
      method: "POST",
      body,
    }),
};

// ── Assessment & prediction ──────────────────────────────────────────────────
export const predictionApi = {
  assessments: (studentId: string) =>
    apiFetch<ListResponse<Prediction>>(`/api/students/${studentId}/assessments`),
  predictions: (studentId: string) =>
    apiFetch<ListResponse<Prediction>>(`/api/students/${studentId}/predictions`),
  runAssessment: (studentId: string) =>
    apiFetch<{ studentId: string }>(`/api/students/${studentId}/assessments`, { method: "POST" }),
};

// ── Recommendations ──────────────────────────────────────────────────────────
export const recommendationsApi = {
  list: (studentId: string) =>
    apiFetch<ListResponse<Recommendation>>(`/api/students/${studentId}/recommendations`),
  create: (studentId: string, body: CreateRecommendationRequest) =>
    apiFetch<{ studentId: string; recoId: string }>(`/api/students/${studentId}/recommendations`, {
      method: "POST",
      body,
    }),
  update: (studentId: string, recoId: string, body: { status?: string; visibility?: string }) =>
    apiFetch<{ studentId: string; recoId: string }>(
      `/api/students/${studentId}/recommendations/${recoId}`,
      { method: "PATCH", body },
    ),
  remove: (studentId: string, recoId: string) =>
    apiFetch<void>(`/api/students/${studentId}/recommendations/${recoId}`, { method: "DELETE" }),
};

// ── Reports ──────────────────────────────────────────────────────────────────
export const reportsApi = {
  generate: (studentId: string, kind = "profile") =>
    apiFetch<GenerateReportResponse>(`/api/students/${studentId}/reports/generate`, {
      method: "POST",
      body: { kind },
    }),
  list: (studentId: string) =>
    apiFetch<ListResponse<Report>>(`/api/students/${studentId}/reports`),
  download: (reportId: string) =>
    apiFetch<ReportDownloadResponse>(`/api/reports/${reportId}/download`),
  remove: (reportId: string) => apiFetch<void>(`/api/reports/${reportId}`, { method: "DELETE" }),
};

// ── Observations ─────────────────────────────────────────────────────────────
export const observationsApi = {
  list: (studentId: string) =>
    apiFetch<ListResponse<Observation>>(`/api/students/${studentId}/observations`),
  create: (studentId: string, body: CreateObservationRequest) =>
    apiFetch<{ studentId: string; observationTimestamp: string }>(
      `/api/students/${studentId}/observations`,
      { method: "POST", body },
    ),
  remove: (studentId: string, timestamp: string) =>
    apiFetch<void>(`/api/students/${studentId}/observations/${timestamp}`, { method: "DELETE" }),
};

// ── Audit ────────────────────────────────────────────────────────────────────
export const auditApi = {
  student: (studentId: string) =>
    apiFetch<ListResponse<AuditEvent>>(`/api/audit/students/${studentId}`),
  actor: (actorId?: string) =>
    apiFetch<ListResponse<AuditEvent>>(
      actorId ? `/api/audit?actor=${encodeURIComponent(actorId)}` : "/api/audit",
    ),
};
