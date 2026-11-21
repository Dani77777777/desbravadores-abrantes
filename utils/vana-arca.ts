// =============================================================================
// VanaArca — motor puro + regras de prémio + período semanal + rankings.
// Sem I/O: corre igual no browser (para jogar) e no servidor (para validar).
// Ver docs/VanaArca.md (secções 2.4, 3 e 4).
//
// O MOTOR TEM DE SER DETERMINISTA EM QUALQUER BROWSER:
//   • sem Math.random, sem Date, sem Math.sin;
//   • só inteiros (posições em 1/60000 de casa, ângulos em centésimos de grau);
//   • PRNG mulberry32 com a semente do servidor, sempre pela mesma ordem
//     (espécie, depois sentido, em cada peça nova);
//   • seno de uma tabela fixa escrita aqui (um quarto de onda, 257 valores × 10000).
// As divisões entre inteiros abaixo de 2^53 dão o mesmo resultado em qualquer
// motor de JavaScript (IEEE 754), por isso Math.floor/Math.trunc são seguros.
// =============================================================================

import type { VanaArcaEndReason, VanaArcaSettings } from '@/types/vana-arca'

// ─── Constantes do jogo ──────────────────────────────────────────────────────

export const ARCA_COLS = 10
export const ARCA_ROWS = 6 // 2 filas por andar, 1.º andar em baixo (fila 0)
export const ARCA_FLOORS = 3
export const ARCA_LIVES = 3
export const TICKS_PER_SECOND = 60
/** Vira acima de 14° (em centésimos de grau). */
export const CAPSIZE_CENTIDEG = 1400
/** +3 por cada fila completa. */
export const ROW_BONUS = 3
/** 1 casa = 60000 unidades: assim 1 casa/s = 1000 unidades por tick. */
export const POS_SCALE = 60000
/** 45 minutos por partida, no máximo. */
export const MAX_RUN_TICKS = 45 * 60 * TICKS_PER_SECOND
/** Tolerância entre os ticks e o relógio do servidor. */
export const CLOCK_TOLERANCE_SECONDS = 5

export interface ArcaSpecies {
  id: string
  name: string
  width: number
  weight: number
}

/** Valores iniciais aprovados (secção 2.3). A ordem conta: o PRNG escolhe pelo índice. */
export const ARCA_SPECIES: readonly ArcaSpecies[] = [
  { id: 'coelhos', name: 'coelhos', width: 1, weight: 1 },
  { id: 'pombas', name: 'pombas', width: 1, weight: 1 },
  { id: 'ovelhas', name: 'ovelhas', width: 2, weight: 2 },
  { id: 'cabras', name: 'cabras', width: 2, weight: 2 },
  { id: 'lobos', name: 'lobos', width: 2, weight: 2 },
  { id: 'raposas', name: 'raposas', width: 2, weight: 2 },
  { id: 'leoes', name: 'leões', width: 2, weight: 3 },
  { id: 'cavalos', name: 'cavalos', width: 2, weight: 3 },
  { id: 'zebras', name: 'zebras', width: 2, weight: 3 },
  { id: 'ursos', name: 'ursos', width: 2, weight: 4 },
  { id: 'girafas', name: 'girafas', width: 2, weight: 4 },
  { id: 'camelos', name: 'camelos', width: 3, weight: 4 },
  { id: 'hipopotamos', name: 'hipopótamos', width: 3, weight: 5 },
  { id: 'elefantes', name: 'elefantes', width: 3, weight: 6 },
]

// ─── PRNG (mulberry32) ───────────────────────────────────────────────────────

/** Semente aceite pelo motor: inteiro sem sinal de 32 bits. */
export function normalizeSeed(seed: number): number {
  return Number.isFinite(seed) ? (Math.trunc(seed) >>> 0) : 0
}

/** Avança o estado e devolve um inteiro sem sinal de 32 bits. */
function nextRandom(game: { rng: number }): number {
  const a = (game.rng + 0x6d2b79f5) | 0
  game.rng = a >>> 0
  let t = Math.imul(a ^ (a >>> 15), a | 1)
  t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t
  return (t ^ (t >>> 14)) >>> 0
}

// ─── Seno de tabela ──────────────────────────────────────────────────────────

