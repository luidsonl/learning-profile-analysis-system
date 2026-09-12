import { Role, UserStatus } from '../api/types';

export const ROLE_LABELS: Record<Role, string> = {
  guardian: 'Responsável',
  educator: 'Educador(a)',
  student: 'Estudante',
  admin: 'Administrador',
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  pending: 'Pendente',
  active: 'Ativo(a)',
  denied: 'Banido',
};