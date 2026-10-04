// Analítica dos jogos singleplayer (aba "Jogos" do painel de gestão).
// Lê as linhas de `game_plays` (supabase-setup-game-analytics.sql): uma por
// jogo + jogador + modo + dia do clube. Sem React nem Supabase: só contas.

import { lisbonDateString } from '@/utils/vana-codigo/day'

export const SINGLEPLAYER_GAMES = ['vantur', 'vana-trilha', 'vana-codigo', 'vana-sentinela'] as const
export type SingleplayerGameId = (typeof SINGLEPLAYER_GAMES)[number]

export const MODE_LABELS: Record<SingleplayerGameId, Record<string, string>> = {
  vantur: { solo: 'Solo', mix: 'Mix', plex: 'Plex' },
  'vana-codigo': { recruta: 'Recruta', explorador: 'Explorador', mestre: 'Mestre' },
  'vana-trilha': { diario: 'Desafio diário' },
  // No VanaSentinela o "modo" é o pack (cidade da pregação).
  'vana-sentinela': { abrantes: 'Abrantes', entroncamento: 'Entroncamento', ourem: 'Ourém', tomar: 'Tomar' },
}

/**
 * O que "ganhar" e "tentativas" querem dizer em cada jogo.
 *  • VanaSentinela: não há derrota nem desistência (só se grava a ronda acabada);
 *    "ganhou" = 11 ou mais certas em 15 e `attempts` = rondas jogadas nesse dia.
 */
export type GameMetrics = {
  /** Etiqueta da taxa de "vitórias" no cartão do jogo. */
  winLabel: string
  /** Legenda da barra: [ganhou, perdeu]. */
  outcomeLabels: [string, string]
  /** Média por partida ganha ('won') ou por todas ('all'). */
  attemptsOver: 'won' | 'all'
  attemptsLabel: string
  /** false → as partidas acabam sempre (não faz sentido falar em desistências). */
  canAbandon: boolean
  /** true → só mostra os modos que alguém jogou (packs que vão aparecendo). */
  onlyPlayedModes: boolean
}

export const GAME_METRICS: Record<SingleplayerGameId, GameMetrics> = {
  vantur: { winLabel: 'vitórias', outcomeLabels: ['ganhou', 'perdeu'], attemptsOver: 'won', attemptsLabel: 'tent./vitória', canAbandon: true, onlyPlayedModes: false },
  'vana-trilha': { winLabel: 'vitórias', outcomeLabels: ['ganhou', 'perdeu'], attemptsOver: 'won', attemptsLabel: 'resp./vitória', canAbandon: true, onlyPlayedModes: false },
  'vana-codigo': { winLabel: 'vitórias', outcomeLabels: ['ganhou', 'perdeu'], attemptsOver: 'won', attemptsLabel: 'tent./vitória', canAbandon: true, onlyPlayedModes: false },
  'vana-sentinela': { winLabel: '≥ 11 certas', outcomeLabels: ['≥ 11 certas', 'menos'], attemptsOver: 'all', attemptsLabel: 'rondas/dia', canAbandon: false, onlyPlayedModes: true },
}

export const ANALYTICS_PERIODS = [7, 30] as const
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number]

export type GamePlay = {
  game_id: string
  user_id: string
  mode: string
  play_date: string // YYYY-MM-DD (Lisboa)
  started_at: string
  is_finished: boolean
  is_won: boolean
  attempts: number | null
}

/** Os `count` dias até `today` (inclusive), do mais antigo para o mais recente. */
export function lastDays(today: string, count: number, offset = 0): string[] {
  const base = new Date(`${today}T12:00:00Z`)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() - offset - (count - 1 - i))
    return d.toISOString().slice(0, 10)
  })
}

type Totals = {
  players: number
  plays: number
  finished: number
  won: number
  /** Vitórias / partidas acabadas (0–1), null sem partidas acabadas. */
  winRate: number | null
  /** Partidas acabadas / começadas (0–1): o resto ficou a meio. */
  completionRate: number | null
  /** Jogadores que jogaram em 2 ou mais dias diferentes. */
  returning: number
  /** Dias em que cada jogador jogou, em média (só quem jogou). */
  avgDaysPerPlayer: number | null
}

function totals(plays: GamePlay[]): Totals {
  const finished = plays.filter((p) => p.is_finished).length
  const won = plays.filter((p) => p.is_won).length
  const daysByUser = new Map<string, Set<string>>()
  for (const p of plays) {
    if (!daysByUser.has(p.user_id)) daysByUser.set(p.user_id, new Set())
    daysByUser.get(p.user_id)!.add(p.play_date)
  }
  const dayCounts = [...daysByUser.values()].map((d) => d.size)
  return {
    players: daysByUser.size,
    plays: plays.length,
    finished,
    won,
    winRate: finished ? won / finished : null,
    completionRate: plays.length ? finished / plays.length : null,
    returning: dayCounts.filter((n) => n >= 2).length,
    avgDaysPerPlayer: avg(dayCounts),
  }
}

