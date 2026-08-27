import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { useApi } from "../lib/useApi";
import { observationsApi } from "../api/endpoints";
import { ApiError } from "../api/client";
import type { ObservationCategory } from "../api/types";
import PageTitle from "../components/atoms/PageTitle";
import Card, { CardBody } from "../components/atoms/Card";
import Spinner from "../components/atoms/Spinner";
import ErrorText from "../components/atoms/ErrorText";
import EmptyState from "../components/atoms/EmptyState";
import Button from "../components/atoms/Button";
import Field from "../components/atoms/Field";
import Textarea from "../components/atoms/Textarea";
import StatusBadge from "../components/atoms/StatusBadge";
import { Activity, Plus, Trash2 } from "lucide-react";
import { CATEGORY_LABELS, formatDateTime } from "../lib/format";
import { toast } from "sonner";

const CATEGORY_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "primary"> = {
  academic: "primary",
  behavior: "warning",
  social: "neutral",
  emotional: "success",
  attention: "warning",
  other: "neutral",
};

export default function ObservationsPage() {
  const { studentId } = useParams();
  const { user } = useAuth();
  const canCreate = user?.role === "educator";
  const canDelete = user?.role === "educator" || user?.role === "admin";

  const { data, loading, error, reload } = useApi(
    () => observationsApi.list(studentId!),
    `obs-${studentId}`,
  );
  const [category, setCategory] = useState<ObservationCategory>("academic");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await observationsApi.create(studentId!, { category, text: text.trim() });
      toast.success("Observação registrada.");
      setText("");
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível registrar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(timestamp: string) {
    try {
      await observationsApi.remove(studentId!, timestamp);
      toast.success("Observação removida.");
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível remover.");
    }
  }

  if (loading) return <Spinner className="py-12" />;
  if (error) return <ErrorText message={error} />;
  const observations = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageTitle
        title="Observações"
        subtitle="Anotações qualitativas sobre o estudante, fora do perfil automatizado."
      />

      {canCreate && (
        <Card>
          <CardBody className="space-y-4">
            <h2 className="flex items-center gap-2 font-semibold text-text">
              <Plus className="size-5 text-primary" aria-hidden="true" />
              Nova observação
            </h2>
            <Field label="Categoria" htmlFor="obs-category">
              <select
                id="obs-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ObservationCategory)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text focus:outline-2 focus:outline-focus"
              >
                {(Object.keys(CATEGORY_LABELS) as ObservationCategory[]).map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </Field>
            <Field label="Descrição" htmlFor="obs-text" required>
              <Textarea id="obs-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <div className="flex justify-end">
              <Button onClick={() => void handleCreate()} disabled={saving || !text.trim()}>
                {saving ? "Salvando…" : "Registrar observação"}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {observations.length === 0 ? (
        <EmptyState
          icon={<Activity className="size-10" aria-hidden="true" />}
          title="Sem observações"
          description="Observações registradas aparecerão aqui."
        />
      ) : (
        <div className="space-y-3">
          {observations.map((obs) => (
            <Card key={obs.observationTimestamp}>
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={CATEGORY_TONE[obs.category] ?? "neutral"} label={CATEGORY_LABELS[obs.category] ?? obs.category} />
                      <span className="text-sm text-text-muted">{formatDateTime(obs.createdAt)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-text">{obs.text}</p>
                    <p className="mt-1 text-sm text-text-muted">por {obs.submittedBy}</p>
                  </div>
                  {canDelete && (
                    <Button size="sm" variant="danger" onClick={() => void handleDelete(obs.observationTimestamp)}>
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
