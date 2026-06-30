export type VanaWordsStatus =
  | 'lobby'
  | 'team_preview'
  | 'arauto_spin'
  | 'arauto_ready'
  | 'playing'
  | 'finished'

export type TeamId = 'a' | 'b'
export type WordTeam = 'a' | 'b' | 'neutral' | 'black'
export type GamePhase = 'hinting' | 'guessing'
export type WinReason = 'all_found' | 'black_hit'

export interface VanaWordsSession {
  id: string
  host_id: string
  code: string
  status: VanaWordsStatus
  current_team: TeamId | null
  current_phase: GamePhase | null
  current_hint: string | null
  current_hint_number: number | null
  guesses_remaining: number
  winner_team: TeamId | null
  win_reason: WinReason | null
  board_version: number
  is_test_session: boolean
  rewards_awarded: boolean
  arauto_reveal_a: 'spin' | 'instant'
  arauto_reveal_b: 'spin' | 'instant'
  created_at: string
  started_at: string | null
  ended_at: string | null
}

export interface VanaWordsPlayer {
  id: string
  session_id: string
  user_id: string | null
  display_name: string
  avatar_url: string | null
  section: string | null
  team: TeamId | null
  is_arauto: boolean
  is_bot: boolean
  swap_requested: boolean
  arauto_response: 'pending' | 'accepted' | 'declined'
  joined_at: string
}

export interface VanaWordsWord {
  id: string
  session_id: string
  word: string
  team: WordTeam | null   // null = oculto para jogadores normais
  grid_pos: number
  is_revealed: boolean
  revealed_at: string | null
}

export interface VanaWordsGuess {
  id: string
  session_id: string
  word_id: string
  player_id: string
  created_at: string
}

export interface VanaWordsTurn {
  id: string
  session_id: string
  team: TeamId
  hint_word: string | null
  hint_number: number | null
  words_revealed: { word: string; team: WordTeam }[]
  end_reason: 'pass' | 'neutral' | 'opponent' | 'black' | 'limit' | null
  turn_order: number
  created_at: string
}

// Agrupamento de equipas para o ecrã de pré-visualização
export interface TeamPreview {
  teamA: VanaWordsPlayer[]
  teamB: VanaWordsPlayer[]
}

// Arauto selecionado por equipa
export interface ArautoProposal {
  teamA: VanaWordsPlayer
  teamB: VanaWordsPlayer
}

// Dados de palpites por palavra (para UI)
export interface WordWithGuesses extends VanaWordsWord {
  guessCount: number
  guessedByMe: boolean
}

export const TEAM_LABELS: Record<TeamId, string> = {
  a: 'Leão',
  b: 'Águia',
}

export const TEAM_COLORS: Record<TeamId, { bg: string; text: string; border: string; badge: string }> = {
  a: {
    bg: 'bg-amber-500',
    text: 'text-amber-400',
    border: 'border-amber-500',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  b: {
    bg: 'bg-blue-500',
    text: 'text-blue-400',
    border: 'border-blue-500',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  },
}