// sin(i/256 · π/2) × 10000, i = 0..256. Escrito à mão aqui de propósito: nunca
// calcular isto em tempo de execução (Math.sin pode variar entre browsers).
const SIN_QUARTER: readonly number[] = [
  0, 61, 123, 184, 245, 307, 368, 429, 491, 552, 613, 674, 736, 797, 858, 919,
  980, 1041, 1102, 1163, 1224, 1285, 1346, 1407, 1467, 1528, 1589, 1649, 1710, 1770, 1830, 1891,
  1951, 2011, 2071, 2131, 2191, 2251, 2311, 2370, 2430, 2489, 2549, 2608, 2667, 2726, 2785, 2844,
  2903, 2962, 3020, 3078, 3137, 3195, 3253, 3311, 3369, 3427, 3484, 3542, 3599, 3656, 3713, 3770,
  3827, 3883, 3940, 3996, 4052, 4108, 4164, 4220, 4276, 4331, 4386, 4441, 4496, 4551, 4605, 4660,
  4714, 4768, 4822, 4876, 4929, 4982, 5035, 5088, 5141, 5194, 5246, 5298, 5350, 5402, 5453, 5505,
  5556, 5607, 5657, 5708, 5758, 5808, 5858, 5908, 5957, 6006, 6055, 6104, 6152, 6201, 6249, 6296,
  6344, 6391, 6438, 6485, 6532, 6578, 6624, 6670, 6716, 6761, 6806, 6851, 6895, 6940, 6984, 7028,
  7071, 7114, 7157, 7200, 7242, 7285, 7327, 7368, 7410, 7451, 7491, 7532, 7572, 7612, 7652, 7691,
  7730, 7769, 7807, 7846, 7883, 7921, 7958, 7995, 8032, 8068, 8105, 8140, 8176, 8211, 8246, 8280,
  8315, 8349, 8382, 8416, 8449, 8481, 8514, 8546, 8577, 8609, 8640, 8670, 8701, 8731, 8761, 8790,
  8819, 8848, 8876, 8904, 8932, 8960, 8987, 9013, 9040, 9066, 9092, 9117, 9142, 9167, 9191, 9215,
  9239, 9262, 9285, 9308, 9330, 9352, 9373, 9395, 9415, 9436, 9456, 9476, 9495, 9514, 9533, 9551,
  9569, 9587, 9604, 9621, 9638, 9654, 9670, 9685, 9700, 9715, 9729, 9743, 9757, 9770, 9783, 9796,
  9808, 9820, 9831, 9842, 9853, 9863, 9873, 9883, 9892, 9901, 9909, 9917, 9925, 9932, 9939, 9946,
  9952, 9958, 9963, 9968, 9973, 9977, 9981, 9985, 9988, 9991, 9993, 9995, 9997, 9998, 9999, 10000,
  10000,
]

/** Seno × 10000 de um ângulo em 1/1024 de volta. */
export function tableSin(index1024: number): number {
  const i = ((index1024 % 1024) + 1024) % 1024
  const quarter = Math.floor(i / 256)
  const r = i % 256
  if (quarter === 0) return SIN_QUARTER[r]
  if (quarter === 1) return SIN_QUARTER[256 - r]
  // 0 − x em vez de −x: nunca devolver −0.
  if (quarter === 2) return 0 - SIN_QUARTER[r]
  return 0 - SIN_QUARTER[256 - r]
}

/** Divisão inteira com truncatura para zero. */
function truncDiv(a: number, b: number): number {
  return Math.trunc(a / b)
}

/**
 * Fase das ondas: 1,6 rad/s → 1,6 / 60 / 2π × 1024 × 65536 ≈ 284819 unidades
 * de 1/65536 de índice da tabela por tick.
 */
const WAVE_PHASE_PER_TICK = 284819

/** Ondas em centésimos de grau: amplitude(t) · sin(1,6 t), amplitude = 1 + min(0,05 t, 5). */
export function waveTilt(tick: number): number {
  // 0,05°/s = 5 centésimos por 60 ticks = 1 centésimo a cada 12 ticks.
  const amplitude = 100 + Math.min(Math.floor(tick / 12), 500)
  const index = Math.floor((tick * WAVE_PHASE_PER_TICK) / 65536) % 1024
  return truncDiv(amplitude * tableSin(index), 10000)
}

