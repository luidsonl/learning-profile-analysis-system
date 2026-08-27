import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { useApi } from "../lib/useApi";
import { recommendationsApi } from "../api/endpoints";
import { ApiError } from "../api/client";
import type { Recommendation } from "../api/types";
import PageTitle from "../components/atoms/PageTitle";
import Card, { CardBody } from "../components/atoms/Card";
import Spinner from "../components/atoms/Spinner";
import ErrorText from "../components/atoms/ErrorText";
import EmptyState from "../components/atoms/EmptyState";
import Button from "../components/atoms/Button";
import StatusBadge from "../components/atoms/StatusBadge";
import Field from "../components/atoms/Field";
import Textarea from "../components/atoms/Textarea";
import Input from "../components/atoms/Input";
import { Lightbulb, Plus, X } from "lucide-react";
import { formatDateTime } from "../lib/format";
import { toast } from "sonner";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "primary"> = {
  proposed: "warning",
  approved: "success",
  rejected: "danger",
  published: "success",
};

const STATUS_LABEL: Record<string, string> = {
  proposed: "Proposta",
  approved: "Aprovada",
  rejected: "Recusada",
  published: "Publicada",
};

export default function RecommendationsPage() {
  const { studentId } = useParams();
  const { user } = useAuth();
  const isEducator = user?.role === "educator" || user?.role === "admin";
  const { data, loading, error, reload } = useApi(
    () => recommendationsApi.list(studentId!),
    `recos-${studentId}`,
  );

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [patchId, setPatchId] = useState<string | null>(null);

  if (loading) return <Spinner className="py-12" />;
  if (error) return <ErrorText message={error} />;

  async function handleCreate() {
    if (!title.trim() || !text.trim()) return;
    setSaving(true);
    try {
      await recommendationsApi.create(studentId!, {
        title: title.trim(),
        text: text.trim(),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      toast.success("Recomendação criada.");
      setTitle("");
      setText("");
      setTags("");
      setShowForm(false);
      void reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível criar.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePatch(reco: Recommendation, patch: { status?: string; visibility?: string }) {
    setPatchId(reco.recoId);
    try {
      await recommendationsApi.update(studentId!, reco.recoId, patch);
      void reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível atualizar.");
    } finally {
      setPatchId(null);
    }
  }

  async function handleDelete(reco: Recommendation) {
    try {
      await recommendationsApi.remove(studentId!, reco.recoId);
      toast.success("Recomendação removida.");
      void reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível remover.");
    }
  }

  const visible = (data?.data ?? []).filter(
    (r) => user?.role === "student" ? r.visibility === "published" : true,
  );

  return (
    <div className="space-y-6">
      <PageTitle
        title="Recomendações"
        subtitle="Sugestões práticas para apoiar o aprendizado."
        actions={
          isEducator ? (
            <Button onClick={() => setShowForm((s) => !s)}>
              <Plus className="size-4" aria-hidden="true" />
              Nova recomendação
            </Button>
          ) : undefined
        }
      />

      {showForm && isEducator && (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-text">Nova recomendação</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-text-muted hover:text-text"
                aria-label="Fechar"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <Field label="Título" htmlFor="reco-title" required>
              <Input id="reco-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Descrição" htmlFor="reco-text" required>
              <Textarea id="reco-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <Field label="Etiquetas" htmlFor="reco-tags" hint="Separe por vírgula.">
              <Input id="reco-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={() => void handleCreate()} disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={<Lightbulb className="size-10" aria-hidden="true" />}
          title="Sem recomendações"
          description={
            isEducator
              ? "Crie a primeira recomendação para apoiar este estudante."
              : "Recomendações publicadas aparecerão aqui."
          }
        />
      ) : (
        <div className="space-y-4">
          {visible.map((reco) => (
            <Card key={reco.recoId}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-text">{reco.title}</h3>
                      <StatusBadge tone={STATUS_TONE[reco.status] ?? "neutral"} label={STATUS_LABEL[reco.status] ?? reco.status} />
                      {reco.visibility === "published" && (
                        <StatusBadge tone="primary" label="Publicada" />
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-line text-text">{reco.text}</p>
                    {reco.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {reco.tags.map((t) => (
                          <span key={t} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-sm text-text-muted">
                      por {reco.createdBy} · {formatDateTime(reco.createdAt)}
                    </p>
                  </div>
                  {isEducator && (
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => handlePatch(reco, { status: "approved" })} disabled={patchId === reco.recoId || reco.status === "approved"}>
                        Aprovar
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => handlePatch(reco, { status: "published", visibility: "published" })} disabled={patchId === reco.recoId || reco.status === "published"}>
                        Publicar
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void handleDelete(reco)}>
                        Remover
                      </Button>
                    </div>
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
