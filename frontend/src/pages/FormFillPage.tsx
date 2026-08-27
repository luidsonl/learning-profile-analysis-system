import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApi } from "../lib/useApi";
import { formsApi } from "../api/endpoints";
import { ApiError } from "../api/client";
import type { FormDefinition, Question } from "../api/types";
import PageTitle from "../components/atoms/PageTitle";
import Card, { CardBody, CardFooter } from "../components/atoms/Card";
import Spinner from "../components/atoms/Spinner";
import ErrorText from "../components/atoms/ErrorText";
import Button from "../components/atoms/Button";
import QuestionControl from "../components/molecules/QuestionControl";
import QuestionGroup from "../components/molecules/QuestionGroup";
import { toast } from "sonner";

export default function FormFillPage() {
  const { studentId, formId } = useParams();
  const navigate = useNavigate();
  const { data: formData, loading, error } = useApi(
    () => formsApi.get(formId!),
    `form-${formId}`,
  );
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const form: FormDefinition | null = formData?.form ?? null;

  if (loading) return <Spinner className="py-12" />;
  if (error) return <ErrorText message={error} />;
  if (!form) return null;

  const allQuestions: Question[] = form.sections.flatMap((s) => s.questions);

  function setAnswer(q: Question, value: unknown) {
    setAnswers((a) => ({ ...a, [q.id]: value }));
    setErrors((e) => {
      if (!e[q.id]) return e;
      const next = { ...e };
      delete next[q.id];
      return next;
    });
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    for (const q of allQuestions) {
      const v = answers[q.id];
      const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
      if (empty) next[q.id] = "Responda esta pergunta para continuar.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await formsApi.submit(studentId!, form!.formId, { answers });
      toast.success("Respostas enviadas. Perfil será calculado.");
      navigate(`/students/${studentId}/forms`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível enviar as respostas.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title={form.name}
        subtitle={
          form.description ??
          (form.scale ? `Escala: ${form.scale}` : "Preencha as perguntas abaixo.")
        }
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        noValidate
      >
        <Card>
          <CardBody className="space-y-8">
            {form.sections.map((section) => (
              <QuestionGroup key={section.id} title={section.title}>
                <div className="space-y-6">
                  {section.questions.map((q) => (
                    <QuestionControl
                      key={q.id}
                      question={q}
                      value={answers[q.id]}
                      onChange={(v) => setAnswer(q, v)}
                      error={errors[q.id]}
                    />
                  ))}
                </div>
              </QuestionGroup>
            ))}
          </CardBody>
          <CardFooter className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Voltar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Enviando…" : "Enviar respostas"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
