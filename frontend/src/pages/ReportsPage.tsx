import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { useApi } from "../lib/useApi";
import { reportsApi } from "../api/endpoints";
import { ApiError } from "../api/client";
import PageTitle from "../components/atoms/PageTitle";
import Card, { CardBody } from "../components/atoms/Card";
import Spinner from "../components/atoms/Spinner";
import ErrorText from "../components/atoms/ErrorText";
import EmptyState from "../components/atoms/EmptyState";
import Button from "../components/atoms/Button";
import StatusBadge from "../components/atoms/StatusBadge";
import { FileText, Download, RefreshCw, Trash2, Loader2 } from "lucide-react";
import { formatDateTime } from "../lib/format";
import { toast } from "sonner";

const REPORT_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  queued: "warning",
  generating: "warning",
  generated: "success",
  failed: "danger",
};

export default function ReportsPage() {
  const { studentId } = useParams();
  const { user } = useAuth();
  const isEducator = user?.role === "educator" || user?.role === "admin";
  const { data, loading, error, reload } = useApi(
    () => reportsApi.list(studentId!),
    `reports-${studentId}`,
  );
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await reportsApi.generate(studentId!);
      toast.success("Relatório em geração. Aguarde alguns instantes.");
      void reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível gerar o relatório.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload(reportId: string) {
    setDownloading(reportId);
    try {
      const res = await reportsApi.download(reportId);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível baixar o relatório.");
    } finally {
      setDownloading(null);
    }
  }

  async function handleDelete(reportId: string) {
    try {
      await reportsApi.remove(reportId);
      toast.success("Relatório removido.");
      void reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível remover.");
    }
  }

  const hasQueued = (data?.data ?? []).some((r) => r.status !== "generated");

  if (loading) return <Spinner className="py-12" />;
  if (error) return <ErrorText message={error} />;
  const reports = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageTitle
        title="Relatórios"
        subtitle="Documentos gerados com o perfil de aprendizado do estudante."
        actions={
          isEducator ? (
            <div className="flex items-center gap-2">
              <Button onClick={() => void handleGenerate()} disabled={generating}>
                {generating ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="size-4" aria-hidden="true" />
                )}
                {generating ? "Gerando…" : "Gerar relatório"}
              </Button>
            </div>
          ) : undefined
        }
      />

      {hasQueued && (
        <p className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
          Há relatórios em geração. Atualize a página para ver o resultado.
        </p>
      )}

      {reports.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-10" aria-hidden="true" />}
          title="Sem relatórios"
          description={
            isEducator
              ? "Gere um relatório com o perfil de aprendizado do estudante."
              : "Relatórios gerados aparecerão aqui para download."
          }
        />
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <Card key={r.reportId}>
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-text">
                    Relatório de {r.kind === "profile" ? "perfil de aprendizado" : r.kind}
                  </p>
                  <p className="text-sm text-text-muted">
                    {formatDateTime(r.createdAt)} · solicitado por {r.requestedBy}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={REPORT_TONE[r.status] ?? "neutral"} label={r.status} />
                  {r.status === "generated" && (
                    <Button size="sm" variant="secondary" onClick={() => void handleDownload(r.reportId)} disabled={downloading === r.reportId}>
                      <Download className="size-4" aria-hidden="true" />
                      {downloading === r.reportId ? "…" : "Baixar"}
                    </Button>
                  )}
                  {isEducator && (
                    <Button size="sm" variant="danger" onClick={() => void handleDelete(r.reportId)}>
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
