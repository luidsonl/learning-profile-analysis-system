import { useAuth } from "../auth/useAuth";
import PageTitle from "../components/atoms/PageTitle";
import Card, { CardBody } from "../components/atoms/Card";
import { roleLabel, formatDateTime } from "../lib/format";

export default function MePage() {
  const { user } = useAuth();

  if (!user) return null;

  const rows: { label: string; value: string }[] = [
    { label: "Nome", value: user.name },
    { label: "E-mail", value: user.email },
    { label: "Perfil", value: roleLabel(user.role) },
    { label: "Conta criada em", value: formatDateTime(user.createdAt) },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Minha conta" subtitle="Seus dados de acesso e informações LGPD." />
      <Card>
        <CardBody className="divide-y divide-border">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4 py-3">
              <span className="text-text-muted">{row.label}</span>
              <span className="text-right font-medium text-text">{row.value}</span>
            </div>
          ))}
        </CardBody>
      </Card>
      <p className="mt-4 text-sm text-text-muted">
        Para corrigir seus dados, solicitar exportação ou exclusão da conta, contate o encarregado
        de proteção de dados:{" "}
        <a href="mailto:encarregado@instituicao.edu.br" className="text-primary hover:underline">
          encarregado@instituicao.edu.br
        </a>
      </p>
    </div>
  );
}
