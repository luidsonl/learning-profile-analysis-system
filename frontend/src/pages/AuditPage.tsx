import { useParams } from "react-router-dom";
import { useApi } from "../lib/useApi";
import { auditApi } from "../api/endpoints";
import PageTitle from "../components/atoms/PageTitle";
import Card, { CardBody } from "../components/atoms/Card";
import Spinner from "../components/atoms/Spinner";
import ErrorText from "../components/atoms/ErrorText";
import EmptyState from "../components/atoms/EmptyState";
import { ShieldCheck } from "lucide-react";
import { formatDateTime, roleLabel } from "../lib/format";

export default function AuditPage() {
  const { studentId } = useParams();
  const { data, loading, error } = useApi(
    () => auditApi.student(studentId!),
    `audit-${studentId}`,
  );

  if (loading) return <Spinner className="py-12" />;
  if (error) return <ErrorText message={error} />;
  const events = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageTitle
        title="Auditoria"
        subtitle="Registro de acesso e alterações nos dados deste estudante."
      />
      <Card>
        <CardBody>
          {events.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="size-10" aria-hidden="true" />}
              title="Sem eventos"
              description="As ações neste estudante aparecerão aqui."
            />
          ) : (
            <ul className="divide-y divide-border">
              {events.map((ev, i) => (
                <li key={i} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="flex-1">
                    <p className="font-medium text-text">{ev.action ?? "Ação"}</p>
                    <p className="text-sm text-text-muted">{ev.resource ?? "—"}</p>
                  </div>
                  <div className="text-right text-sm text-text-muted">
                    <p>{ev.actorId ?? "Sistema"}</p>
                    <p>{roleLabel(ev.actorRole)}</p>
                    <p>{formatDateTime(ev.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
