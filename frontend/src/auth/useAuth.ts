import { createContext, useContext } from "react";
import type { User } from "../api/types";

export interface AuthState {
  user: User | null;
  token: string | null;
  /** Owned studentId when the account is a student (self-view). */
  studentId: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
