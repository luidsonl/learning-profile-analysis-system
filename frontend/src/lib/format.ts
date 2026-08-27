// Formatting + domain label helpers for the Learning Profile UI.

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatAge(birthDate?: string | null): string {
  if (!birthDate) return "—";
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return `${age} anos`;
}

export const VARK_LABELS: Record<string, string> = {
  V: "Visual",
  A: "Auditivo",
  R: "Leitura e escrita",
  K: "Cinestésico",
};

export function varkDimensionName(key: string): string {
  return VARK_LABELS[key] ?? key;
}

export function varkLabelName(label?: string | null): string {
  if (!label) return "Perfil ainda não calculado";
  if (label === "multimodal") return "Multimodal";
  return VARK_LABELS[label] ?? label;
}

export const CATEGORY_LABELS: Record<string, string> = {
  academic: "Acadêmico",
  behavior: "Comportamento",
  social: "Social",
  emotional: "Emocional",
  attention: "Atenção",
  other: "Outro",
};

export const BADGE_TONES: Record<string, "success" | "warning" | "danger" | "neutral" | "primary"> = {
  active: "success",
  not_granted: "warning",
  revoked: "danger",
  queued: "warning",
  generated: "success",
  failed: "danger",
  approved: "success",
  published: "success",
  proposed: "warning",
  rejected: "danger",
};

export function roleLabel(role?: string | null): string {
  switch (role) {
    case "guardian":
      return "Responsável";
    case "educator":
      return "Educador";
    case "student":
      return "Estudante";
    case "admin":
      return "Administrador";
    default:
      return role ?? "—";
  }
}
