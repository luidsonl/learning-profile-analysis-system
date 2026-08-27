import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApi } from "../lib/useApi";
import { formsApi } from "../api/endpoints";
import { ApiError } from "../api/client";
import type { Question } from "../api/types";
import PageTitle from "../components/atoms/PageTitle";
import Card, { CardBody, CardFooter } from "../components/atoms/Card";
import Spinner from "../components/atoms/Spinner";
import ErrorText from "../components/atoms/ErrorText";
import Button from "../components/atoms/Button";
import Stepper from "../components/molecules/Stepper";
import QuestionControl from "../components/molecules/QuestionControl";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function VarkWizardPage() {
  const { studentId, formId } = useParams();
  const navigate = useNavigate();

  const { data: formData, loading, error } = useApi(() => formsApi.get(formId!), `vark-${formId}`);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <Spinner className="py-12" />;
  if (error) return <ErrorText message={error} />;

  const form = formData?.form;
  if (!form) return null;

  const sections = form.sections;
  const currentFormId = form.formId;
  const stepTitles = sections.map((s) => s.title);
  const currentSection = sections[step];
  const currentQuestions: Question[] = currentSection ? currentSection.questions : [];

  function setAnswer(q: Question, value: unknown) {
    setAnswers((a) => ({ ...a, [q.id]: value }));
    setErrors((e) => {
      if (!e[q.id]) return e;
      const next = { ...e };
      delete next[q.id];
      return next;
    });
  }

  function validateStep(): boolean {
    const next: Record<string, string> = {};
    for (const q of currentQuestions) {
      const v = answers[q.id];
      if (v === undefined || v === null || v === "" ) {
        next[q.id] = "Escolha uma opção para continuar.";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function next() {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, sections.length - 1));
  }

  async function finish() {
    if (!validateStep()) return;
    setSubmitting(true);
    try {
      await formsApi.submit(studentId!, currentFormId, { answers });
      toast.success("Questionário enviado! Seu perfil de aprendizado está sendo calculado.");
      navigate(`/students/${studentId}/forms`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível enviar suas respostas.");
    } finally {
      setSubmitting(false);
    }
  }

  const isLast = step === sections.length - 1;

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title={form.name} subtitle={form.description ?? form.scale} />
      {sections.length > 1 && <Stepper steps={stepTitles} current={step} />}
      <Card>
        <CardBody>
          <h2 className="mb-5 text-lg font-semibold text-text">{currentSection?.title}</h2>
          <div className="space-y-6">
            {currentQuestions.map((q) => (
              <QuestionControl
                key={q.id}
                question={q}
                value={answers[q.id]}
                onChange={(v) => setAnswer(q, v)}
                error={errors[q.id]}
              />
            ))}
          </div>
        </CardBody>
        <CardFooter className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => (step === 0 ? navigate(-1) : setStep((s) => s - 1))}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {step === 0 ? "Voltar" : "Anterior"}
          </Button>
          {isLast ? (
            <Button type="button" onClick={() => void finish()} disabled={submitting}>
              {submitting ? "Enviando…" : "Enviar respostas"}
            </Button>
          ) : (
            <Button type="button" onClick={next}>
              Próximo
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
