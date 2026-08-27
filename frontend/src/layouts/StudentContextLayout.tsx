import { NavLink, Outlet, useParams } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Lightbulb,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { cn } from "../lib/cn";

// Context nav for a student under /students/:id for guardian/educator/admin.
// Tabs are filtered by what each role may actually see (RBAC matrix in backend.md).
export default function StudentContextLayout() {
  const { user } = useAuth();
  const { studentId } = useParams();

  if (!studentId) {
    return <div className="p-8 text-text-muted">Estudante não informado.</div>;
  }

  const base = `/students/${studentId}`;
  const isEducator = user?.role === "educator" || user?.role === "admin";
  const isGuardianLike = user?.role === "guardian" || user?.role === "admin";

  const tabs: { to: string; label: string; icon: LucideIcon; end?: boolean; show: boolean }[] = [
    { to: base, label: "Visão geral", icon: LayoutDashboard, end: true, show: true },
    { to: `${base}/profile`, label: "Perfil de aprendizado", icon: UserRound, show: true },
    { to: `${base}/forms`, label: "Formulários", icon: ClipboardList, show: true },
    { to: `${base}/recommendations`, label: "Recomendações", icon: Lightbulb, show: true },
    { to: `${base}/reports`, label: "Relatórios", icon: FileText, show: true },
    { to: `${base}/observations`, label: "Observações", icon: Activity, show: isEducator },
    { to: `${base}/audit`, label: "Auditoria", icon: ShieldCheck, show: isGuardianLike },
  ];

  return (
    <div>
      <nav aria-label="Seções do estudante" className="mb-6 -mx-4 overflow-x-auto border-b border-border px-4">
        <div className="flex w-max gap-1">
          {tabs
            .filter((t) => t.show)
            .map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-text-muted hover:text-text",
                  )
                }
              >
                <tab.icon className="size-4" aria-hidden="true" />
                {tab.label}
              </NavLink>
            ))}
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
