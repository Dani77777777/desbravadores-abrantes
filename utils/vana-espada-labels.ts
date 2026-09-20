// Rótulos PT dos enums do VanaEspada. Os enums vivem em inglês na BD; só a UI traduz.

import type { EspadaDifficulty, EspadaKind, EspadaStatus } from '@/types/vana-espada'
import type { AnswerTier } from '@/utils/vana-espada'

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

/** Nível de uma resposta, do melhor para o pior (relatório da sessão). */
export const ANSWER_TIER_LABELS: Record<AnswerTier, string> = {
  exact: 'Referência exata',
  chapter: 'Capítulo certo',
  book: 'Livro certo',
  section: 'Secção certa',
  testament: 'Testamento certo',
  miss: 'Longe',
  unanswered: 'Sem resposta',
}

export const ANSWER_TIER_SHORT: Record<AnswerTier, string> = {
  exact: 'Exata',
  chapter: 'Capítulo',
  book: 'Livro',
  section: 'Secção',
  testament: 'Testam.',
  miss: 'Longe',
  unanswered: '—',
}

/** Cor de cada nível (barras e etiquetas do relatório). */
export const ANSWER_TIER_COLORS: Record<AnswerTier, { bar: string; chip: string }> = {
  exact: { bar: 'bg-amber-400', chip: 'bg-amber-100 text-amber-800 border-amber-200' },
  chapter: { bar: 'bg-green-600', chip: 'bg-green-100 text-green-800 border-green-200' },
  book: { bar: 'bg-green-400', chip: 'bg-green-50 text-green-700 border-green-200' },
  section: { bar: 'bg-sky-400', chip: 'bg-sky-50 text-sky-700 border-sky-200' },
  testament: { bar: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600 border-slate-200' },
  miss: { bar: 'bg-red-300', chip: 'bg-red-50 text-red-600 border-red-200' },
  unanswered: { bar: 'bg-gray-200', chip: 'bg-gray-50 text-gray-400 border-gray-200' },
}
