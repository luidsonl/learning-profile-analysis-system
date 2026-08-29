import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { useApi } from "../lib/useApi";
import { studentsApi, adminApi } from "../api/endpoints";
import { ApiError } from "../api/client";
import PageTitle from "../components/atoms/PageTitle";
import Card, { CardBody } from "../components/atoms/Card";
import Spinner from "../components/atoms/Spinner";
import ErrorText from "../components/atoms/ErrorText";
import Button from "../components/atoms/Button";
import StatusBadge from "../components/atoms/StatusBadge";
import EmptyState from "../components/atoms/EmptyState";
import Input from "../components/atoms/Input";
import Field from "../components/atoms/Field";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/atoms/Select";
import { Dialog, DialogContent, DialogDescription, DialogBody, DialogFooter } from "../components/atoms/Dialog";
import { formatDate, formatAge, roleLabel } from "../lib/format";
import { toast } from "sonner";

export default function StudentOverviewPage() {
  const { studentId } = useParams();
  const { user } = useAuth();
  const role = user?.role;

  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [guardianCandidateId, setGuardianCandidateId] = useState("");

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
  const canAssignGuardian = role === "educator" || role === "admin";
  const { data: guardianCandidatesData } = useApi(
    () => (canAssignGuardian ? adminApi.listUsers({ role: "guardian", status: "active" }) : Promise.resolve({ data: [], count: 0 })),
    `guardian-candidates-${studentId}`,
  );

  const reloadAll = () => {
    void reload();
    void reloadConsent();
    void reloadGuardians();
  };

  // Per-action permissions (specs/auth.md + backend RBAC matrix):
  const canInteract = role === "guardian" || role === "educator" || role === "admin";
  const canSetConsent = role === "guardian" || role === "educator" || role === "admin";
  const canCreateStudentAccount = role === "educator" || role === "admin";

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
      await studentsApi.createStudentAccount(studentId!, {
        email: accountEmail.trim(),
        name: studentData.student.name,
        password: accountPassword,
      });
      toast.success("Conta de estudante criada. E-mail de acesso: " + accountEmail.trim());
      setAccountDialogOpen(false);
      setAccountEmail("");
      setAccountPassword("");
      reloadAll();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível criar a conta do estudante.");
    } finally {
      setCreatingAccount(false);
    }
  }

  const guardianCandidates = (guardianCandidatesData?.data ?? []).filter(
    (g) => !guardiansData?.data.some((existing) => existing.userId === g.userId),
  );

  async function handleGrantGuardian() {
    if (!guardianCandidateId) return;
    try {
      await studentsApi.grantGuardian(studentId!, { userId: guardianCandidateId, relation: "guardian" });
      toast.success("Responsável atribuído a este estudante.");
      setGuardianCandidateId("");
      reloadAll();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível atribuir o responsável.");
    }
  }

  async function handleRevokeGuardian(userId: string, name: string) {
    try {
      await studentsApi.revokeGuardian(studentId!, userId);
      toast.success(`${name} deixou de ser responsável.`);
      reloadAll();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível remover o responsável.");
    }
  }

  if (loading) return <Spinner className="py-12" />;
  if (error) return <ErrorText message={error} />;
  const student = studentData?.student;
  if (!student) return null;

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
            {consentData?.current.status === "active" && canSetConsent && (
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

        {canInteract && (
          <Card>
            <CardBody>
              <h2 className="mb-2 font-semibold text-text">Responsáveis</h2>
              {guardiansData && guardiansData.data.length === 0 ? (
                <EmptyState title="Sem responsáveis" className="py-6" />
              ) : (
                <ul className="space-y-2 text-sm">
                  {guardiansData?.data.map((g) => (
                    <li key={g.userId} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-text">{g.name}</span>
                        <span className="text-text-muted">{g.relation ?? "—"}</span>
                      </span>
                      {canAssignGuardian && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRevokeGuardian(g.userId, g.name)}
                        >
                          Remover
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canAssignGuardian && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Select value={guardianCandidateId} onValueChange={setGuardianCandidateId}>
                    <SelectTrigger className="w-64" aria-label="Atribuir um responsável">
                      <SelectValue placeholder="Atribuir responsável…" />
                    </SelectTrigger>
                    <SelectContent>
                      {guardianCandidates.length === 0 ? (
                        <SelectItem value="__none__" disabled>
                          Nenhum responsável disponível
                        </SelectItem>
                      ) : (
                        guardianCandidates.map((g) => (
                          <SelectItem key={g.userId} value={g.userId}>
                            {g.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleGrantGuardian} disabled={!guardianCandidateId}>
                    Atribuir
                  </Button>
                </div>
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

      {canInteract && (
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/students/${studentId}/forms/vark`}>
            <Button>Aplicar questionário VARK</Button>
          </Link>
          {canCreateStudentAccount && !student.studentUserId && (
            <Button
              variant="secondary"
              onClick={() => {
                setAccountEmail("");
                setAccountPassword("");
                setAccountDialogOpen(true);
              }}
            >
              Criar acesso do estudante
            </Button>
          )}
        </div>
      )}

      <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <DialogContent title={`Criar acesso de ${student.name}`}>
          <DialogBody>
            <DialogDescription>
              Cria uma conta de estudante (login próprio). Exige consentimento ativo e só pode ser
              feita por um educador ou administrador.
            </DialogDescription>
            <Field label="E-mail de acesso" htmlFor="account-email" required>
              <Input
                id="account-email"
                type="email"
                autoComplete="off"
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Senha provisória" htmlFor="account-password" hint="Mínimo de 8 caracteres." required>
              <Input
                id="account-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={accountPassword}
                onChange={(e) => setAccountPassword(e.target.value)}
                required
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAccountDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateStudentAccount}
              disabled={creatingAccount || accountEmail.trim().length === 0 || accountPassword.length < 8}
            >
              {creatingAccount ? "Criando…" : "Criar conta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
