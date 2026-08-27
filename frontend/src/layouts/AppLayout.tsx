import { Link, Outlet } from "react-router-dom";
import Logo from "../components/brand/Logo";
import UserMenu from "../components/organisms/UserMenu";

export default function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" aria-label="Página inicial">
            <Logo />
          </Link>
          <UserMenu />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-text-muted">
          <p>
            Dados tratados conforme a LGPD (Lei nº 13.709/2018). Seus dados são usados apenas para
            personalizar o aprendizado e não são compartilhados com terceiros. Dúvidas ou
            solicitações sobre seus dados:{" "}
            <a href="mailto:encarregado@instituicao.edu.br">encarregado@instituicao.edu.br</a>.
          </p>
        </div>
      </footer>
    </div>
  );
}
