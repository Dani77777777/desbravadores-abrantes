/**
 * Rótulos legíveis em português para os enums internos do VanaCamp.
 * Os valores guardados na base de dados continuam em inglês (status, modos,
 * causas); estes mapas servem apenas para apresentação na UI.
 */

import type {
  VanaCampSessionStatus,
  VanaCampChatMode,
  VanaCampMayorMode,
  VanaCampRoleAssignmentMode,
} from '@/types/vana-camp'

/** Estado / fase da sessão. */
export const STATUS_LABEL: Record<VanaCampSessionStatus, string> = {
  lobby: 'No lobby',
  role_preview: 'A preparar papéis',
  role_reveal: 'A revelar papéis',
  mayor_election: 'Eleição do Diretor',
  night_infiltrators: 'Noite — Infiltrados',
  night_seer: 'Noite — Profeta',
  night_guardian: 'Noite — Conselheiro',
  day_announce: 'Manhã',
  day_discussion: 'Assembleia',
  day_vote: 'Votação',
  day_result: 'Veredito',
  finished: 'Terminada',
  cancelled: 'Cancelada',
}

/**
 * Versão tolerante a chaves extra que só aparecem em payloads de eventos
 * (ex.: 'night' no phase_change de fim de noite).
 */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  if (status in STATUS_LABEL) return STATUS_LABEL[status as VanaCampSessionStatus]
  if (status === 'night') return 'Noite'
  return status
}

export const CHAT_MODE_LABEL: Record<VanaCampChatMode, string> = {
  presencial: 'Presencial',
  remote: 'No site (chat)',
}

export const MAYOR_MODE_LABEL: Record<VanaCampMayorMode, string> = {
  none: 'Sem Diretor',
  auto: 'Sorteado',
  vote_day1: 'Eleito no dia 1',
  manual: 'Escolhido pelo host',
}

export const ASSIGN_MODE_LABEL: Record<VanaCampRoleAssignmentMode, string> = {
  auto: 'Automática',
  auto_custom: 'Auto + customizada',
  manual: 'Manual',
}

/** Como é que um jogador saiu (tema suave: medo à noite vs. votação). */
export function causeLabel(cause: string | null | undefined): string {
  if (cause === 'sabotage') return 'à noite'
  if (cause === 'vote') return 'votação'
  return cause ?? '—'
}
