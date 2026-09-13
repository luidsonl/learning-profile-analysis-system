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

export interface StudentAccount {
  userId: string;
  name: string;
  email: string;
  birthDate?: string;
  createdAt: string;
  status: 'pending' | 'active';
  available: boolean;
  linkedStudentId: string | null;
}

export interface StudentAccountsResponse {
  data: StudentAccount[];
  count: number;
}

export interface UserListResponse {
  data: PublicUser[];
  count: number;
}

export interface UserUpdateRequest {
  status?: UserStatus;
  role?: Role;
  birthDate?: string;
}

export interface UserUpdateResponse {
  user: PublicUser;
}

export interface UserResetPasswordRequest {
  password: string;
}

export interface GuardianSearchHit {
  userId: string;
  name: string;
  email: string;
}

export interface GuardianSearchResponse {
  data: GuardianSearchHit[];
  count: number;
}

export interface GuardianEdge {
  userId: string;
  name: string;
  email: string;
  relation: string;
  grantedAt: string;
}

export interface GuardianListResponse {
  data: GuardianEdge[];
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

export type FormResultType = 'none' | 'label' | 'percentage';

export interface FormResultMetadata {
  hasInference: boolean;
  type: FormResultType;
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
  result: FormResultMetadata;
  sections: FormSection[];
}

export interface FormResponse {
  form: FormDefinition;
}

export interface FormsList {
  data: FormDefinition[];
  count: number;
}

export interface FormResponseItem {
  submissionId: string;
  formId: string;
  formVersion: number;
  answers: Record<string, number>;
  submittedBy: string;
  submittedByRole: string;
  createdAt: string;
  prediction: Prediction | null;
  assessment: Assessment | null;
}

export interface FormResponsesList {
  data: FormResponseItem[];
  count: number;
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

export interface StudentUser {
  userId: string;
  name: string;
  email: string;
  status: string;
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
  studentUser?: StudentUser | null;
  varkLabel?: string | null;
  varkScores?: Record<string, number> | null;
  varkMultimodal?: boolean | null;
}

export interface StudentResponse {
  student: Student;
}

export interface StudentListResponse {
  data: Student[];
  count: number;
}

export interface StudentCreateRequest {
  name: string;
  birthDate: string;
  gender?: string;
  grade?: string;
  school?: string;
  specialNeeds?: string[];
  accountability?: Record<string, string>;
}

export interface StudentCreateResponse {
  studentId: string;
}

export interface StudentUpdateRequest {
  name?: string;
  birthDate?: string;
  gender?: string;
  grade?: string;
  school?: string;
  specialNeeds?: string[];
}

export interface StudentUpdateResponse {
  studentId: string;
  updated: string[];
}

export type ConsentStatus = 'not_granted' | 'active' | 'revoked';
export type LegalBasis = 'guardian' | 'institution_authorization' | 'self_consent';

export interface ConsentCurrent {
  version: string | null;
  status: ConsentStatus;
  consentAt: string | null;
  consentBy: string | null;
  legalBasis: LegalBasis | null;
  grantedByRole: Role | null;
}

export interface ConsentHistoryEntry {
  version: string;
  status: 'active' | 'revoked';
  grantedBy: string;
  createdAt: string;
}

export interface ConsentResponse {
  current: ConsentCurrent;
  history: ConsentHistoryEntry[];
}

export interface ConsentSetRequest {
  consentVersion: string;
  status: 'active' | 'revoked';
  legalBasis: LegalBasis;
}

export interface ConsentSetResponse {
  studentId: string;
  consentVersion: string;
  status: 'active' | 'revoked';
  legalBasis: LegalBasis;
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

export type ObservationCategory =
  | 'academic'
  | 'behavior'
  | 'social'
  | 'emotional'
  | 'attention'
  | 'other';

export interface ObservationCreateRequest {
  category: ObservationCategory;
  text: string;
  rating?: number;
}

export interface RecommendationCreateRequest {
  title: string;
  text: string;
  tags?: string[];
}

export interface RecommendationUpdateRequest {
  status?: 'proposed' | 'approved' | 'rejected' | 'published';
  visibility?: 'private' | 'published';
}