/**
 * Regras puras do VanaTrilha (Modo Diário).
 * Sem I/O, sem Supabase, sem React — só funções deterministas e testáveis.
 */

import {
  VANATRILHA_DAILY_LENGTH,
  VANATRILHA_MILAGRE_GOLD,
  VANATRILHA_TABUAS_STEPS,
  VANATRILHA_REWARD_XP,
  VANATRILHA_REWARD_GOLD,
  VANATRILHA_PERFECT_BONUS_XP,
  VANATRILHA_PERFECT_BONUS_GOLD,
  type VanaTrilhaDifficulty,
  type VanaTrilhaTile,
} from '@/types/vana-trilha'

// ────────────────────────────────────────────────────────────────────
// Datas (Europe/Lisbon)
// ────────────────────────────────────────────────────────────────────

/** "Hoje" no fuso do clube, no formato YYYY-MM-DD (o servidor corre em UTC). */
export function lisbonDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

const EPOCH_UTC = Date.UTC(2026, 0, 1)

/** Dias desde 2026-01-01 para uma data YYYY-MM-DD (pode ser negativo). */
function daysSinceEpoch(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH_UTC) / 86_400_000)
}

/**
 * Estação do dia — tem de coincidir exatamente com
 * public.vanatrilha_station_of_day em SQL (roda 1→7 a partir de 2026-01-01).
 * Aceita uma string YYYY-MM-DD (data de Lisboa) ou um Date (convertido para Lisboa).
 */
export function stationOfDay(date: Date | string): number {
  const iso = typeof date === 'string' ? date : lisbonDateString(date)
  const n = daysSinceEpoch(iso)
  return (((n % 7) + 7) % 7) + 1
}

/** Próxima meia-noite de Lisboa (para o contador "próxima etapa em…"). */
export function msUntilLisbonMidnight(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const elapsed = (get('hour') * 3600 + get('minute') * 60 + get('second')) * 1000
  return Math.max(0, 86_400_000 - elapsed - now.getMilliseconds())
}

// ────────────────────────────────────────────────────────────────────
// Tabuleiro diário (8 casas + partida)
// ────────────────────────────────────────────────────────────────────

/**
 * Casa especial de cada estação. Determinista: a mesma estação tem sempre o
 * mesmo layout, por isso a página "Como Jogar" corresponde ao que se vê.
 * No máximo uma casa especial por etapa, e nunca na casa final (8).
 */
const DAILY_SPECIAL_TILES: Record<number, { tile: Exclude<VanaTrilhaTile, 'normal'>; pos: number }> = {
  1: { tile: 'milagre', pos: 4 },  // Egito — as pragas
  2: { tile: 'elim', pos: 5 },     // Mar Vermelho — Elim fica logo a seguir (Êx 15:27)
  3: { tile: 'milagre', pos: 3 },  // Deserto de Sin — o maná
  4: { tile: 'tabuas', pos: 4 },   // Monte Sinai — as Tábuas da Lei
  5: { tile: 'elim', pos: 3 },     // Cades-Barneia — descanso antes do desafio
  6: { tile: 'milagre', pos: 5 },  // Rio Jordão — as águas param
  7: { tile: 'tabuas', pos: 6 },   // Canaã — a Lei lida ao povo (Js 8:34)
}

/** Casa especial (se houver) na posição `pos` da etapa diária da estação dada. */
export function dailyTileAt(station: number, pos: number): VanaTrilhaTile {
  const special = DAILY_SPECIAL_TILES[station]
  return special && special.pos === pos ? special.tile : 'normal'
}

/** Layout completo (índice 0 = partida, 1..8 = casas). */
export function dailyBoard(station: number): VanaTrilhaTile[] {
  return Array.from({ length: VANATRILHA_DAILY_LENGTH + 1 }, (_, i) => dailyTileAt(station, i))
}

/** Tipo de casa especial da estação (para mostrar no início da etapa). */
export function dailySpecialOf(station: number): { tile: Exclude<VanaTrilhaTile, 'normal'>; pos: number } | null {
  return DAILY_SPECIAL_TILES[station] ?? null
}

export interface TileEffect {
  bonus_gold: number
  immune_next_error: boolean
  bonus_question: boolean
}

