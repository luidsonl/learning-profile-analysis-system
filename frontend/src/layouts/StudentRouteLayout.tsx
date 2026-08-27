import { useAuth } from "../auth/useAuth";
import StudentLayout from "./StudentLayout";
import StudentContextLayout from "./StudentContextLayout";

// Picks the student self-view layout (student account) or the contextual
// management layout (guardian/educator/admin) for the shared /students/:id/*
// subtree.
export default function StudentRouteLayout() {
  const { user } = useAuth();
  return user?.role === "student" ? <StudentLayout /> : <StudentContextLayout />;
}