/**
 * Inclinação "de carga" em centésimos de grau:
 *   10 · Σ(peso · (centro − COLS/2)) / (Σpeso + 15)
 * Com centro − 5 = (2·col + largura − 10) / 2, fica 500 · Σ(peso · (2col + larg − 10)) / (Σpeso + 15).
 * `moment` = Σ(peso · (2col + larg − 10)); `weight` = Σpeso.
 */
export function loadTilt(moment: number, weight: number): number {
  return truncDiv(500 * moment, weight + 15)
}

/** Velocidade da peça em unidades por tick: min(3 + pares·0,15, 9) casas/s. */
export function pieceSpeed(pares: number): number {
  return Math.min(3000 + 150 * pares, 9000)
}

// ─── Estado do jogo ──────────────────────────────────────────────────────────

export interface ArcaPiece {
  species: number
  width: number
  weight: number
  /** Posição da esquerda da peça, em unidades (1 casa = POS_SCALE). */
  x: number
  dir: 1 | -1
}

export interface ArcaPlaced {
  species: number
  col: number
  row: number
  width: number
  weight: number
  tick: number
}

export type ArcaDropEvent =
  | { kind: 'placed'; tick: number; placed: ArcaPlaced; rowCompleted: boolean }
  | { kind: 'lost'; tick: number; species: number; col: number; width: number }

export interface ArcaGame {
  seed: number
  rng: number
  /** Ticks já processados (o próximo a processar tem este número). */
  tick: number
  /** grid[row * COLS + col] = índice em `placed`, ou −1. */
  grid: number[]
  /** Altura de cada coluna: a primeira fila livre por cima do que lá está. */
  heights: number[]
  placed: ArcaPlaced[]
  piece: ArcaPiece
  lives: number
  pares: number
  filas: number
  score: number
  moment: number
  weight: number
  /** Inclinação do último tick processado (centésimos de grau). */
  tilt: number
  loadTilt: number
  waveTilt: number
  over: boolean
  endReason: VanaArcaEndReason | null
  /** Contagem de cada espécie a bordo (para o álbum da Fase 2). */
  species: Record<string, number>
  lastDrop: ArcaDropEvent | null
}

function spawnPiece(game: ArcaGame): ArcaPiece {
  const species = nextRandom(game) % ARCA_SPECIES.length
  const fromRight = nextRandom(game) % 2 === 1
  const { width, weight } = ARCA_SPECIES[species]
  const max = (ARCA_COLS - width) * POS_SCALE
  return { species, width, weight, x: fromRight ? max : 0, dir: fromRight ? -1 : 1 }
}

export function createArcaGame(seed: number): ArcaGame {
  const s = normalizeSeed(seed)
  const game: ArcaGame = {
    seed: s,
    rng: s,
    tick: 0,
    grid: new Array(ARCA_ROWS * ARCA_COLS).fill(-1),
    heights: new Array(ARCA_COLS).fill(0),
    placed: [],
    piece: { species: 0, width: 1, weight: 1, x: 0, dir: 1 },
    lives: ARCA_LIVES,
    pares: 0,
    filas: 0,
    score: 0,
    moment: 0,
    weight: 0,
    tilt: 0,
    loadTilt: 0,
    waveTilt: 0,
    over: false,
    endReason: null,
    species: {},
    lastDrop: null,
  }
  game.piece = spawnPiece(game)
  return game
}

/** Coluna onde a peça cai: posição arredondada, limitada a [0, COLS − largura]. */
export function dropColumn(piece: Pick<ArcaPiece, 'x' | 'width'>): number {
  const col = Math.floor((piece.x + POS_SCALE / 2) / POS_SCALE)
  return Math.max(0, Math.min(ARCA_COLS - piece.width, col))
}

/** Fila onde pousaria uma peça nesta coluna (pode ser ≥ ROWS: não cabe). */
export function landingRow(heights: readonly number[], col: number, width: number): number {
  let row = 0
  for (let c = col; c < col + width; c++) row = Math.max(row, heights[c])
  return row
}

function isRowComplete(grid: readonly number[], row: number): boolean {
  for (let c = 0; c < ARCA_COLS; c++) if (grid[row * ARCA_COLS + c] < 0) return false
  return true
}

