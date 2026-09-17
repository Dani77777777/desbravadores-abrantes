// Rótulos PT dos enums do VanaEspada. Os enums vivem em inglês na BD; só a UI traduz.

import type { EspadaDifficulty, EspadaKind, EspadaStatus } from '@/types/vana-espada'

export const ESPADA_STATUS_LABELS: Record<EspadaStatus, string> = {
  lobby: 'Sala de espera',
  round_ready: 'A preparar a ronda',
  round_active: 'Tempo de resposta',
  round_reveal: 'Revelação',
  leaderboard: 'Classificação',
  finished: 'Jogo terminado',
}

export const ESPADA_KIND_LABELS: Record<EspadaKind, string> = {
  locate: 'Onde Está?',
  drill: 'Saca a Espada!',
}

export const ESPADA_DIFFICULTY_LABELS: Record<EspadaDifficulty, string> = {
  easy: 'Fácil',
  medium: 'Médio',
  hard: 'Difícil',
}

export const ESPADA_DIFFICULTY_COLORS: Record<EspadaDifficulty, string> = {
  easy: 'bg-green-100 text-green-700 border-green-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  hard: 'bg-red-100 text-red-700 border-red-200',
}
