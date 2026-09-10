// DTO types hand-checked against specs/api.yaml (OpenAPI 3.0.3, the SSOT for
// shapes). Until a generator is wired up these stay hand-maintained in sync.

export type Role = 'guardian' | 'educator' | 'student' | 'admin';
export type UserStatus = 'pending' | 'active' | 'denied';

export interface PublicUser {
  userId: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  birthDate?: string;
  age?: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: PublicUser;
}

export type RegisterRole = 'guardian' | 'educator' | 'student';

export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
  role?: RegisterRole;
  birthDate?: string;
}

export interface RegisterResponse {
  user: PublicUser;
}

export interface MeResponse {
  user: PublicUser;
  studentId: string | null;
}

export type Audience = 'guardian' | 'educator' | 'student';

export type QuestionType = 'likert' | 'single' | 'multiple' | 'text' | 'date' | 'number';

export interface FormQuestion {
  id: string;
  type: QuestionType;
  text: string;
  group: string;
  options?: number[] | string[];
  example?: string;
}

export interface FormSection {
  id: string;
  title: string;
  group: string;
  questions: FormQuestion[];
}

export interface FormDefinition {
  formId: string;
  version: number;
  name: string;
  audience: Audience;
  description: string;
  scale?: string;
  sections: FormSection[];
}

export interface FormResponse {
  form: FormDefinition;
}

export interface FormSubmissionRequest {
  answers: Record<string, number>;
  requestId: string;
}

export interface FormSubmissionAccepted {
  submissionId: string;
  formId: string;
  submittedBy?: string;
}

export interface Prediction {
  predictionId: string;
  model: string;
  modelVersion: string;
  method: string;
  label: string;
  form?: string | null;
  submission?: string | null;
  formVersion?: number | null;
  createdAt: string;
  scores: Record<string, number>;
  confidence: number;
}

export interface PredictionsList {
  data: Prediction[];
  count: number;
}

export interface Assessment {
  kind: string;
  scores: Record<string, number>;
  label?: string | null;
  multimodal: boolean;
  method: string;
  submission?: string | null;
  createdAt: string;
}

export interface AssessmentsList {
  data: Assessment[];
  count: number;
}

export interface Student {
  studentId: string;
  name: string;
  birthDate?: string;
  gender?: string | null;
  grade?: string | null;
  school?: string | null;
  specialNeeds?: string[];
  status: 'active';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  studentUserId?: string | null;
  varkLabel?: string | null;
  varkScores?: Record<string, number> | null;
  varkMultimodal?: boolean | null;
}

export interface StudentResponse {
  student: Student;
}

export interface SubmissionSummary {
  submissionId: string;
  formId: string;
  formVersion: number;
  answers: Record<string, number>;
  submittedBy: string;
  submittedByRole: string;
  createdAt: string;
}

export interface SubmissionsList {
  data: SubmissionSummary[];
  count: number;
}

export type RecommendationKind = 'manual' | 'auto';
export type RecommendationStatus = 'proposed' | 'approved' | 'rejected' | 'published';
export type RecommendationVisibility = 'private' | 'published';

export interface Recommendation {
  recoId: string;
  kind: RecommendationKind;
  title: string;
  text: string;
  tags?: string[];
  status: RecommendationStatus;
  visibility: RecommendationVisibility;
  source?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt?: string | null;
}

export interface RecommendationListResponse {
  data: Recommendation[];
  count: number;
}

export type ReportKind = 'profile' | string;
export type ReportStatus = 'queued' | 'generated';

export interface ReportMetadata {
  reportId: string;
  studentId: string;
  kind: ReportKind;
  status: ReportStatus;
  createdAt: string;
  requestedBy: string;
}

export interface ReportListResponse {
  data: ReportMetadata[];
  count: number;
}

export interface ReportGenerateRequest {
  kind?: ReportKind;
}

export interface ReportGenerateResponse {
  reportId: string;
  studentId: string;
  kind: ReportKind;
  status: ReportStatus;
}

export interface ReportDownloadResponse {
  url: string;
  reportId: string;
  s3Key: string;
  expiresIn: number;
}

export interface Observation {
  observationTimestamp: string;
  category: string;
  text: string;
  rating?: number | null;
  submittedBy: string;
}

export interface ObservationListResponse {
  data: Observation[];
  count: number;
}