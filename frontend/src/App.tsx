import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/useAuth";
import RequireAuth from "./routes/RequireAuth";
import RequireRole from "./routes/RequireRole";
import AppLayout from "./layouts/AppLayout";
import StudentRouteLayout from "./layouts/StudentRouteLayout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import IndexRouter from "./pages/IndexRouter";
import MePage from "./pages/MePage";
import CreateStudentPage from "./pages/CreateStudentPage";
import StudentOverviewPage from "./pages/StudentOverviewPage";
import ProfileViewPage from "./pages/ProfileViewPage";
import StudentFormsPage from "./pages/StudentFormsPage";
import VarkWizardPage from "./pages/VarkWizardPage";
import FormFillPage from "./pages/FormFillPage";
import RecommendationsPage from "./pages/RecommendationsPage";
import ReportsPage from "./pages/ReportsPage";
import ObservationsPage from "./pages/ObservationsPage";
import AuditPage from "./pages/AuditPage";
import AdminPage from "./pages/AdminPage";
import NotFoundPage from "./pages/NotFoundPage";

// Students land on their own profile instead of the (management) overview.
function StudentIndexRedirect() {
  const { user, studentId } = useAuth();
  if (user?.role === "student") {
    return <Navigate to={`/students/${studentId}/profile`} replace />;
  }
  return <StudentOverviewPage />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<IndexRouter />} />

        <Route
          path="/me"
          element={
            <RequireRole roles={["guardian", "educator", "admin"]}>
              <MePage />
            </RequireRole>
          }
        />

        <Route
          path="/students/new"
          element={
            <RequireRole roles={["guardian", "educator"]}>
              <CreateStudentPage />
            </RequireRole>
          }
        />

        <Route path="/students/:studentId" element={<StudentRouteLayout />}>
          <Route index element={<StudentIndexRedirect />} />
          <Route path="profile" element={<ProfileViewPage />} />
          <Route path="forms" element={<StudentFormsPage />} />
          <Route path="forms/vark" element={<VarkWizardPage />} />
          <Route path="forms/:formId" element={<FormFillPage />} />
          <Route path="recommendations" element={<RecommendationsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="observations" element={<ObservationsPage />} />
          <Route path="audit" element={<AuditPage />} />
        </Route>

        <Route
          path="/admin"
          element={
            <RequireRole roles={["admin"]}>
              <AdminPage />
            </RequireRole>
          }
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
