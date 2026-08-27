import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

// Role-guarded wrapper. Scope itself is enforced server-side; the UI only
// hides what the backend already denies. (auth.md / frontend.md)
export default function RequireRole({
  roles,
  children,
}: {
  roles: ("guardian" | "educator" | "student" | "admin")[];
  children: ReactNode;
}) {
  const { user, studentId } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  if (!roles.includes(user.role)) {
    if (user.role === "student" && studentId) {
      return <Navigate to={`/students/${studentId}/profile`} replace />;
    }
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
