import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { studentsApi } from "../api/endpoints";
import { ApiError } from "../api/client";
import PageTitle from "../components/atoms/PageTitle";
import Card, { CardBody, CardFooter } from "../components/atoms/Card";
import Field from "../components/atoms/Field";
import Input from "../components/atoms/Input";
import Button from "../components/atoms/Button";
import ErrorText from "../components/atoms/ErrorText";
import { toast } from "sonner";

const SPECIAL_NEEDS_OPTIONS = [
  "Discalculia",
  "Dislexia",
  "TDAH",
  "Autismo (TEA)",
  "Superdotação (altas habilidades)",
  "Transtorno de ansiedade",
  "Outro",
];

export default function CreateStudentPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [form, setForm] = useState({
    name: "",
    birthDate: "",
    gender: "",
    grade: "",
    school: "",
  });
  const [specialNeeds, setSpecialNeeds] = useState<string[]>([]);
  const [consentVersion] = useState("v1");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function toggleSpecialNeeds(opt: string) {
    setSpecialNeeds((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await studentsApi.create({
        name: form.name,
        birthDate: form.birthDate,
        gender: form.gender || undefined,
        grade: form.grade || undefined,
        school: form.school || undefined,
        specialNeeds: specialNeeds.length ? specialNeeds : undefined,
        accountability: {
          institution: "Instituição de Ensino",
          authorizedBy: user?.name,
          note: "Cadastro inicial com consentimento",
        },
      });
      // Register consent right after creation.
      await studentsApi
        .setConsent(res.studentId, { consentVersion, status: "active", legalBasis: "explicit_consent" })
        .catch(() => undefined);
      toast.success("Estudante criado com consentimento registrado.");
      navigate(`/students/${res.studentId}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível criar o estudante.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Adicionar estudante" subtitle="Cadastre um estudante sob sua responsabilidade." />
      <form onSubmit={handleSubmit} noValidate>
        <Card>
          <CardBody className="space-y-4">
            <Field label="Nome completo" htmlFor="name" required>
              <Input id="name" value={form.name} onChange={set("name")} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Data de nascimento" htmlFor="birthDate" required>
                <Input id="birthDate" type="date" value={form.birthDate} onChange={set("birthDate")} required />
              </Field>
              <Field label="Série/Ano" htmlFor="grade">
                <Input id="grade" value={form.grade} onChange={set("grade")} />
              </Field>
            </div>
            <Field label="Gênero" htmlFor="gender">
              <Input id="gender" value={form.gender} onChange={set("gender")} />
            </Field>
            <Field label="Escola" htmlFor="school">
              <Input id="school" value={form.school} onChange={set("school")} />
            </Field>
            <Field label="Necessidades específicas (opcional)" hint="Selecione todas que se aplicarem.">
              <div className="grid gap-2 sm:grid-cols-2">
                {SPECIAL_NEEDS_OPTIONS.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-base text-text">
                    <input
                      type="checkbox"
                      checked={specialNeeds.includes(opt)}
                      onChange={() => toggleSpecialNeeds(opt)}
                      className="size-5 rounded border-border text-primary"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </Field>
            <div className="rounded-md border border-primary/30 bg-primary-soft p-4">
              <p className="mb-1 font-medium text-primary-strong">Consentimento LGPD</p>
              <p className="text-sm text-text-muted">
                Ao cadastrar este estudante (menor de idade ou pessoa assistida), você declara ser
                responsável legal e autoriza o tratamento dos dados para fins de personalização do
                aprendizado, conforme a Lei nº 13.709/2018.
              </p>
            </div>
            {error && <ErrorText message={error} />}
          </CardBody>
          <CardFooter className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Criando…" : "Criar estudante"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
