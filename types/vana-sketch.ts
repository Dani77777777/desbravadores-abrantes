export type VanaSketchStatus = 'lobby' | 'playing' | 'finished'
export type VanaSketchPhase = 'choosing' | 'drawing' | 'round_end'
export type RoundEndReason = 'all_guessed' | 'timeout' | 'skipped'

export interface VanaSketchSession {
  id: string
  host_id: string
  code: string
  status: VanaSketchStatus
  phase: VanaSketchPhase | null
  round_number: number
  total_rounds: number
  rounds_per_player: number
  draw_seconds: number
  drawer_player_id: string | null
  word_masked: string | null
  revealed_word: string | null
  round_ends_at: string | null
  canvas_version: number
  is_test_session: boolean
  rewards_awarded: boolean
  pack_ids?: string[] // packs de palavras escolhidos (migração dos packs)
  created_at: string
  started_at: string | null
  ended_at: string | null
}

export interface VanaSketchPlayer {
  id: string
  session_id: string
  user_id: string | null // null = bot
  display_name: string
  avatar_url: string | null
  section: string | null
  score: number
  draw_order: number | null
  is_bot: boolean
  joined_at: string
}

export interface VanaSketchGuess {
  id: string
  session_id: string
  round_number: number
  player_id: string
  guess_text: string | null // null quando is_correct (não revelar a palavra)
  is_correct: boolean
  points: number
  created_at: string
}

// Pack de palavras (Admin → VanaSketch); word_count vem do count dos joins
export interface VanaSketchPack {
  id: string
  name: string
  emoji: string
  description: string | null
  is_default: boolean
  sort_order: number
  word_count: number
}

// Traço persistido na BD (pontos normalizados 0..1)
export interface VanaSketchStroke {
  id: string
  session_id: string
  round_number: number
  seq: number
  color: string
  size: number
  points: [number, number][]
  created_at?: string
}

// ── Protocolo broadcast do canvas ────────────────────────────
// 'seg'   — troço incremental de um traço em curso
// 'end'   — traço terminado (já persistido na BD)
// 'undo'  — remover um traço
// 'clear' — limpar o quadro da ronda
export interface SegEvent {
  strokeId: string
  roundNumber: number
  color: string
  size: number
  points: [number, number][]
}
