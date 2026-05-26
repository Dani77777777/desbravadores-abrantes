/**
 * Tipos partilhados para o jogo VanaCamp: Infiltrados.
 *
 * Convenção: snake_case nos campos vindos do Supabase (igual ao schema SQL).
 */

// ============================================
// ENUMS / LITERAIS
// ============================================

export type VanaCampRole = 'infiltrator' | 'seer' | 'guardian' | 'villager'

export type VanaCampSide = 'infiltrators' | 'desbravadores'

export type VanaCampSessionStatus =
  | 'lobby'
  | 'role_preview'
  | 'role_reveal'
  | 'mayor_election'
  | 'night_infiltrators'
  | 'night_seer'
  | 'night_guardian'
  | 'day_announce'
  | 'day_discussion'
  | 'day_vote'
  | 'day_result'
  | 'finished'
  | 'cancelled'

export type VanaCampChatMode = 'presencial' | 'remote'

export type VanaCampMayorMode = 'none' | 'auto' | 'vote_day1' | 'manual'

export type VanaCampRoleAssignmentMode = 'auto' | 'auto_custom' | 'manual'

export type VanaCampNightPhase = 'infiltrators' | 'seer' | 'guardian'

export type VanaCampVoteType = 'mayor_election' | 'day_expulsion'

export type VanaCampChannel = 'lobby' | 'infiltrators' | 'day' | 'dead'

export type VanaCampEliminationCause = 'sabotage' | 'vote'

export type VanaCampEventType =
  | 'phase_change'
  | 'session_started'
  | 'mayor_elected'
  | 'night_resolved'
  | 'death'
  | 'save'
  | 'reveal'
  | 'vote_tally'
  | 'win'

// ============================================
// CONFIG (gravado em sessions.config_json)
// ============================================

/**
 * Distribuição de papéis configurada para a sessão.
 * Soma de (infiltrators + seer + guardian + villagers) deve == número de jogadores.
 * Mayor não conta aqui — é um atributo separado.
 */
export interface VanaCampRoleConfig {
  infiltrators: number
  seer: number      // tipicamente 1
  guardian: number  // tipicamente 1
  villagers: number
}

export interface VanaCampSessionConfig {
  role_counts?: VanaCampRoleConfig
  /** Tempos máximos por fase em segundos (override aos defaults). */
  phase_timeouts?: Partial<Record<VanaCampSessionStatus, number>>
}

// ============================================
// REGISTOS DE TABELAS
// ============================================

export interface VanaCampSession {
  id: string
  host_id: string
  code: string
  status: VanaCampSessionStatus
  phase_started_at: string | null
  phase_ends_at: string | null
  phase_paused_at: string | null
  day_number: number
  chat_mode: VanaCampChatMode
  mayor_mode: VanaCampMayorMode
  role_assignment_mode: VanaCampRoleAssignmentMode
  config_json: VanaCampSessionConfig
  winner_side: VanaCampSide | null
  rewards_awarded: boolean
  is_test_session: boolean
  created_at: string
  ended_at: string | null
}

/** Versão completa (servidor / host) com a coluna `role` visível. */
export interface VanaCampPlayer {
  id: string
  session_id: string
  user_id: string | null
  display_name: string
  role: VanaCampRole | null
  is_mayor: boolean
  is_alive: boolean
  is_bot: boolean
  eliminated_on_day: number | null
  eliminated_by: VanaCampEliminationCause | null
  joined_at: string
}

/** View pública — sem coluna `role`. É o que os clientes subscrevem via realtime. */
export type VanaCampPlayerPublic = Omit<VanaCampPlayer, 'role'>

// Tipo já correto via Omit<VanaCampPlayer, 'role'> — inclui is_bot e user_id nullable.

export interface VanaCampNightAction {
  id: string
  session_id: string
  day_number: number
  phase: VanaCampNightPhase
  actor_player_id: string
  target_player_id: string
  /** Apenas para o profeta: 'fiel' ou 'infiltrado'. */
  result: 'fiel' | 'infiltrado' | null
  created_at: string
}

export interface VanaCampVote {
  id: string
  session_id: string
  day_number: number
  vote_type: VanaCampVoteType
  voter_player_id: string
  target_player_id: string
  created_at: string
}

export interface VanaCampMessage {
  id: string
  session_id: string
  channel: VanaCampChannel
  sender_player_id: string
  content: string
  created_at: string
}

export interface VanaCampEvent {
  id: string
  session_id: string
  day_number: number
  event_type: VanaCampEventType
  payload: Record<string, unknown>
  created_at: string
}

// ============================================
// DEFAULTS
// ============================================

/** Default em segundos para cada fase temporizada. Host pode ajustar via config. */
export const VANA_CAMP_DEFAULT_PHASE_SECONDS: Partial<Record<VanaCampSessionStatus, number>> = {
  role_reveal: 8,
  mayor_election: 60,
  night_infiltrators: 90,
  night_seer: 45,
  night_guardian: 45,
  day_announce: 10,
  day_discussion: 300,   // 5 minutos
  day_vote: 60,
  day_result: 10,
}

// ============================================
// PREVIEW DE PAPÉIS (host)
// ============================================

/** Resumo do que cada jogador teve nas últimas N sessões (para a UI de preview). */
export interface VanaCampRoleHistoryEntry {
  session_id: string
  role: VanaCampRole
  was_mayor: boolean
  ended_at: string | null
}

export interface VanaCampPreviewPlayer {
  id: string
  user_id: string
  display_name: string
  role: VanaCampRole | null
  is_mayor: boolean
  /** Últimas N participações deste jogador (mais recente primeiro). */
  recent_history: VanaCampRoleHistoryEntry[]
}

export interface VanaCampPreviewData {
  players: VanaCampPreviewPlayer[]
  suggested_counts: VanaCampRoleConfig
  current_counts: VanaCampRoleConfig
}
