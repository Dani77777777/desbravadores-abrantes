// VanaArca — tipos partilhados entre o motor (utils/vana-arca.ts), as server
// actions (lib/actions/vana-arca.ts) e os componentes. Ver docs/VanaArca.md.

export const VANAARCA_GAME_ID = 'vana-arca'

export type VanaArcaRunStatus = 'playing' | 'finished' | 'abandoned' | 'invalid'
/** 'capsized' = a arca virou · 'full' = acabaram as 3 vidas ("O Senhor fechou a porta"). */
export type VanaArcaEndReason = 'capsized' | 'full'

/** Linha única de vanaarca_settings (editável no admin). */
export interface VanaArcaSettings {
  prize_weekday: number // 0 = domingo
  prize_time: string // "HH:MM" (hora de Lisboa)
  paid_runs_per_day: number
  reward_low: number
  reward_mid: number
  reward_high: number
  mid_from: number
  high_from: number
  top_prizes: number[]
  family_prize: number
  family_min_members: number
  launched_at: string
  /** Última mudança do dia/hora do prémio: o período aberto acaba na próxima ocorrência depois disto. */
  schedule_changed_at: string | null
  updated_at: string | null
}

export const DEFAULT_VANAARCA_SETTINGS: Omit<VanaArcaSettings, 'launched_at' | 'schedule_changed_at' | 'updated_at'> = {
  prize_weekday: 0,
  prize_time: '21:00',
  paid_runs_per_day: 3,
  reward_low: 5,
  reward_mid: 10,
  reward_high: 15,
  mid_from: 10,
  high_from: 20,
  top_prizes: [100, 60, 40],
  family_prize: 50,
  family_min_members: 2,
}

/** Resultado da partida tal como o servidor o calculou (é este que conta). */
export interface VanaArcaRunResult {
  pares: number
  filas: number
  score: number
  end_reason: VanaArcaEndReason
}

export interface VanaArcaPeriod {
  start: string
  end: string
}

/** Linha do "Top da semana" (só o necessário: nome a mostrar, pontuação e posição). */
export interface VanaArcaTopEntry {
  position: number
  name: string
  score: number
  is_me: boolean
}

/** Linha da Disputa de Famílias (sem lista de membros). */
export interface VanaArcaFamilyEntry {
  position: number
  name: string
  /** Média com uma casa decimal (para mostrar). */
  average: number
  played: number
  active: number
  is_mine: boolean
}

export interface VanaArcaBoards {
  period: VanaArcaPeriod
  prizes: number[]
  family_prize: number
  family_min_members: number
  top: VanaArcaTopEntry[]
  /** A minha posição no top (se não estiver nas linhas mostradas). */
  me: VanaArcaTopEntry | null
  families: VanaArcaFamilyEntry[]
  /** Frase pronta, ex.: "A tua família está em 2.º, a 4 pontos da 1.ª". */
  family_note: string | null
}

export interface VanaArcaStatus {
  paid_runs_per_day: number
  /** Partidas já começadas hoje (Lisboa), abandonadas incluídas. */
  runs_today: number
  paid_runs_left: number
  personal_best: number | null
  week_best: number | null
  multiplier: number
}

export interface VanaArcaFinishResponse {
  ok: boolean
  /** A partida não passou na validação do servidor: não dá pontos nem conta. */
  invalid?: boolean
  result?: VanaArcaRunResult
  reward_xp?: number
  reward_gold?: number
  /** true quando a partida já não tinha vaga com prémio. */
  no_reward_slot?: boolean
  multiplier?: number
  status?: VanaArcaStatus
  family_note?: string | null
  error?: string
}

export interface VanaArcaPayoutRecipient {
  user_id: string
  name: string
  xp: number
  gold: number
  reason: string
}

/** O que fica em vanaarca_weekly_payouts.results. */
export interface VanaArcaPayoutResults {
  top: { position: number; user_id: string; name: string; score: number; finished_at: string; prize: number }[]
  families: {
    family_id: string
    name: string
    average: number
    played: number
    active: number
    latest_finished_at: string | null
  }[]
  family_winner: { family_id: string; name: string; prize: number; recipients: { user_id: string; name: string }[] } | null
}

export interface VanaArcaPayoutRow {
  period_start: string
  period_end: string
  paid_at: string
  paid_by: string | null
  paid_by_name: string | null
  results: VanaArcaPayoutResults
}
