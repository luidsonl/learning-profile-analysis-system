import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Logo from "../components/brand/Logo";
import Button from "../components/atoms/Button";
import Input from "../components/atoms/Input";
import Field from "../components/atoms/Field";
import ErrorText from "../components/atoms/ErrorText";
import { authApi } from "../api/endpoints";
import { ApiError } from "../api/client";

export default function RegisterPage() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"guardian" | "educator">("guardian");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.register({ name, email, password, role });
      navigate("/login", { replace: true, state: { registered: true } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível criar a conta.");
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
          <h1 className="mb-1 text-2xl font-bold text-text">Criar conta</h1>
          <p className="mb-5 text-text-muted">
            Responsáveis e educadores podem criar uma conta. Estudantes são cadastrados por um
            responsável ou educador.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Field label="Nome completo" htmlFor="name" required>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </Field>
            <Field label="E-mail" htmlFor="email" required>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </Field>
            <Field label="Senha" htmlFor="password" required hint="Mínimo de 8 caracteres.">
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" minLength={8} />
            </Field>
            <Field label="Perfil" htmlFor="role" required>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as "guardian" | "educator")}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-text focus:outline-2 focus:outline-focus"
              >
                <option value="guardian">Responsável (pai/mãe/tutor)</option>
                <option value="educator">Educador</option>
              </select>
            </Field>
            {error && <ErrorText message={error} />}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Criando…" : "Criar conta"}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-text-muted">
          Já tem conta?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
