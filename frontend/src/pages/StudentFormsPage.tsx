import { useParams, Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { useApi } from "../lib/useApi";
import { formsApi } from "../api/endpoints";
import PageTitle from "../components/atoms/PageTitle";
import Card, { CardBody } from "../components/atoms/Card";
import Spinner from "../components/atoms/Spinner";
import ErrorText from "../components/atoms/ErrorText";
import EmptyState from "../components/atoms/EmptyState";
import Button from "../components/atoms/Button";
import StatusBadge from "../components/atoms/StatusBadge";
import { ClipboardList, ArrowRight } from "lucide-react";
import { formatDateTime } from "../lib/format";

export default function StudentFormsPage() {
  const { studentId } = useParams();
  const { user } = useAuth();
  const isStudent = user?.role === "student";

  const { data: formsData, loading: formsLoading, error } = useApi(
    () => formsApi.list(),
    `forms-${studentId}`,
  );
  const { data: submissionsData } = useApi(
    () => formsApi.submissions(studentId!),
    `submissions-${studentId}`,
  );

  if (formsLoading) return <Spinner className="py-12" />;
  if (error) return <ErrorText message={error} />;

  const forms = (formsData?.data ?? []).filter(
    (f) => (isStudent ? f.audience === "student" : true),
  );

  return (
    <div className="space-y-6">
      <PageTitle title="Formulários" subtitle="Questionários que geram o perfil de aprendizado." />

      <div className="grid gap-4 sm:grid-cols-2">
        {forms.map((form) => (
          <Card key={form.formId}>
            <CardBody className="flex h-full flex-col">
              <div className="mb-1 flex items-center gap-2">
                <h2 className="font-semibold text-text">{form.name}</h2>
                <StatusBadge tone="neutral" label={`v${form.version}`} />
              </div>
              {form.description && (
                <p className="text-sm text-text-muted">{form.description}</p>
              )}
              <p className="mt-1 text-sm text-text-muted">
                {form.audience === "student"
                  ? "Respondido pelo estudante"
                  : form.audience === "guardian"
                    ? "Respondido pelo responsável"
                    : "Respondido pelo educador"}{" "}
                · {form.sections.reduce((n, s) => n + s.questions.length, 0)} perguntas
              </p>
              <div className="mt-auto pt-4">
                <Link to={`/students/${studentId}/forms/${form.formId}`}>
                  <Button variant="secondary" size="sm" className="w-full justify-between">
                    Preencher
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Button>
                </Link>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardBody>
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-text">
            <ClipboardList className="size-5 text-primary" aria-hidden="true" />
            Histórico de respostas
          </h2>
          {submissionsData && submissionsData.data.length === 0 ? (
            <EmptyState
              title="Nenhuma resposta ainda"
              description="As respostas enviadas aparecerão aqui."
              className="py-8"
            />
          ) : (
            <ul className="space-y-3">
              {submissionsData?.data.map((s) => {
                const form = forms.find((f) => f.formId === s.formId);
                return (
                  <li key={s.submissionId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3">
                    <div>
                      <p className="font-medium text-text">{form?.name ?? s.formId}</p>
                      <p className="text-sm text-text-muted">
                        {formatDateTime(s.createdAt)} · por {s.submittedByRole}
                      </p>
                      {s.prediction && (
                        <p className="mt-1 text-sm text-primary">
                          Perfil: {s.prediction.label}
                        </p>
                      )}
                    </div>
                    {s.prediction && (
                      <StatusBadge tone="success" label="Predição gerada" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
