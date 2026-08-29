import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import Logo from "../components/brand/Logo";
import Button from "../components/atoms/Button";
import Input from "../components/atoms/Input";
import Field from "../components/atoms/Field";
import ErrorText from "../components/atoms/ErrorText";
import { ApiError } from "../api/client";

function loginErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Falha ao entrar. Tente novamente.";
  if (err.code === "pending_approval") {
    return "Sua conta está aguardando aprovação. Assim que for aprovada, você poderá entrar.";
  }
  if (err.code === "account_denied") {
    return "Sua conta não foi aprovada. Para mais informações, contate o encarregado de dados: encarregado@instituicao.edu.br";
  }
  return err.message;
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
  const registered = (location.state as { registered?: boolean } | null)?.registered;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(from || "/", { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-lg border border-border bg-surface p-6 shadow-card">
          <h1 className="mb-1 text-2xl font-bold text-text">Entrar</h1>
          <p className="mb-5 text-text-muted">Acesse sua conta para continuar.</p>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Field label="E-mail" htmlFor="email" required>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Senha" htmlFor="password" required>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            {error && <ErrorText message={error} />}
            {registered && !error && (
              <div role="status" className="rounded-md border border-primary/30 bg-primary-soft px-4 py-3 text-sm text-primary-strong">
                Conta criada com sucesso. Responsáveis e educadores precisam de aprovação antes do
                primeiro acesso.
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-text-muted">
          Não tem conta?{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Cadastre-se
          </Link>
        </p>
      </div>
    </div>
  );
}