function dropPiece(game: ArcaGame) {
  const { piece } = game
  const col = dropColumn(piece)
  const row = landingRow(game.heights, col, piece.width)

  if (row >= ARCA_ROWS) {
    // Não cabe: cai à água e perde uma vida.
    game.lives -= 1
    game.lastDrop = { kind: 'lost', tick: game.tick, species: piece.species, col, width: piece.width }
    if (game.lives <= 0) {
      game.over = true
      game.endReason = 'full'
    }
  } else {
    const placed: ArcaPlaced = { species: piece.species, col, row, width: piece.width, weight: piece.weight, tick: game.tick }
    const index = game.placed.length
    game.placed.push(placed)
    for (let c = col; c < col + piece.width; c++) {
      game.grid[row * ARCA_COLS + c] = index
      game.heights[c] = row + 1
    }
    game.pares += 1
    game.moment += piece.weight * (2 * col + piece.width - 10)
    game.weight += piece.weight
    const id = ARCA_SPECIES[piece.species].id
    game.species[id] = (game.species[id] ?? 0) + 1
    // As filas não desaparecem: só a fila onde a peça pousou pode ficar completa agora.
    const rowCompleted = isRowComplete(game.grid, row)
    if (rowCompleted) game.filas += 1
    game.score = game.pares + ROW_BONUS * game.filas
    game.lastDrop = { kind: 'placed', tick: game.tick, placed, rowCompleted }
  }

  if (!game.over) game.piece = spawnPiece(game)
}

function movePiece(game: ArcaGame) {
  const piece = game.piece
  const max = (ARCA_COLS - piece.width) * POS_SCALE
  let x = piece.x + piece.dir * pieceSpeed(game.pares)
  let dir = piece.dir
  // Ressalta nas paredes (a velocidade máxima é muito menor do que a largura).
  if (x > max) {
    x = 2 * max - x
    dir = -1
  }
  if (x < 0) {
    x = -x
    dir = 1
  }
  piece.x = Math.max(0, Math.min(max, x))
  piece.dir = dir
}

/**
 * Processa UM tick. Ordem fixa:
 *   1. se houve toque neste tick, larga a peça (e cria a seguinte);
 *   2. calcula a inclinação (carga + ondas) e vê se a arca vira;
 *   3. move a peça.
 */
export function stepArca(game: ArcaGame, tap: boolean): void {
  if (game.over) return
  if (tap) dropPiece(game)
  game.loadTilt = loadTilt(game.moment, game.weight)
  game.waveTilt = waveTilt(game.tick)
  game.tilt = game.loadTilt + game.waveTilt
  if (!game.over && Math.abs(game.tilt) > CAPSIZE_CENTIDEG) {
    game.over = true
    game.endReason = 'capsized'
  }
  if (!game.over) movePiece(game)
  game.tick += 1
}

// ─── Repetição no servidor ───────────────────────────────────────────────────

export type ReplayFailure =
  | 'bad_input'
  | 'too_long'
  | 'taps_not_increasing'
  | 'tap_out_of_range'
  | 'not_finished'
  | 'taps_after_end'

export type ReplayResult =
  | {
      ok: true
      pares: number
      filas: number
      score: number
      endReason: VanaArcaEndReason
      /** Ticks processados até ao fim (inclui o tick em que acabou). */
      endTicks: number
      species: Record<string, number>
    }
  | { ok: false; reason: ReplayFailure }

/** Valida a forma dos toques: inteiros, estritamente crescentes, dentro de [0, ticks). */
export function validateTaps(taps: unknown, ticks: unknown): ReplayFailure | null {
  if (!Array.isArray(taps) || typeof ticks !== 'number' || !Number.isInteger(ticks) || ticks < 1) return 'bad_input'
  if (ticks > MAX_RUN_TICKS) return 'too_long'
  if (taps.length > ticks) return 'bad_input'
  let prev = -1
  for (const t of taps) {
    if (typeof t !== 'number' || !Number.isInteger(t)) return 'bad_input'
    if (t < 0 || t >= ticks) return 'tap_out_of_range'
    if (t <= prev) return 'taps_not_increasing'
    prev = t
  }
  return null
}