export type ModeStats = { mode: string; label: string; plays: number; finished: number; won: number; avgAttempts: number | null }

export type GameStats = {
  gameId: SingleplayerGameId
  week: Totals
  previous: Totals
  /** Jogadores distintos por dia (alinhado com `days`). */
  daily: number[]
  modes: ModeStats[]
  /** Soma das tentativas (no VanaSentinela: rondas jogadas). */
  attemptsTotal: number
}

export type TopPlayer = { userId: string; days: number; plays: number; won: number; games: SingleplayerGameId[] }

export type GameAnalytics = {
  /** Tamanho do período (7 ou 30 dias); `week`/`previous` são este período e o anterior. */
  periodDays: number
  days: string[]
  week: Totals
  previous: Totals
  /** Jogadores distintos por dia, em qualquer jogo. */
  daily: number[]
  games: GameStats[]
  top: TopPlayer[]
  /** Partidas começadas por hora do dia (0–23, Lisboa). */
  hours: number[]
  /** Partidas por dia da semana (0 = segunda … 6 = domingo). */
  weekdays: number[]
}

function avg(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

function lisbonHour(iso: string): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)),
  )
}

/** 0 = segunda … 6 = domingo. */
function weekdayOf(isoDate: string): number {
  return (new Date(`${isoDate}T12:00:00Z`).getUTCDay() + 6) % 7
}

function modeLabel(gameId: SingleplayerGameId, mode: string): string {
  return MODE_LABELS[gameId][mode] ?? mode.charAt(0).toUpperCase() + mode.slice(1)
}

/** O período (7 ou 30 dias, com hoje) comparado com o período anterior do mesmo tamanho. */
export function buildGameAnalytics(rows: GamePlay[], now: Date = new Date(), periodDays: number = 7): GameAnalytics {
  const today = lisbonDateString(now)
  const days = lastDays(today, periodDays)
  const prevDays = new Set(lastDays(today, periodDays, periodDays))
  const daySet = new Set(days)

  const plays = rows.filter((r) => (SINGLEPLAYER_GAMES as readonly string[]).includes(r.game_id))
  const week = plays.filter((r) => daySet.has(r.play_date))
  const prev = plays.filter((r) => prevDays.has(r.play_date))

  const playersPerDay = (list: GamePlay[]) =>
    days.map((d) => new Set(list.filter((r) => r.play_date === d).map((r) => r.user_id)).size)

  const games: GameStats[] = SINGLEPLAYER_GAMES.map((gameId) => {
    const metrics = GAME_METRICS[gameId]
    const gWeek = week.filter((r) => r.game_id === gameId)
    // Modos conhecidos + os que aparecerem nos dados (ex.: um pack novo)
    const modeIds = [...new Set([...Object.keys(MODE_LABELS[gameId]), ...gWeek.map((r) => r.mode)])]
    const modes = modeIds
      .map((mode) => {
        const m = gWeek.filter((r) => r.mode === mode)
        const base = metrics.attemptsOver === 'won' ? m.filter((r) => r.is_won) : m
        return {
          mode,
          label: modeLabel(gameId, mode),
          plays: m.length,
          finished: m.filter((r) => r.is_finished).length,
          won: m.filter((r) => r.is_won).length,
          avgAttempts: avg(base.filter((r) => r.attempts != null).map((r) => r.attempts!)),
        }
      })
      .filter((m) => !metrics.onlyPlayedModes || m.plays > 0)
    return {
      gameId,
      week: totals(gWeek),
      previous: totals(prev.filter((r) => r.game_id === gameId)),
      daily: playersPerDay(gWeek),
      modes,
      attemptsTotal: gWeek.reduce((s, r) => s + (r.attempts ?? 0), 0),
    }
  })

  const byUser = new Map<string, GamePlay[]>()
  for (const r of week) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, [])
    byUser.get(r.user_id)!.push(r)
  }
  const top: TopPlayer[] = [...byUser.entries()]
    .map(([userId, list]) => ({
      userId,
      days: new Set(list.map((r) => r.play_date)).size,
      plays: list.length,
      won: list.filter((r) => r.is_won).length,
      games: SINGLEPLAYER_GAMES.filter((g) => list.some((r) => r.game_id === g)),
    }))
    .sort((a, b) => b.days - a.days || b.won - a.won || b.plays - a.plays)
    .slice(0, 5)

  const hours = Array.from({ length: 24 }, () => 0)
  const weekdays = Array.from({ length: 7 }, () => 0)
  for (const r of week) {
    hours[lisbonHour(r.started_at)]++
    weekdays[weekdayOf(r.play_date)]++
  }

  return { periodDays, days, week: totals(week), previous: totals(prev), daily: playersPerDay(week), games, top, hours, weekdays }
}

/** Variação em relação ao período anterior, em % arredondada (null se antes era 0). */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}
