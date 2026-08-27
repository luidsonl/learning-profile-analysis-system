import { useParams } from "react-router-dom";
import { useApi } from "../lib/useApi";
import { predictionApi, studentsApi } from "../api/endpoints";
import PageTitle from "../components/atoms/PageTitle";
import Card, { CardBody } from "../components/atoms/Card";
import Spinner from "../components/atoms/Spinner";
import ErrorText from "../components/atoms/ErrorText";
import EmptyState from "../components/atoms/EmptyState";
import ProfileBars from "../components/molecules/ProfileBars";
import StatusBadge from "../components/atoms/StatusBadge";
import { Lightbulb, LineChart } from "lucide-react";
import { formatDateTime } from "../lib/format";

export default function ProfileViewPage() {
  const { studentId } = useParams();

  const { data: studentData, loading: studentLoading } = useApi(
    () => studentsApi.get(studentId!),
    `student-profile-${studentId}`,
  );
  const { data: predictionsData, loading: predLoading, error } = useApi(
    () => predictionApi.predictions(studentId!),
    `predictions-${studentId}`,
  );
  const { data: assessmentsData } = useApi(
    () => predictionApi.assessments(studentId!),
    `assessments-${studentId}`,
  );

  if (studentLoading || predLoading) return <Spinner className="py-12" />;
  if (error) return <ErrorText message={error} />;

  const latestPrediction = predictionsData?.data[0] ?? null;
  const latestAssessment = assessmentsData?.data[0] ?? null;
  const scores = latestAssessment?.scores ?? studentData?.student.varkScores ?? null;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Perfil de aprendizado"
        subtitle="Como esta pessoa prefere aprender (VARK)."
      />

      {latestPrediction && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-text-muted">Perfil predominante</p>
              <p className="text-3xl font-bold text-primary">
                {latestPrediction.label === "multimodal" ? "Multimodal" : latestPrediction.label}
              </p>
              {latestPrediction.confidence != null && (
                <p className="mt-1 text-sm text-text-muted">
                  Confiança: {Math.round(latestPrediction.confidence * 100)}%
                </p>
              )}
            </div>
            <div className="text-right text-sm text-text-muted">
              <p>Modelo: {latestPrediction.model}</p>
              <p>Versão: {latestPrediction.modelVersion}</p>
              <p>Em: {formatDateTime(latestPrediction.createdAt)}</p>
            </div>
          </CardBody>
        </Card>
      )}

      {scores ? (
        <Card>
          <CardBody>
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-text">
              <LineChart className="size-5 text-primary" aria-hidden="true" />
              Pontuações por modalidade
            </h2>
            <ProfileBars scores={scores} />
          </CardBody>
        </Card>
      ) : (
        <EmptyState
          icon={<Lightbulb className="size-10" aria-hidden="true" />}
          title="Perfil ainda não calculado"
          description="Preencha o questionário VARK para gerar o perfil de aprendizado."
        />
      )}

      {latestPrediction && (
        <Card>
          <CardBody>
            <h2 className="mb-3 font-semibold text-text">Predições recentes</h2>
            <ul className="space-y-3">
              {predictionsData?.data.slice(0, 5).map((p) => (
                <li
                  key={p.predictionId}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-text">
                      {p.label === "multimodal" ? "Multimodal" : p.label}
                    </p>
                    <p className="text-sm text-text-muted">{formatDateTime(p.createdAt)}</p>
                  </div>
                  <StatusBadge tone="primary" label={`v${p.modelVersion}`} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
