// Regras puras do VanaEspada — sem I/O, 100% testáveis (utils/vana-espada.test.ts).
//
// A pontuação corre SEMPRE no servidor (lib/actions/vana-espada.ts): o cliente
// nunca envia pontos nem o tempo que demorou. Estas funções também são usadas no
// cliente, mas só para mostrar os números que o servidor já calculou.

import { getBook, MAX_VERSE, type BibleBook, type BibleSection } from '@/utils/bible-books'
import type {
  EspadaAnswerJson,
  EspadaAnswerView,
  EspadaDifficulty,
  EspadaGuess,
  EspadaPlayer,
  EspadaPlayerRow,
  EspadaPublicRound,
  EspadaReference,
  EspadaRoundJson,
  EspadaSession,
  EspadaSessionRow,
  LocateBreakdown,
} from '@/types/vana-espada'

/** Pontos máximos de uma ronda "Onde Está?" (600 + 250 + 100 + 50). */
export const MAX_LOCATE_POINTS = 1000

/** Segundos por defeito de uma ronda "Onde Está?". */
export const DEFAULT_LOCATE_SECONDS = 30

const BOOK_POINTS = { exact: 600, section: 200, testament: 50, none: 0 } as const
const MAX_CHAPTER_POINTS = 250
const MAX_VERSE_POINTS = 100
const MAX_SPEED_POINTS = 50

/** Distância (em capítulos / versículos) a partir da qual a proximidade já não vale nada. */
const PROXIMITY_RANGE = 10

/**
 * Pontua um palpite do Modo A ("Onde Está?"), até 1000 pontos.
 *
 *   Livro      livro certo 600 · mesma secção 200 · mesmo testamento 50 · senão 0
 *   Capítulo   só com o livro certo: 250 × max(0, 1 − |Δcap| / 10)
 *   Versículo  só com o capítulo certo: 100 dentro do intervalo,
 *              senão 100 × max(0, 1 − Δv / 10) (Δv = distância ao intervalo)
 *   Rapidez    só se o livro deu pontos: 50 × (1 − elapsed / limite)
 *
 * "Só sei o livro" (chapter/verse a null) pontua apenas livro + rapidez.
 * Cada componente é arredondado ao inteiro, por isso o breakdown soma sempre o total.
 */
export function scoreLocate(
  guess: EspadaGuess,
  answer: EspadaReference,
  elapsedMs: number,
  timeLimitMs: number
): { points: number; breakdown: LocateBreakdown } {
  const guessBook = getBook(guess.bookId)
  const answerBook = getBook(answer.bookId)

  const bookMatch = matchBook(guessBook, answerBook)
  const bookPoints = BOOK_POINTS[bookMatch]

  let chapterPoints = 0
  let chapterDelta: number | null = null
  let versePoints = 0
  let verseDelta: number | null = null

  if (bookMatch === 'exact' && guess.chapter != null) {
    chapterDelta = Math.abs(guess.chapter - answer.chapter)
    chapterPoints = Math.round(MAX_CHAPTER_POINTS * proximity(chapterDelta))

    if (chapterDelta === 0 && guess.verse != null) {
      verseDelta = distanceToRange(guess.verse, answer.verseStart, answer.verseEnd)
      versePoints = verseDelta === 0
        ? MAX_VERSE_POINTS
        : Math.round(MAX_VERSE_POINTS * proximity(verseDelta))
    }
  }

  // A rapidez só premeia quem pelo menos apontou para a zona certa da Bíblia.
  const ratio = timeLimitMs > 0 ? clamp01(elapsedMs / timeLimitMs) : 1
  const speedPoints = bookPoints > 0 ? Math.round(MAX_SPEED_POINTS * (1 - ratio)) : 0

  return {
    points: bookPoints + chapterPoints + versePoints + speedPoints,
    breakdown: {
      book: bookPoints,
      chapter: chapterPoints,
      verse: versePoints,
      speed: speedPoints,
      bookMatch,
      chapterDelta,
      verseDelta,
    },
  }
}

function matchBook(
  guess: BibleBook | undefined,
  answer: BibleBook | undefined
): LocateBreakdown['bookMatch'] {
  if (!guess || !answer) return 'none'
  if (guess.id === answer.id) return 'exact'
  if (guess.section === answer.section) return 'section'
  if (guess.testament === answer.testament) return 'testament'
  return 'none'
}

