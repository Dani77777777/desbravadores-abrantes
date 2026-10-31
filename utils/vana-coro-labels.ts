// Rótulos PT do VanaCoro (os enums ficam em inglês na BD).

import type { QuestionStatus } from '@/utils/vana-coro/schedule'
import type { VanaCoroGroupSource } from '@/types/vana-coro'

export { MIN_RESPONDENTS } from '@/utils/vana-coro/board'

export const QUESTION_STATUS_LABELS: Record<QuestionStatus, { label: string; cls: string }> = {
  queued: { label: 'Na fila', cls: 'bg-stone-100 text-stone-600' },
  scheduled: { label: 'Agendada', cls: 'bg-blue-100 text-blue-700' },
  open: { label: 'Aberta', cls: 'bg-green-100 text-green-700' },
  review: { label: 'A rever', cls: 'bg-amber-100 text-amber-800' },
  ready: { label: 'Pronta', cls: 'bg-purple-100 text-purple-700' },
  played: { label: 'Jogada', cls: 'bg-gray-100 text-gray-500' },
}

export const GROUP_SOURCE_LABELS: Record<VanaCoroGroupSource, { label: string; cls: string }> = {
  auto: { label: 'Auto', cls: 'bg-stone-100 text-stone-600' },
  ai: { label: 'IA', cls: 'bg-fuchsia-100 text-fuchsia-700' },
  manual: { label: 'Manual', cls: 'bg-blue-100 text-blue-700' },
}

/** Perguntas prontas que um jogo precisa (5 rondas + reservas + as que não chegam ao mínimo). */
export const QUESTIONS_PER_GAME = 9
