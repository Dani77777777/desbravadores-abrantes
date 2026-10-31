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

export type VanaCoroGroupSource = 'auto' | 'ai' | 'manual'

export interface VanaCoroGroup {
  id: string
  label: string
  emoji: string | null
  hidden: boolean
  source: VanaCoroGroupSource
}

/**
 * Uma resposta no ecrã de revisão. `person` é um pseudónimo da página ("p7"): serve
 * para contar pessoas diferentes sem mandar ao browser quem respondeu.
 */
export interface VanaCoroReviewAnswer {
  id: string
  text: string
  group_id: string | null
  hidden: boolean
  person: string
  created_at: string
}

export interface VanaCoroBoardEntryRow {
  rank: number
  label: string
  emoji: string | null
  respondents: number
  points: number
}

export interface VanaCoroReviewData {
  question: VanaCoroQuestion
  groups: VanaCoroGroup[]
  answers: VanaCoroReviewAnswer[]
  /** Quadro congelado (só quando a pergunta está pronta). */
  board: VanaCoroBoardEntryRow[]
  /** Há chave de IA configurada no servidor? */
  aiEnabled: boolean
}

// ── Jogo ao vivo (Fase 3) ─────────────────────────────────────

export type VanaCoroTeam = 'a' | 'b'
export type VanaCoroPhase = 'intro' | 'faceoff' | 'playing' | 'steal' | 'reveal_rest' | 'round_end'

/** Linha de vanacoro_sessions (pública: nada aqui é segredo). */
export interface VanaCoroSession {
  id: string
  code: string
  host_id: string
  status: 'lobby' | 'playing' | 'finished'
  phase: VanaCoroPhase | null
  current_round: number
  total_rounds: number
  question_ids: string[]
  team_a_name: string
  team_b_name: string
  team_a_score: number
  team_b_score: number
  control_team: VanaCoroTeam | null
  buzzed_team: VanaCoroTeam | null
  strikes: number
  strike_seq: number
  round_pot: number
  round_winner: VanaCoroTeam | null
  round_banked: number
  board_version: number
  is_test_session: boolean
  rewards_awarded_at: string | null
  created_at: string
  started_at: string | null
  ended_at: string | null
}

export interface VanaCoroPlayer {
  id: string
  session_id: string
  profile_id: string | null
  guest_name: string | null
  display_name: string
  avatar_url: string | null
  team: VanaCoroTeam | null
  is_captain: boolean
  is_bot: boolean
  rewards_recipient_id: string | null
  rewards_skipped: boolean
  joined_at: string
}

/** Um espaço do quadro como o vê o projetor: só as respostas reveladas têm nome. */
export interface VanaCoroPublicSlot {
  rank: number
  revealed: boolean
  label?: string
  emoji?: string | null
  points?: number
  /** Contou para o pote (false nas revelações do fim da ronda). */
  scored?: boolean
}

export interface VanaCoroPublicRound {
  roundNumber: number
  totalRounds: number
  multiplier: number
  prompt: string
  slots: VanaCoroPublicSlot[]
}

/** O quadro completo, só para o anfitrião. */
export interface VanaCoroHostSlot {
  id: string
  rank: number
  label: string
  emoji: string | null
  points: number
  respondents: number
  revealed: boolean
  scored: boolean
  /** Respostas originais do grupo (para a sugestão no palco). */
  texts: string[]
}

export interface VanaCoroHostRound {
  roundId: string
  roundNumber: number
  totalRounds: number
  multiplier: number
  prompt: string
  slots: VanaCoroHostSlot[]
  canUndo: boolean
  /** A última ação (para o botão "Desfazer" dizer o que desfaz). */
  lastEvent: string | null
}

/** Pergunta pronta que o anfitrião pode escolher no lobby. */
export interface VanaCoroReadyQuestion {
  id: string
  prompt: string
  ready_at: string | null
  used_at: string | null
  entries: number
}