/** 1 quando a distância é 0, 0 a partir de PROXIMITY_RANGE. */
function proximity(delta: number): number {
  return Math.max(0, 1 - delta / PROXIMITY_RANGE)
}

/** 0 se `value` está dentro de [min, max]; senão a distância ao extremo mais próximo. */
function distanceToRange(value: number, min: number, max: number): number {
  if (value < min) return min - value
  if (value > max) return value - max
  return 0
}

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return n > 1 ? 1 : n
}

/** "1 Samuel 17:45-47" · "Salmos 23:1" · "Judas 1:9". */
export function formatReference(ref: EspadaReference): string {
  const book = getBook(ref.bookId)
  const name = book?.name ?? '?'
  const verses = ref.verseEnd > ref.verseStart
    ? `${ref.verseStart}-${ref.verseEnd}`
    : `${ref.verseStart}`
  return `${name} ${ref.chapter}:${verses}`
}

/** Versão curta para listas apertadas: "1Sm 17:45-47". */
export function formatReferenceShort(ref: EspadaReference): string {
  const book = getBook(ref.bookId)
  const abbr = book?.abbr ?? '?'
  const verses = ref.verseEnd > ref.verseStart
    ? `${ref.verseStart}-${ref.verseEnd}`
    : `${ref.verseStart}`
  return `${abbr} ${ref.chapter}:${verses}`
}

/** Palpite de um jogador em texto: "Gn 3:15" · "Gn 3" · "Gn" · "—" (sem resposta). */
export function formatGuess(guess: Partial<EspadaGuess> | null | undefined): string {
  if (!guess || guess.bookId == null) return '—'
  const book = getBook(guess.bookId)
  if (!book) return '—'
  if (guess.chapter == null) return book.abbr
  if (guess.verse == null) return `${book.abbr} ${guess.chapter}`
  return `${book.abbr} ${guess.chapter}:${guess.verse}`
}

/** true se o número de versículo cabe na Bíblia (o máximo é Sl 119, com 176). */
export function isValidVerse(verse: number): boolean {
  return Number.isInteger(verse) && verse >= 1 && verse <= MAX_VERSE
}

// ── Sorteio de rondas ────────────────────────────────────────────

export interface VersePoolItem {
  id: string
  difficulty: EspadaDifficulty
}

export interface PickRoundsOptions {
  count: number
  /** 'any' = qualquer dificuldade. */
  difficulty: EspadaDifficulty | 'any'
  /** Versículos a evitar (usados nas últimas sessões do anfitrião). */
  excludeVerseIds?: string[]
}

/**
 * Sorteia `count` versículos sem repetir, com um RNG injetável (testes deterministas).
 *
 * Os versículos excluídos só entram se não houver outra hipótese — é melhor repetir
 * um versículo da semana passada do que ter uma sessão com menos rondas.
 */
export function pickRounds<T extends VersePoolItem>(
  pool: T[],
  { count, difficulty, excludeVerseIds = [] }: PickRoundsOptions,
  rng: () => number = Math.random
): T[] {
  const eligible = difficulty === 'any' ? pool : pool.filter((v) => v.difficulty === difficulty)
  const excluded = new Set(excludeVerseIds)

  const fresh = shuffle(eligible.filter((v) => !excluded.has(v.id)), rng)
  if (fresh.length >= count) return fresh.slice(0, count)

  const recycled = shuffle(eligible.filter((v) => excluded.has(v.id)), rng)
  return [...fresh, ...recycled].slice(0, count)
}

/** Fisher-Yates com RNG injetável. Não altera o array original. */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ── Prémios ──────────────────────────────────────────────────────

/** Pontos do jogo por cada Gold. */
export const ESPADA_POINTS_PER_GOLD = 10

/**
 * Pontos → Gold/XP: tira-se a última casa e o XP é o dobro.
 *   4826 pts → 482 🪙 + 964 ⭐
 *
 * Arredonda para baixo (482,6 dá 482, não 483) e NÃO tem o teto de 500 Gold
 * por sessão do VanaQuest, de propósito: este jogo é para premiar quem sabe
 * mesmo a Bíblia, e a conta de cada um não pode depender de quanto fez o 1.º
 * (com o teto, se o 1.º passasse os 5000 pontos todos levavam menos).
 */
export function calcEspadaRewards(totalPoints: number): { gold: number; xp: number } {
  const gold = Math.floor(Math.max(0, totalPoints) / ESPADA_POINTS_PER_GOLD)
  return { gold, xp: gold * 2 }
}

// ── Análise de desempenho (relatório da sessão) ──────────────────