/**
 * Corre a partida inteira a partir da semente e dos ticks dos toques. É o
 * resultado DESTA função que conta (o do cliente é só para mostrar).
 * O motor tem de acabar a partida (virar ou sem vidas) até ao último tick, e
 * nenhum toque pode vir depois do fim.
 */
export function replayArca(seed: number, taps: number[], ticks: number): ReplayResult {
  const bad = validateTaps(taps, ticks)
  if (bad) return { ok: false, reason: bad }
  const game = createArcaGame(seed)
  let i = 0
  while (!game.over && game.tick < ticks) {
    const tap = i < taps.length && taps[i] === game.tick
    if (tap) i += 1
    stepArca(game, tap)
  }
  if (!game.over || !game.endReason) return { ok: false, reason: 'not_finished' }
  if (i < taps.length) return { ok: false, reason: 'taps_after_end' }
  return {
    ok: true,
    pares: game.pares,
    filas: game.filas,
    score: game.score,
    endReason: game.endReason,
    endTicks: game.tick,
    species: { ...game.species },
  }
}

/** ticks/60 não pode passar do tempo real desde started_at + 5 s (e máximo 45 min). */
export function ticksWithinClock(ticks: number, startedAtMs: number, nowMs: number): boolean {
  if (ticks > MAX_RUN_TICKS) return false
  const elapsedSeconds = (nowMs - startedAtMs) / 1000
  return ticks / TICKS_PER_SECOND <= elapsedSeconds + CLOCK_TOLERANCE_SECONDS
}

// ─── Prémio por partida ──────────────────────────────────────────────────────

export type RewardSettings = Pick<
  VanaArcaSettings,
  'paid_runs_per_day' | 'reward_low' | 'reward_mid' | 'reward_high' | 'mid_from' | 'high_from'
>

/** XP (= Gold) pelo escalão dos pares a bordo, sem multiplicador. */
export function tierReward(pares: number, s: RewardSettings): number {
  if (pares >= s.high_from) return s.reward_high
  if (pares >= s.mid_from) return s.reward_mid
  return s.reward_low
}

/** Só as N primeiras partidas do dia têm prémio (daily_index começa em 1). */
export function isPaidRun(dailyIndex: number, s: Pick<RewardSettings, 'paid_runs_per_day'>): boolean {
  return dailyIndex >= 1 && dailyIndex <= s.paid_runs_per_day
}

/** Prémio da partida (XP = Gold), já com o multiplicador. Tem de coincidir com award_vanaarca_run_rewards. */
export function runReward(pares: number, dailyIndex: number, s: RewardSettings, multiplier = 1): number {
  if (!isPaidRun(dailyIndex, s)) return 0
  return applyMultiplier(tierReward(pares, s), multiplier)
}

/** Igual a apply_points_multiplier (arredonda para cima). */
export function applyMultiplier(amount: number, multiplier: number): number {
  if (amount <= 0 || !(multiplier > 1)) return amount
  return Math.ceil(amount * multiplier)
}

export function paidRunsLeft(runsToday: number, s: Pick<RewardSettings, 'paid_runs_per_day'>): number {
  return Math.max(0, s.paid_runs_per_day - runsToday)
}

/** "VanaArca — Partida (12 pares)" (+ " ×2" com multiplicador). Igual ao SQL. */
export function runRewardDescription(pares: number, multiplierLabel: string | null): string {
  const base = `VanaArca — Partida (${pares} ${pares === 1 ? 'par' : 'pares'})`
  return multiplierLabel ? `${base} ${multiplierLabel}` : base
}

// ─── Fuso horário (Europe/Lisbon) ────────────────────────────────────────────

const TZ = 'Europe/Lisbon'

/** "Hoje" em Lisboa, YYYY-MM-DD. */
export function lisbonDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Desvio de Lisboa em relação a UTC, em minutos, nesse instante (0 ou 60). */
function lisbonOffsetMinutes(atMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(atMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - Math.floor(atMs / 1000) * 1000) / 60000)
}

/**
 * Hora local de Lisboa → instante. Mesmo comportamento do Postgres
 * (`timestamp AT TIME ZONE 'Europe/Lisbon'`): uma hora que não existe (salto da
 * hora de verão) avança; uma hora repetida (fim da hora de verão) fica na de inverno.
 */
