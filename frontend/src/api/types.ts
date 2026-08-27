// ─────────────────────────────────────────────────────────────────────────────
// API types — mirror of the backend response shapes (sam-app/src/api/handlers).
// Root responses come back as `{ ...body }`; lists as `{ data: [], count }`.
// ─────────────────────────────────────────────────────────────────────────────

export type Role = "guardian" | "educator" | "student" | "admin";

export interface ListResponse<T> {
  data: T[];
  count: number;
}

export interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export interface User {
  userId: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
  role?: "guardian" | "educator";
}

export interface RegisterResponse {
  user: User;
}

export interface MeResponse {
  user: User;
  /** Present when the account is a student: the owned studentId (self-view). */
  studentId?: string | null;
}

// ── Students ─────────────────────────────────────────────────────────────────
export interface Student {
  studentId: string;
  name: string;
  birthDate: string;
  gender?: string | null;
  grade?: string | null;
  school?: string | null;
  specialNeeds?: string[] | null;
  status?: string;
  // consent (denormalized on META)
  consentStatus?: string;
  consentVersion?: string | null;
  consentAt?: string | null;
  consentBy?: string | null;
  consentLegalBasis?: string | null;
  consentGrantedByRole?: Role | null;
  // profile (once an assessment runs)
  varkLabel?: string | null;
  varkScores?: Record<string, number> | null;
  varkMultimodal?: boolean;
  // student account edge, if created
  studentUserId?: string | null;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateStudentRequest {
  name: string;
  birthDate: string;
  gender?: string;
  grade?: string;
  school?: string;
  specialNeeds?: string[];
  accountability?: { institution?: string; authorizedBy?: string; note?: string };
}

export interface StudentResponse {
  student: Student;
}

export interface CreateStudentResponse {
  studentId: string;
}

export interface UpdateStudentRequest {
  name?: string;
  birthDate?: string;
  gender?: string;
  grade?: string;
  school?: string;
  specialNeeds?: string[];
}

export interface UpdateStudentResponse {
  studentId: string;
  updated: string[];
}

// ── Consent ──────────────────────────────────────────────────────────────────
export interface ConsentRecord {
  version: string;
  status: "active" | "revoked";
  grantedBy: string;
  createdAt: string;
}

export interface ConsentResponse {
  current: {
    version: string | null;
    status: string;
    consentAt: string | null;
    consentBy: string | null;
    legalBasis: string | null;
    grantedByRole: Role | null;
  };
  history: ConsentRecord[];
}

export interface SetConsentRequest {
  consentVersion: string;
  status: "active" | "revoked";
  legalBasis?: string;
}

// ── Forms (definitions, served read-only) ────────────────────────────────────
export type QuestionType = "single" | "multiple" | "likert" | "text" | "number" | "date";

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  group?: string;
  options?: (string | number)[];
  scale?: string;
}

export interface Section {
  id: string;
  title: string;
  group?: string;
  questions: Question[];
}

export interface FormDefinition {
  formId: string;
  version: number;
  name: string;
  audience: "student" | "guardian" | "educator";
  description?: string;
  scale?: string;
  sections: Section[];
}

export interface FormResponse {
  form: FormDefinition;
}

// ── Submissions / Assessment / Prediction ────────────────────────────────────
export interface Prediction {
  predictionId: string;
  model: string;
  modelVersion: string;
  method: string;
  label: string;
  scores: Record<string, number>;
  confidence: number;
  createdAt: string;
}

export interface Assessment {
  kind: string;
  scores: Record<string, number>;
  label: string;
  multimodal: boolean;
  method: string;
  submission?: string | null;
  createdAt: string;
}

export interface Submission {
  submissionId: string;
  formId: string;
  formVersion: number;
  answers: Record<string, unknown>;
  submittedBy: string;
  submittedByRole: Role;
  createdAt: string;
  prediction: Prediction | null;
  assessment: Assessment | null;
}

export interface SubmitResponseRequest {
  answers: Record<string, unknown>;
  requestId?: string;
}

export interface SubmitResponseResult {
  submissionId: string;
  formId: string;
  submittedBy?: string;
}

// ── Recommendations ──────────────────────────────────────────────────────────
export type RecommendationStatus = "proposed" | "approved" | "rejected" | "published";
export type Visibility = "private" | "published";

export interface Recommendation {
  recoId: string;
  kind: string;
  title: string;
  text: string;
  tags: string[];
  status: RecommendationStatus;
  visibility: Visibility;
  source?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt?: string | null;
}

export interface CreateRecommendationRequest {
  title: string;
  text: string;
  tags?: string[];
}

// ── Reports ──────────────────────────────────────────────────────────────────
export interface Report {
  reportId: string;
  studentId: string;
  kind: string;
  status: string;
  createdAt: string;
  requestedBy: string;
}

export interface GenerateReportResponse {
  reportId: string;
  studentId: string;
  kind: string;
  status: string;
}

export interface ReportDownloadResponse {
  url: string;
  reportId: string;
  s3Key: string;
  expiresIn: number;
}

// ── Observations ─────────────────────────────────────────────────────────────
export type ObservationCategory =
  | "academic"
  | "behavior"
  | "social"
  | "emotional"
  | "attention"
  | "other";

export interface Observation {
  observationTimestamp: string;
  category: ObservationCategory;
  text: string;
  rating: number | null;
  submittedBy: string;
  createdAt: string;
}

export interface CreateObservationRequest {
  category: ObservationCategory;
  text: string;
  rating?: number;
}

// ── Audit ────────────────────────────────────────────────────────────────────
export interface AuditEvent {
  subject: string;
  actorId: string | null;
  actorRole: Role | null;
  action: string | null;
  resource: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

// ── Students scope lists ─────────────────────────────────────────────────────
export interface GuardianInfo {
  userId: string;
  name: string;
  email: string;
  relation?: string | null;
  grantedAt?: string | null;
}

export interface EducatorInfo {
  userId: string;
  name: string;
  email: string;
  followedAt?: string | null;
}
