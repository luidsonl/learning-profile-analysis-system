import { useState } from "react";
import { CheckCircle2, KeyRound, ShieldCheck, Trash2, UserCheck, UserX } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { useApi } from "../lib/useApi";
import { adminApi } from "../api/endpoints";
import { ApiError } from "../api/client";
import type { AccountStatus, AdminUser } from "../api/types";
import PageTitle from "../components/atoms/PageTitle";
import Card, { CardBody } from "../components/atoms/Card";
import Spinner from "../components/atoms/Spinner";
import ErrorText from "../components/atoms/ErrorText";
import EmptyState from "../components/atoms/EmptyState";
import Button from "../components/atoms/Button";
import StatusBadge from "../components/atoms/StatusBadge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/atoms/Select";
import { Dialog, DialogTrigger, DialogContent, DialogDescription, DialogBody, DialogFooter } from "../components/atoms/Dialog";
import Input from "../components/atoms/Input";
import Field from "../components/atoms/Field";
import { formatDateTime, accountStatusLabel, BADGE_TONES, roleLabel } from "../lib/format";
import { toast } from "sonner";

const ALL_VALUE = "__all__";

const STATUS_OPTIONS: { value: AccountStatus | typeof ALL_VALUE; label: string }[] = [
  { value: ALL_VALUE, label: "Todas as situações" },
  { value: "pending", label: "Aguardando aprovação" },
  { value: "active", label: "Aprovados" },
  { value: "denied", label: "Negados" },
];