export function lisbonLocalToDate(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const first = guess - lisbonOffsetMinutes(guess) * 60000
  const second = guess - lisbonOffsetMinutes(first) * 60000
  return new Date(second)
}

function addDays(date: string, days: number): string {
  const t = new Date(`${date}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}

function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay()
}

/** "21:00:00" ou "21:00" → "21:00". */
export function normalizePrizeTime(time: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time.trim())
  if (!m) return '21:00'
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

/** Próximo dia/hora do prémio (Lisboa) estritamente depois de `after`. Igual a vanaarca_next_prize_at. */
export function nextPrizeAt(after: Date, weekday: number, time: string): Date {
  const t = normalizePrizeTime(time)
  const localDate = lisbonDateString(after)
  const days = (((weekday - weekdayOf(localDate)) % 7) + 7) % 7
  let candidate = lisbonLocalToDate(addDays(localDate, days), t)
  if (candidate.getTime() <= after.getTime()) candidate = lisbonLocalToDate(addDays(localDate, days + 7), t)
  return candidate
}

export interface PeriodInput {
  /** period_end do último pagamento (null na primeira semana). */
  lastPeriodEnd: Date | null
  launchedAt: Date
  scheduleChangedAt: Date | null
  weekday: number
  time: string
}

/**
 * Período aberto: do último pagamento (ou de launched_at) até à próxima ocorrência
 * do dia e hora do prémio. Se o dia/hora mudaram no admin a meio do período, conta
 * a próxima ocorrência DEPOIS da mudança (nunca paga logo a seguir a gravar).
 * Igual a vanaarca_open_period no SQL.
 */
export function openPeriod(input: PeriodInput): { start: Date; end: Date } {
  const start = input.lastPeriodEnd ?? input.launchedAt
  const from =
    input.scheduleChangedAt && input.scheduleChangedAt.getTime() > start.getTime() ? input.scheduleChangedAt : start
  return { start, end: nextPrizeAt(from, input.weekday, input.time) }
}

/** Uma partida pertence ao período em que terminou: start ≤ finished_at < end. */
export function inPeriod(finishedAt: Date, period: { start: Date; end: Date }): boolean {
  const t = finishedAt.getTime()
  return t >= period.start.getTime() && t < period.end.getTime()
}

// ─── Rankings semanais ───────────────────────────────────────────────────────

export interface RankingRun {
  userId: string
  score: number
  finishedAt: string // ISO
}

export interface PersonalRecord {
  userId: string
  score: number
  /** Quando fez essa pontuação pela primeira vez no período. */
  finishedAt: string
}

const ms = (iso: string) => new Date(iso).getTime()

/** Recorde de cada pessoa: a melhor pontuação de UMA partida (a mais antiga, em caso de empate). */
export function personalRecords(runs: readonly RankingRun[]): Map<string, PersonalRecord> {
  const out = new Map<string, PersonalRecord>()
  for (const r of runs) {
    const cur = out.get(r.userId)
    if (!cur || r.score > cur.score || (r.score === cur.score && ms(r.finishedAt) < ms(cur.finishedAt))) {
      out.set(r.userId, { userId: r.userId, score: r.score, finishedAt: r.finishedAt })
    }
  }
  return out
}

/** Ordem do top: pontuação desc; quem a fez primeiro ganha; depois o id (estável). */
export function compareRecords(a: PersonalRecord, b: PersonalRecord): number {
  if (a.score !== b.score) return b.score - a.score
  const t = ms(a.finishedAt) - ms(b.finishedAt)
  if (t !== 0) return t
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0
}

/** Classificação individual (só quem é elegível: desbravadores e dirigentes visíveis no ranking). */
export function weeklyRanking(records: Map<string, PersonalRecord>, eligible: ReadonlySet<string>): PersonalRecord[] {
  return [...records.values()].filter((r) => eligible.has(r.userId)).sort(compareRecords)
}

export interface FamilyInput {
  familyId: string
  name: string
  /** Todos os membros da família (o filtro de "ativo" é feito aqui). */
  memberIds: readonly string[]
}

export interface FamilyStanding {
  familyId: string
  name: string
  /** Soma dos recordes dos membros ativos (quem não jogou conta 0). */
  total: number
  active: number
  played: number
  /** O finished_at mais tardio entre os recordes que contam (null se ninguém jogou). */
  latestFinishedAt: string | null
  /** Membros ativos que jogaram (os que recebem o prémio se a família ganhar). */
  playedIds: string[]
}

export function familyAverage(f: Pick<FamilyStanding, 'total' | 'active'>): number {
  return f.active > 0 ? f.total / f.active : 0
}

/** Média desc (comparação exata, sem vírgula flutuante); mais membros que jogaram; quem chegou primeiro. */
export function compareFamilies(a: FamilyStanding, b: FamilyStanding): number {
  const diff = b.total * a.active - a.total * b.active
  if (diff !== 0) return diff
  if (a.played !== b.played) return b.played - a.played
  const la = a.latestFinishedAt ? ms(a.latestFinishedAt) : Number.POSITIVE_INFINITY
  const lb = b.latestFinishedAt ? ms(b.latestFinishedAt) : Number.POSITIVE_INFINITY
  if (la !== lb) return la < lb ? -1 : 1
  return a.familyId < b.familyId ? -1 : a.familyId > b.familyId ? 1 : 0
}

/**
 * Disputa de Famílias. `active` = membros elegíveis (regras do top) com movimento
 * no points_log nos últimos 90 dias. Só entram famílias com pelo menos
 * `minMembers` membros ativos.
 */
export function familyStandings(
  families: readonly FamilyInput[],
  records: Map<string, PersonalRecord>,
  active: ReadonlySet<string>,
  minMembers: number,
): FamilyStanding[] {
  const out: FamilyStanding[] = []
  for (const f of families) {
    const activeIds = f.memberIds.filter((id) => active.has(id))
    if (activeIds.length < minMembers) continue
    let total = 0
    let latest: string | null = null
    const playedIds: string[] = []
    for (const id of activeIds) {
      const rec = records.get(id)
      if (!rec) continue
      total += rec.score
      playedIds.push(id)
      if (!latest || ms(rec.finishedAt) > ms(latest)) latest = rec.finishedAt
    }
    out.push({
      familyId: f.familyId,
      name: f.name,
      total,
      active: activeIds.length,
      played: playedIds.length,
      latestFinishedAt: latest,
      playedIds,
    })
  }
  return out.sort(compareFamilies)
}

/** A família vencedora: a primeira, se alguém dela tiver jogado. */
export function familyWinner(standings: readonly FamilyStanding[]): FamilyStanding | null {
  const first = standings[0]
  return first && first.played > 0 ? first : null
}

// ─── Textos ──────────────────────────────────────────────────────────────────

export function ordinal(n: number, feminine = false): string {
  return `${n}.${feminine ? 'ª' : 'º'}`
}

/** Média para mostrar, com uma casa decimal e vírgula ("12,5"). */
export function formatAverage(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',')
}

/** "A tua família está em 2.º, a 4 pontos da 1.ª" / "A tua família vai em 1.º lugar!" */
export function familyPositionNote(standings: readonly FamilyStanding[], myFamilyId: string | null): string | null {
  if (!myFamilyId) return null
  const idx = standings.findIndex((f) => f.familyId === myFamilyId)
  if (idx < 0) return null
  if (idx === 0) {
    return standings.length > 1 ? 'A tua família vai em 1.º lugar na Disputa de Famílias!' : 'A tua família lidera a Disputa de Famílias!'
  }
  const gap = familyAverage(standings[0]) - familyAverage(standings[idx])
  const gapText = formatAverage(gap)
  const unit = gapText === '1' ? 'ponto' : 'pontos'
  return gap > 0
    ? `A tua família está em ${ordinal(idx + 1)}, a ${gapText} ${unit} da 1.ª.`
    : `A tua família está em ${ordinal(idx + 1)}, empatada em média com a 1.ª.`
}

export const WEEKDAY_NAMES = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

/** Rodar entre Génesis 6–9 no ecrã de fim (determinista pela semente). */
export const ARCA_REFERENCES = ['Génesis 6:14', 'Génesis 6:19', 'Génesis 7:1', 'Génesis 7:16', 'Génesis 8:1', 'Génesis 8:11', 'Génesis 9:13'] as const

export function referenceFor(seed: number): string {
  return ARCA_REFERENCES[normalizeSeed(seed) % ARCA_REFERENCES.length]
}