/** Efeito imediato de parar numa casa (nenhuma das casas diárias mexe o peão). */
export function applyTileEffect(tile: VanaTrilhaTile): TileEffect {
  switch (tile) {
    case 'milagre':
      return { bonus_gold: VANATRILHA_MILAGRE_GOLD, immune_next_error: false, bonus_question: false }
    case 'elim':
      return { bonus_gold: 0, immune_next_error: true, bonus_question: false }
    case 'tabuas':
      return { bonus_gold: 0, immune_next_error: false, bonus_question: true }
    default:
      return { bonus_gold: 0, immune_next_error: false, bonus_question: false }
  }
}

/** Casas que o peão avança ao acertar a pergunta bónus das Tábuas da Lei. */
export function tabuasSteps(): number {
  return VANATRILHA_TABUAS_STEPS
}

// ────────────────────────────────────────────────────────────────────
// Perguntas
// ────────────────────────────────────────────────────────────────────

export const DIFFICULTY_ORDER: Record<VanaTrilhaDifficulty, number> = { facil: 0, media: 1, dificil: 2 }

/** Composição da etapa diária por dificuldade, em ordem crescente. */
export const DAILY_COMPOSITION: { difficulty: VanaTrilhaDifficulty; count: number }[] = [
  { difficulty: 'facil', count: 3 },
  { difficulty: 'media', count: 3 },
  { difficulty: 'dificil', count: 2 },
]

/** Hash FNV-1a de 32 bits (determinista, sem dependências). */
export function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Ordena de forma determinista por (data, id) — mesma data = mesma ordem para todos. */
export function deterministicOrder<T extends { id: string }>(items: T[], seed: string): T[] {
  return [...items].sort((a, b) => {
    const ha = hashString(`${seed}:${a.id}`)
    const hb = hashString(`${seed}:${b.id}`)
    return ha - hb || a.id.localeCompare(b.id)
  })
}

/** PRNG determinista (mulberry32) a partir de uma seed numérica. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Ordem em que as 4 opções aparecem ao jogador: `perm[i]` é o índice ORIGINAL
 * da opção mostrada na posição i. Baralhar no servidor evita que a resposta
 * certa esteja sempre na mesma posição; é determinista por (data, pergunta),
 * por isso todos veem a mesma ordem e recarregar a página não a muda.
 */
export function optionPermutation(questionId: string, date: string, size = 4): number[] {
  const rng = mulberry32(hashString(`opts:${date}:${questionId}`))
  const perm = Array.from({ length: size }, (_, i) => i)
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[perm[i], perm[j]] = [perm[j], perm[i]]
  }
  return perm
}

/**
 * Resposta proposta na pergunta bónus (Verdadeiro/Falso).
 * Metade das vezes mostra a certa, metade uma errada — determinista por data.
 */
export function bonusProposedIndex(questionId: string, date: string, correctIndex: number): number {
  const h = hashString(`bonus:${date}:${questionId}`)
  if (h % 2 === 0) return correctIndex
  const wrong = [0, 1, 2, 3].filter((i) => i !== correctIndex)
  return wrong[(h >>> 1) % wrong.length]
}

// ────────────────────────────────────────────────────────────────────
// Recompensas
// ────────────────────────────────────────────────────────────────────

/** Jornada Perfeita = etapa completa sem nenhum erro nas perguntas normais. */
export function isPerfect(status: string, mistakes: number): boolean {
  return status === 'completed' && mistakes === 0
}

/** Tem de coincidir com public.award_vanatrilha_daily_rewards. */
export function dailyRewards(status: string, mistakes: number, bonusGold: number) {
  if (status !== 'completed') return { xp: 0, gold: 0, perfect: false, bonus_gold: 0 }
  const perfect = isPerfect(status, mistakes)
  return {
    xp: VANATRILHA_REWARD_XP + (perfect ? VANATRILHA_PERFECT_BONUS_XP : 0),
    gold: VANATRILHA_REWARD_GOLD + (perfect ? VANATRILHA_PERFECT_BONUS_GOLD : 0) + bonusGold,
    perfect,
    bonus_gold: bonusGold,
  }
}

/** Formata milissegundos como m:ss (cronómetro informativo). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
