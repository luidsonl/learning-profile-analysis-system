import { Link } from "react-router-dom";
import { ArrowRight, UserPlus, Users } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { useApi } from "../lib/useApi";
import { studentsApi } from "../api/endpoints";
import PageTitle from "../components/atoms/PageTitle";
import Card, { CardBody } from "../components/atoms/Card";
import Spinner from "../components/atoms/Spinner";
import ErrorText from "../components/atoms/ErrorText";
import EmptyState from "../components/atoms/EmptyState";
import Button from "../components/atoms/Button";
import StatusBadge from "../components/atoms/StatusBadge";
import { formatDate, formatAge } from "../lib/format";
import { BADGE_TONES } from "../lib/format";

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, loading, error } = useApi(() => studentsApi.list(), "students-list");

  const canManage = user?.role === "educator" || user?.role === "admin";

  return (
    <div>
      <PageTitle
        title="Estudantes"
        subtitle={
          user?.role === "guardian"
            ? "Seus filhos e estudantes sob sua responsabilidade."
            : user?.role === "admin"
              ? "Todos os estudantes deste ambiente."
              : "Estudantes que você acompanha."
        }
        actions={
          canManage && (
            <Link to="/students/new">
              <Button>
                <UserPlus className="size-4" aria-hidden="true" />
                Adicionar estudante
              </Button>
            </Link>
          )
        }
      />

      {loading && <Spinner className="py-12" />}
      {error && <ErrorText message={error} className="mb-4" />}

      {data && data.data.length === 0 && (
        <EmptyState
          icon={<Users className="size-10" aria-hidden="true" />}
          title="Nenhum estudante ainda"
          description={
            user?.role === "guardian"
              ? "Assim que um responsável legal ou educador vincular um estudante à sua conta, ele aparecerá aqui."
              : "Adicione um estudante para começar a avaliar o perfil de aprendizado."
          }
          action={
            canManage && (
              <Link to="/students/new">
                <Button>
                  <UserPlus className="size-4" aria-hidden="true" />
                  Adicionar estudante
                </Button>
              </Link>
            )
          }
        />
      )}

      {data && data.data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.data.map((student) => (
            <Link key={student.studentId} to={`/students/${student.studentId}`} className="group">
              <Card className="h-full transition-shadow group-hover:shadow-card-hover">
                <CardBody className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-text">{student.name}</h2>
                    <StatusBadge
                      tone={BADGE_TONES[student.consentStatus ?? ""] ?? "neutral"}
                      label={
                        student.consentStatus === "active"
                          ? "Consentimento"
                          : student.consentStatus === "revoked"
                            ? "Revogado"
                            : "Sem consentimento"
                      }
                    />
                  </div>
                  <p className="mt-1 text-sm text-text-muted">
                    {formatAge(student.birthDate)} · {student.grade || "Série não informada"}
                  </p>
                  {student.varkLabel && (
                    <p className="mt-2 text-sm text-primary">Perfil: {student.varkLabel}</p>
                  )}
                  <div className="mt-auto flex items-center gap-1 pt-4 text-sm text-text-muted">
                    Criado em {formatDate(student.createdAt)}
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