/** Quão perto ficou uma resposta, do melhor para o pior. */
export type AnswerTier = 'exact' | 'chapter' | 'book' | 'section' | 'testament' | 'miss' | 'unanswered'

export const ANSWER_TIERS: AnswerTier[] = ['exact', 'chapter', 'book', 'section', 'testament', 'miss', 'unanswered']

/**
 * Classifica uma resposta a partir do breakdown gravado no servidor.
 * "Só sei o livro" conta como livro certo; capítulo certo sem versículo, como capítulo certo.
 */
export function answerTier(breakdown: LocateBreakdown | null | undefined): AnswerTier {
  if (!breakdown) return 'unanswered'
  switch (breakdown.bookMatch) {
    case 'exact':
      if (breakdown.chapterDelta === 0 && breakdown.verseDelta === 0) return 'exact'
      if (breakdown.chapterDelta === 0) return 'chapter'
      return 'book'
    case 'section':
      return 'section'
    case 'testament':
      return 'testament'
    default:
      return 'miss'
  }
}

/** Acertou pelo menos o livro (referência exata, capítulo certo ou livro certo). */
export function foundTheBook(tier: AnswerTier): boolean {
  return tier === 'exact' || tier === 'chapter' || tier === 'book'
}

/** Média de pontos por ronda a partir da qual uma secção conta como ponto forte (= encontra o livro). */
export const STRONG_SECTION_AVG = 600
/** Abaixo disto, nem a secção costuma acertar — é uma secção a treinar. */
export const WEAK_SECTION_AVG = 200

export interface SectionScore {
  section: BibleSection
  rounds: number
  bookRight: number
  avgPoints: number
}

export interface PlayerStrengths {
  /** Rondas em que o jogador estava na sessão. */
  rounds: number
  answered: number
  tiers: Record<AnswerTier, number>
  totalPoints: number
  avgPoints: number
  /** Tempo médio de resposta, só das rondas respondidas. */
  avgSeconds: number | null
  /** Da secção mais forte para a mais fraca. */
  bySection: SectionScore[]
  strongest: BibleSection[]
  weakest: BibleSection[]
}

/**
 * Pontos fortes de um jogador numa sessão, por secção da Bíblia.
 *
 * `rounds` são só as rondas em que o jogador já estava (quem entrou a meio não é
 * penalizado pelas que perdeu). Uma ronda sem resposta conta como 0 pontos.
 * A força de uma secção é a média de pontos por ronda: apanha também os quase
 * (capítulo ao lado) que um simples "acertou/falhou" esconderia.
 */
export function summarizePlayerStrengths(
  rounds: { id: string; bookId: number }[],
  answers: { roundId: string; breakdown: LocateBreakdown | null; points: number; elapsedMs: number | null }[]
): PlayerStrengths {
  const byRound = new Map(answers.map((a) => [a.roundId, a]))
  const tiers = Object.fromEntries(ANSWER_TIERS.map((t) => [t, 0])) as Record<AnswerTier, number>
  const sections = new Map<BibleSection, { rounds: number; bookRight: number; points: number }>()

  let totalPoints = 0
  let answered = 0
  let elapsedSum = 0
  let elapsedCount = 0

  for (const round of rounds) {
    const answer = byRound.get(round.id)
    const tier = answer ? answerTier(answer.breakdown) : 'unanswered'
    const points = answer?.points ?? 0

    tiers[tier] += 1
    totalPoints += points
    if (answer) {
      answered += 1
      if (answer.elapsedMs != null) {
        elapsedSum += answer.elapsedMs
        elapsedCount += 1
      }
    }

    const section = getBook(round.bookId)?.section
    if (!section) continue
    const acc = sections.get(section) ?? { rounds: 0, bookRight: 0, points: 0 }
    acc.rounds += 1
    acc.points += points
    if (foundTheBook(tier)) acc.bookRight += 1
    sections.set(section, acc)
  }

  const bySection: SectionScore[] = [...sections.entries()]
    .map(([section, s]) => ({
      section,
      rounds: s.rounds,
      bookRight: s.bookRight,
      avgPoints: Math.round(s.points / s.rounds),
    }))
    .sort((a, b) => b.avgPoints - a.avgPoints)

  return {
    rounds: rounds.length,
    answered,
    tiers,
    totalPoints,
    avgPoints: rounds.length ? Math.round(totalPoints / rounds.length) : 0,
    avgSeconds: elapsedCount ? Math.round((elapsedSum / elapsedCount) / 100) / 10 : null,
    bySection,
    strongest: bySection.filter((s) => s.avgPoints >= STRONG_SECTION_AVG).slice(0, 3).map((s) => s.section),
    weakest: bySection
      .filter((s) => s.avgPoints < WEAK_SECTION_AVG)
      .slice(-3)
      .reverse()
      .map((s) => s.section),
  }
}

