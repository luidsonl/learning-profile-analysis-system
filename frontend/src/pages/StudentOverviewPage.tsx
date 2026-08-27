import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { useApi } from "../lib/useApi";
import { studentsApi } from "../api/endpoints";
import { ApiError } from "../api/client";
import PageTitle from "../components/atoms/PageTitle";
import Card, { CardBody } from "../components/atoms/Card";
import Spinner from "../components/atoms/Spinner";
import ErrorText from "../components/atoms/ErrorText";
import Button from "../components/atoms/Button";
import StatusBadge from "../components/atoms/StatusBadge";
import EmptyState from "../components/atoms/EmptyState";
import { formatDate, formatAge, roleLabel } from "../lib/format";
import { toast } from "sonner";

export default function StudentOverviewPage() {
  const { studentId } = useParams();
  const { user } = useAuth();
  const [creatingAccount, setCreatingAccount] = useState(false);

  const { data: studentData, loading, error, reload } = useApi(
    () => studentsApi.get(studentId!),
    studentId ?? "none",
  );
  const { data: consentData, reload: reloadConsent } = useApi(
    () => studentsApi.consent(studentId!),
    `consent-${studentId}`,
  );
  const { data: guardiansData, reload: reloadGuardians } = useApi(
    () => studentsApi.guardians(studentId!),
    `guardians-${studentId}`,
  );
  const { data: educatorsData } = useApi(
    () => studentsApi.educators(studentId!),
    `educators-${studentId}`,
  );

  const reloadAll = () => {
    void reload();
    void reloadConsent();
    void reloadGuardians();
  };

  async function handleRevokeConsent() {
    try {
      await studentsApi.setConsent(studentId!, {
        consentVersion: consentData?.current.version ?? "v1",
        status: "revoked",
      });
      toast.success("Consentimento revogado.");
      reloadAll();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível atualizar o consentimento.");
    }
  }


  async function handleCreateStudentAccount() {
    if (!studentData) return;
    setCreatingAccount(true);
    try {
      const email = `${studentData.student.name.split(" ")[0].toLowerCase()}.estudante@exemplo.test`;
      await studentsApi.createStudentAccount(studentId!, {
        email,
        name: studentData.student.name,
        password: "Mudar123!",
      });
      toast.success("Conta de estudante criada. E-mail de acesso: " + email);
      reloadAll();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível criar a conta do estudante.");
    } finally {
      setCreatingAccount(false);
    }
  }

  if (loading) return <Spinner className="py-12" />;
  if (error) return <ErrorText message={error} />;
  const student = studentData?.student;
  if (!student) return null;

  const canManageStudents = user?.role === "guardian" || user?.role === "educator";

  return (
    <div className="space-y-6">
      <PageTitle
        title={student.name}
        subtitle={`${formatAge(student.birthDate)} · Criado em ${formatDate(student.createdAt)}`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="mb-3 font-semibold text-text">Dados do estudante</h2>
            <dl className="space-y-2 text-sm">
              {[
                ["Gênero", student.gender ?? "—"],
                ["Série/Ano", student.grade ?? "—"],
                ["Escola", student.school ?? "—"],
                ["Necessidades específicas", student.specialNeeds?.join(", ") ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-text-muted">{k}</dt>
                  <dd className="text-right font-medium text-text">{v}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-text">Consentimento LGPD</h2>
              {consentData && (
                <StatusBadge
                  tone={
                    consentData.current.status === "active"
                      ? "success"
                      : consentData.current.status === "revoked"
                        ? "danger"
                        : "warning"
                  }
                  label={
                    consentData.current.status === "active"
                      ? "Ativo"
                      : consentData.current.status === "revoked"
                        ? "Revogado"
                        : "Não concedido"
                  }
                />
              )}
            </div>
            {consentData?.current.consentBy ? (
              <dl className="space-y-2 text-sm">
                {[
                  ["Versão", consentData.current.version ?? "—"],
                  ["Concedido por", consentData.current.consentBy],
                  ["Papel", roleLabel(consentData.current.grantedByRole)],
                  ["Em", formatDate(consentData.current.consentAt)],
                  ["Base legal", consentData.current.legalBasis ?? "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-text-muted">{k}</dt>
                    <dd className="text-right font-medium text-text">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-text-muted">Consentimento ainda não registrado.</p>
            )}
            {consentData?.current.status === "active" && canManageStudents && (
              <Button
                variant="danger"
                size="sm"
                className="mt-4"
                onClick={handleRevokeConsent}
              >
                Revogar consentimento
              </Button>
            )}
          </CardBody>
        </Card>

        {canManageStudents && (
          <Card>
            <CardBody>
              <h2 className="mb-2 font-semibold text-text">Responsáveis</h2>
              {guardiansData && guardiansData.data.length === 0 ? (
                <EmptyState title="Sem responsáveis" className="py-6" />
              ) : (
                <ul className="space-y-2 text-sm">
                  {guardiansData?.data.map((g) => (
                    <li key={g.userId} className="flex justify-between gap-2">
                      <span className="text-text">{g.name}</span>
                      <span className="text-text-muted">{g.relation ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        )}

        {user?.role === "admin" && (
          <Card>
            <CardBody>
              <h2 className="mb-2 font-semibold text-text">Educadores que acompanham</h2>
              {educatorsData && educatorsData.data.length === 0 ? (
                <EmptyState title="Sem educadores" className="py-6" />
              ) : (
                <ul className="space-y-1 text-sm">
                  {educatorsData?.data.map((e) => (
                    <li key={e.userId} className="text-text">
                      {e.name}{" "}
                      <span className="text-text-muted">
                        desde {formatDate(e.followedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        )}
      </div>

      {canManageStudents && (
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/students/${studentId}/forms/vark`}>
            <Button>Aplicar questionário VARK</Button>
          </Link>
          {!student.studentUserId && (
            <Button variant="secondary" onClick={handleCreateStudentAccount} disabled={creatingAccount}>
              {creatingAccount ? "Criando…" : "Criar acesso do estudante"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
