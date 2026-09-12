import { HttpErrorResponse } from '@angular/common/http';

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiEnvelope {
  error: ApiError;
}

interface LocalizedError {
  code: string;
  pt: string;
}

const PT_BY_CODE: Record<string, string> = {
  validation_failed: 'Verifique os campos preenchidos.',
  unauthorized: 'Sua sessão expirou. Entre novamente.',
  forbidden: 'Você não tem permissão para esta ação.',
  pending_approval: 'Sua conta está aguardando aprovação.',
  account_denied: 'Acesso negado pela instituição.',
  not_found: 'Não encontrado.',
  conflict: 'Já existe uma conta com este e-mail.',
  internal_error: 'Erro no servidor. Tente novamente.',
  // Admin/user-management codes (see sam-app/src/api/handlers/admin.mjs)
  last_admin: 'Não é possível modificar ou remover o último administrador ativo.',
  cannot_delete_self: 'Você não pode excluir a própria conta.',
  cannot_demote_self: 'Você não pode rebaixar o próprio perfil.',
  user_not_found: 'Usuário não encontrado.',
  weak_password: 'A senha deve ter ao menos 8 caracteres.',
  no_changes: 'Nenhuma alteração informada.',
  email_in_use: 'Já existe uma conta com este e-mail.',
};

// Maps the API's uniform error envelope
// ({ "error": { "code", "message" } } — see backend.md Conventions)
// to a pt-BR user message. Never shows raw API text to end users.
export function readApiError(err: unknown, fallback = 'Algo deu errado. Tente novamente.'): LocalizedError {
  if (err instanceof HttpErrorResponse && isApiEnvelope(err.error)) {
    return {
      code: err.error.error.code,
      pt: PT_BY_CODE[err.error.error.code] ?? fallback,
    };
  }
  return { code: 'unknown', pt: fallback };
}

function isApiEnvelope(value: unknown): value is ApiEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'object' &&
    (value as { error: unknown }).error !== null &&
    'code' in (value as { error: Record<string, unknown> }).error
  );
}