// ── Mapeamento snake_case (BD) → camelCase (UI) ──────────────────
// Um único sítio faz a tradução: tudo o resto trabalha só com os tipos de
// types/vana-espada.ts, sem `any` a passear pelos componentes.

export function toEspadaSession(row: EspadaSessionRow): EspadaSession {
  return {
    id: row.id,
    pin: row.pin,
    status: row.status,
    currentRound: row.current_round ?? -1,
    totalRounds: row.total_rounds ?? 0,
    currentKind: row.current_kind ?? null,
    phaseStartedAt: row.phase_started_at ?? null,
    phaseEndsAt: row.phase_ends_at ?? null,
    answeredCount: row.answered_count ?? 0,
    foundCount: row.found_count ?? 0,
    settings: row.settings ?? { physical_bible_only: true },
    pointsAwardedAt: row.points_awarded_at ?? null,
  }
}

export function toEspadaPlayer(row: EspadaPlayerRow): EspadaPlayer {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ?? null,
    isGuest: !!row.is_guest,
    totalPoints: Number(row.total_points) || 0,
    lastRoundPoints: row.last_round_points ?? null,
    rewardsRecipientId: row.rewards_recipient_id ?? null,
    rewardsSkipped: !!row.rewards_skipped,
  }
}

/** Resultado de `get_vanaespada_round_public`. */
export function toPublicRound(json: EspadaRoundJson | null | undefined): EspadaPublicRound | null {
  if (!json || json.round_index == null) return null
  const ref = json.reference
  return {
    roundIndex: json.round_index,
    kind: json.kind,
    timeSeconds: json.time_seconds,
    excerpt: json.excerpt ?? null,
    translation: json.translation ?? null,
    reference: ref
      ? {
          bookId: ref.book_id,
          chapter: ref.chapter,
          verseStart: ref.verse_start,
          verseEnd: ref.verse_end,
        }
      : null,
  }
}

/** Resultado de `get_vanaespada_reveal` / `get_vanaespada_host_answers`. */
export function toAnswerViews(json: unknown): EspadaAnswerView[] {
  if (!Array.isArray(json)) return []
  return (json as EspadaAnswerJson[]).map((a) => ({
    playerId: a.player_id,
    displayName: a.display_name,
    avatarUrl: a.avatar_url ?? null,
    guessBook: a.guess_book ?? null,
    guessChapter: a.guess_chapter ?? null,
    guessVerse: a.guess_verse ?? null,
    points: Number(a.points) || 0,
    isCorrect: a.is_correct ?? null,
    answeredAt: a.answered_at ?? null,
    elapsedMs: a.elapsed_ms ?? null,
  }))
}

// ── Apresentação ─────────────────────────────────────────────────

/** Tamanho da fonte do excerto no projetor: quanto maior o texto, menor a letra. */
export function excerptFontSize(text: string): string {
  const len = (text || '').length
  if (len <= 60) return 'clamp(2.5rem, 5.5vw, 6rem)'
  if (len <= 110) return 'clamp(2.25rem, 4.5vw, 5rem)'
  if (len <= 180) return 'clamp(2rem, 3.6vw, 4rem)'
  if (len <= 260) return 'clamp(1.75rem, 3vw, 3.25rem)'
  return 'clamp(1.5rem, 2.4vw, 2.75rem)'
}

/** Frase curta para o telemóvel na revelação, a partir do breakdown. */
export function breakdownHeadline(breakdown: LocateBreakdown | null | undefined): string {
  if (!breakdown) return 'Sem resposta'
  switch (breakdown.bookMatch) {
    case 'exact':
      if (breakdown.chapterDelta === null) return 'Livro certo!'
      if (breakdown.chapterDelta === 0) {
        return breakdown.verseDelta === 0 ? 'Referência certa!' : 'Capítulo certo!'
      }
      return `Livro certo! Capítulo a ${breakdown.chapterDelta} de distância`
    case 'section':
      return 'Secção certa da Bíblia'
    case 'testament':
      return 'Testamento certo'
    default:
      return 'Longe do alvo'
  }
}
