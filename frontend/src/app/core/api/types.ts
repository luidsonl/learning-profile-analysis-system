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