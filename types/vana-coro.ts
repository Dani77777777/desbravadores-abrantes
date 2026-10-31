// Tipos partilhados do VanaCoro (admin e, nas fases seguintes, o jogo ao vivo).
// A recolha ("Pergunta da Semana") tem os seus em lib/perguntas/types.ts, sem o nome do jogo.

export type VanaCoroReviewStatus = 'pending' | 'grouped' | 'ready'

export interface VanaCoroSettings {
  invite_token: string
  invite_rotated_at: string
  cadence_days: number
  open_days: number
  turbo: boolean
}

export interface VanaCoroQuestion {
  id: string
  prompt: string
  allow_guests: boolean
  opens_at: string | null
  closes_at: string | null
  review_status: VanaCoroReviewStatus
  ready_at: string | null
  used_at: string | null
  created_at: string
}

/** Pergunta com as contagens para o admin (pessoas distintas, não respostas). */
export interface VanaCoroQuestionWithStats extends VanaCoroQuestion {
  respondents: number
  answers: number
  guest_respondents: number
}
