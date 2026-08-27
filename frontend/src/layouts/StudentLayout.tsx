import { NavLink, Outlet } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ClipboardList,
  FileText,
  Lightbulb,
  UserRound,
} from "lucide-react";
import Logo from "../components/brand/Logo";
import UserMenu from "../components/organisms/UserMenu";
import { useAuth } from "../auth/useAuth";
import { cn } from "../lib/cn";

// Simplified self-view for the student persona: reduced nav, larger type,
// friendly (but not childish) copy. (frontend.md / design-system.md)
export default function StudentLayout() {
  const { studentId } = useAuth();

  if (!studentId) {
    return <div className="p-8 text-text-muted">Perfil do estudante não encontrado.</div>;
  }

  const base = `/students/${studentId}`;
  const tabs: { to: string; label: string; icon: LucideIcon }[] = [
    { to: `${base}/profile`, label: "Meu perfil", icon: UserRound },
    { to: `${base}/forms`, label: "Questionários", icon: ClipboardList },
    { to: `${base}/recommendations`, label: "Dicas para mim", icon: Lightbulb },
    { to: `${base}/reports`, label: "Meus relatórios", icon: FileText },
    { to: `${base}/observations`, label: "Observações", icon: Activity },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo />
          <UserMenu />
        </div>
      </header>
      <nav aria-label="Navegação do estudante" className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  "inline-flex items-center gap-2 border-b-2 px-3 py-3 text-[1.0625rem] font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-text-muted hover:text-text",
                )
              }
            >
              <tab.icon className="size-5" aria-hidden="true" />
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 text-[1.0625rem] leading-relaxed">
        <Outlet />
      </main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-text-muted">
          <p>
            Dados tratados conforme a LGPD (Lei nº 13.709/2018). Seus dados são usados apenas para
            personalizar o aprendizado. Dúvidas ou solicitações:{" "}
            <a href="mailto:encarregado@instituicao.edu.br">encarregado@instituicao.edu.br</a>.
          </p>
        </div>
      </footer>
    </div>
  );
}
