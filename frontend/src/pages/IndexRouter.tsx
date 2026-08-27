import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import DashboardPage from "./DashboardPage";

// Root route: students land on their own profile self-view; other roles land
// on the dashboard of students in scope.
export default function IndexRouter() {
  const { user, studentId } = useAuth();
  if (user?.role === "student") {
    return <Navigate to={`/students/${studentId}/profile`} replace />;
  }
  return <DashboardPage />;
}