export default function AdminUsersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [roleFilter, setRoleFilter] = useState(ALL_VALUE);
  const [statusFilter, setStatusFilter] = useState(ALL_VALUE);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [passwordUser, setPasswordUser] = useState<AdminUser | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [deleteUserTarget, setDeleteUserTarget] = useState<AdminUser | null>(null);

  const { data, loading, error, reload } = useApi(
    () =>
      adminApi.listUsers({
        role: roleFilter === ALL_VALUE ? undefined : roleFilter,
        status: statusFilter === ALL_VALUE ? undefined : statusFilter,
      }),
    `admin-users-${roleFilter}-${statusFilter}`,
  );

  // Educators manage (approve/deny) responsable and student accounts only —
  // mirrored from GET /admin/users visibility on the backend.
  const visibleRoles: { value: string; label: string }[] = [
    { value: ALL_VALUE, label: "Todos os perfis" },
    ...(isAdmin
      ? [
          { value: "guardian", label: roleLabel("guardian") },
          { value: "educator", label: roleLabel("educator") },
          { value: "admin", label: roleLabel("admin") },
          { value: "student", label: roleLabel("student") },
        ]
      : [
          { value: "guardian", label: roleLabel("guardian") },
          { value: "student", label: roleLabel("student") },
        ]),
  ];

  const users = data?.data ?? [];

  const canChangeRole = (target: AdminUser) =>
    isAdmin &&
    target.userId !== user?.userId &&
    (target.role === "educator" || target.role === "admin");

  const run = async (fn: () => Promise<unknown>, successToast: string, targetId: string) => {
    setBusyUserId(targetId);
    try {
      await fn();
      toast.success(successToast);
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível concluir a ação.");
    } finally {
      setBusyUserId(null);
    }
  };

  const setStatus = (target: AdminUser, status: AccountStatus) =>
    run(
      () => adminApi.updateUser(target.userId, { status }),
      status === "active"
        ? `${target.name}: conta aprovada.`
        : `${target.name}: conta negada.`,
      target.userId,
    );

  const toggleRole = (target: AdminUser) => {
    const next = target.role === "admin" ? "educator" : "admin";
    run(
      () => adminApi.updateUser(target.userId, { role: next }),
      `${target.name}: perfil alterado para ${roleLabel(next).toLowerCase()}.`,
      target.userId,
    );
  };

  const resetPassword = () => {
    if (!passwordUser) return;
    const target = passwordUser;
    run(
      () => adminApi.resetPassword(target.userId, passwordInput),
      `Senha de ${target.name} redefinida.`,
      target.userId,
    );
    setPasswordUser(null);
    setPasswordInput("");
  };

  const deleteUser = () => {
    if (!deleteUserTarget) return;
    const target = deleteUserTarget;
    run(
      () => adminApi.deleteUser(target.userId),
      `Conta de ${target.name} excluída.`,
      target.userId,
    );
    setDeleteUserTarget(null);
  };

  return (
    <div className="space-y-6">
      <PageTitle
        title={isAdmin ? "Gestão de usuários" : "Aprovações"}
        subtitle={
          isAdmin
            ? "Aprove, negue, promova ou exclua contas deste ambiente."
            : "Aprove ou negue as contas de responsáveis e estudantes (sua ação é registrada em auditoria)."
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v)}>
          <SelectTrigger className="w-56" aria-label="Filtrar por perfil">
            <SelectValue placeholder="Todos os perfis" />
          </SelectTrigger>
          <SelectContent>
            {visibleRoles.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
          <SelectTrigger className="w-56" aria-label="Filtrar por situação">
            <SelectValue placeholder="Todas as situações" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && <Spinner className="py-12" />}
      {error && <ErrorText message={error} />}

      {!loading && !error && users.length === 0 && (
        <EmptyState
          icon={<UserCheck className="size-10" aria-hidden="true" />}
          title="Nenhuma conta encontrada"
          description="Ajuste os filtros ou volte mais tarde."
        />
      )}

      {!loading && !error && users.length > 0 && (
        <Card>
          <CardBody className="divide-y divide-border">
            {users.map((u) => (
              <div key={u.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium text-text">
                    <span className="truncate">{u.name}</span>
                    {u.userId === user?.userId && (
                      <span className="text-xs font-normal text-text-muted">(você)</span>
                    )}
                  </p>
                  <p className="truncate text-sm text-text-muted">{u.email}</p>
                  <p className="mt-0.5 text-xs text-text-muted">Desde {formatDateTime(u.createdAt)}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone="neutral" label={roleLabel(u.role)} />
                  <StatusBadge tone={BADGE_TONES[u.status] ?? "neutral"} label={accountStatusLabel(u.status)} />

                  <div className="flex flex-wrap items-center gap-1.5">
                    {u.status === "pending" && (
                      <>
                        <Button size="sm" onClick={() => setStatus(u, "active")} disabled={busyUserId === u.userId}>
                          <UserCheck className="size-4" aria-hidden="true" />
                          Aprovar
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setStatus(u, "denied")} disabled={busyUserId === u.userId}>
                          <UserX className="size-4" aria-hidden="true" />
                          Negar
                        </Button>
                      </>
                    )}
                    {u.status === "denied" && (
                      <Button size="sm" onClick={() => setStatus(u, "active")} disabled={busyUserId === u.userId}>
                        <CheckCircle2 className="size-4" aria-hidden="true" />
                        Reativar
                      </Button>
                    )}
                    {canChangeRole(u) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => toggleRole(u)}
                        disabled={busyUserId === u.userId}
                        title={
                          u.role === "admin"
                            ? "Rebaixar para educador"
                            : "Promover a administrador"
                        }
                      >
                        <ShieldCheck className="size-4" aria-hidden="true" />
                        {u.role === "admin" ? "Rebaixar" : "Promover"}
                      </Button>
                    )}
                    {isAdmin && (
                      <>
                        <Dialog open={passwordUser?.userId === u.userId} onOpenChange={(open) => !open && setPasswordUser(null)}>
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setPasswordInput("");
                                setPasswordUser(u);
                              }}
                              disabled={busyUserId === u.userId}
                            >
                              <KeyRound className="size-4" aria-hidden="true" />
                              Senha
                            </Button>
                          </DialogTrigger>
                          <DialogContent title={`Redefinir senha — ${u.name}`}>
                            <DialogBody>
                              <DialogDescription>
                                Crie uma senha provisória para {u.email}. O usuário deve trocá-la no
                                próximo acesso.
                              </DialogDescription>
                              <Field label="Nova senha" htmlFor="new-password" hint="Mínimo de 8 caracteres." required>
                                <Input
                                  id="new-password"
                                  type="password"
                                  autoComplete="new-password"
                                  minLength={8}
                                  value={passwordInput}
                                  onChange={(e) => setPasswordInput(e.target.value)}
                                  required
                                />
                              </Field>
                            </DialogBody>
                            <DialogFooter>
                              <Button variant="secondary" onClick={() => setPasswordUser(null)}>
                                Cancelar
                              </Button>
                              <Button onClick={resetPassword} disabled={passwordInput.length < 8}>
                                Redefinir senha
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>

                        <Dialog open={deleteUserTarget?.userId === u.userId} onOpenChange={(open) => !open && setDeleteUserTarget(null)}>
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => setDeleteUserTarget(u)}
                              disabled={busyUserId === u.userId || u.userId === user?.userId}
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                              Excluir
                            </Button>
                          </DialogTrigger>
                          <DialogContent title={`Excluir conta — ${u.name}`}>
                            <DialogBody>
                              <DialogDescription>
                                A conta de {u.email} e seus vínculos (responsabilidades,
                                acompanhamentos, sessões) serão removidos. O cadastro do estudante,
                                se houver, permanece.
                              </DialogDescription>
                            </DialogBody>
                            <DialogFooter>
                              <Button variant="secondary" onClick={() => setDeleteUserTarget(null)}>
                                Cancelar
                              </Button>
                              <Button variant="danger" onClick={deleteUser}>
                                Excluir conta
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}