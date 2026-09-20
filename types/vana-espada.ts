// Tipos partilhados do VanaEspada (cliente + servidor).
//
// A BD usa snake_case e inglês; a UI usa camelCase e português. A conversão
// acontece num só sítio: `toEspadaSession` / `toEspadaPlayer` (lib/actions/vana-espada.ts).

/** Modo de uma ronda. A Fase 1 só usa 'locate' ("Onde Está?"). */
export type EspadaKind = 'locate' | 'drill'

export type EspadaStatus =
  | 'lobby'
  | 'round_ready'
  | 'round_active'
  | 'round_reveal'
  | 'leaderboard'
  | 'finished'

export type EspadaDifficulty = 'easy' | 'medium' | 'hard'

export interface EspadaReference {
  bookId: number
  chapter: number
  verseStart: number
  verseEnd: number
}

export interface EspadaSession {
  id: string
  pin: string
  status: EspadaStatus
  currentRound: number
  totalRounds: number
  currentKind: EspadaKind | null
  phaseStartedAt: string | null
  /** Fonte de verdade dos timers: os clientes só fazem a contagem decrescente. */
  phaseEndsAt: string | null
  answeredCount: number
  foundCount: number
  settings: { physical_bible_only: boolean }
  pointsAwardedAt: string | null
}

export interface EspadaPlayer {
  id: string
  displayName: string
  avatarUrl: string | null
  isGuest: boolean
  totalPoints: number
  lastRoundPoints: number | null
  rewardsRecipientId: string | null
  rewardsSkipped: boolean
}

/** Ronda atual tal como a RPC pública a devolve — sem a resposta antes da revelação. */
export interface EspadaPublicRound {
  roundIndex: number
  kind: EspadaKind
  timeSeconds: number
  excerpt?: string | null
  translation?: string | null
  /** Só presente a partir de `round_reveal` (no Modo A). */
  reference?: EspadaReference | null
}

/** De onde vieram os pontos de uma ronda "Onde Está?" — é isto que o telemóvel mostra. */
export interface LocateBreakdown {
  book: number
  chapter: number
  verse: number
  speed: number
  bookMatch: 'exact' | 'section' | 'testament' | 'none'
  /** Distância em capítulos (só quando o livro está certo e o palpite tem capítulo). */
  chapterDelta: number | null
  /** Distância ao intervalo de versículos (0 = dentro do intervalo). */
  verseDelta: number | null
}

/** Palpite de um jogador. `chapter`/`verse` a null = "Só sei o livro". */
export interface EspadaGuess {
  bookId: number
  chapter: number | null
  verse: number | null
}

// ── Linhas e JSON como saem da BD (snake_case) ───────────────────
// Só os mapeadores de utils/vana-espada.ts lidam com estas formas.

export interface EspadaSessionRow {
  id: string
  pin: string
  status: EspadaStatus
  current_round: number | null
  total_rounds: number | null
  current_kind: EspadaKind | null
  phase_started_at: string | null
  phase_ends_at: string | null
  answered_count: number | null
  found_count: number | null
  settings: { physical_bible_only: boolean } | null
  points_awarded_at: string | null
}

export interface EspadaPlayerRow {
  id: string
  display_name: string
  avatar_url: string | null
  is_guest: boolean
  total_points: number | string
  last_round_points: number | null
  rewards_recipient_id: string | null
  rewards_skipped: boolean | null
}

/** Devolvido por `get_vanaespada_round_public`. */
export interface EspadaRoundJson {
  round_index: number
  kind: EspadaKind
  time_seconds: number
  excerpt: string | null
  translation: string | null
  reference: { book_id: number; chapter: number; verse_start: number; verse_end: number } | null
}

/** Devolvido por `get_vanaespada_reveal` e `get_vanaespada_host_answers`. */
export interface EspadaAnswerJson {
  player_id: string
  display_name: string
  avatar_url: string | null
  guess_book: number | null
  guess_chapter: number | null
  guess_verse: number | null
  points: number | null
  is_correct: boolean | null
  answered_at: string | null
  elapsed_ms: number | null
}

/** Uma resposta, como aparece no painel do anfitrião e na revelação do projetor. */
export interface EspadaAnswerView {
  playerId: string
  displayName: string
  avatarUrl: string | null
  guessBook: number | null
  guessChapter: number | null
  guessVerse: number | null
  points: number
  isCorrect: boolean | null
  answeredAt: string | null
  elapsedMs: number | null
}
