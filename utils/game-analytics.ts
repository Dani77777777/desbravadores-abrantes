// Analítica dos jogos singleplayer (aba "Jogos" do painel de gestão).
// Lê as linhas de `game_plays` (supabase-setup-game-analytics.sql): uma por
// jogo + jogador + modo + dia do clube. Sem React nem Supabase: só contas.

import { lisbonDateString } from '@/utils/vana-codigo/day'

export const SINGLEPLAYER_GAMES = ['vantur', 'vana-trilha', 'vana-codigo'] as const
export type SingleplayerGameId = (typeof SINGLEPLAYER_GAMES)[number]

export const MODE_LABELS: Record<SingleplayerGameId, Record<string, string>> = {
  vantur: { solo: 'Solo', mix: 'Mix', plex: 'Plex' },
  'vana-codigo': { recruta: 'Recruta', explorador: 'Explorador', mestre: 'Mestre' },
  'vana-trilha': { diario: 'Desafio diário' },
}

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
}

function totals(plays: GamePlay[]): Totals {
  const finished = plays.filter((p) => p.is_finished).length
  const won = plays.filter((p) => p.is_won).length
  const daysByUser = new Map<string, Set<string>>()
  for (const p of plays) {
    if (!daysByUser.has(p.user_id)) daysByUser.set(p.user_id, new Set())
    daysByUser.get(p.user_id)!.add(p.play_date)
  }
  return {
    players: daysByUser.size,
    plays: plays.length,
    finished,
    won,
    winRate: finished ? won / finished : null,
    completionRate: plays.length ? finished / plays.length : null,
    returning: [...daysByUser.values()].filter((d) => d.size >= 2).length,
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
}

export type TopPlayer = { userId: string; days: number; plays: number; won: number; games: SingleplayerGameId[] }

export type GameAnalytics = {
  days: string[]
  week: Totals
  previous: Totals
  /** Jogadores distintos por dia, em qualquer jogo. */
  daily: number[]
  games: GameStats[]
  top: TopPlayer[]
  /** Partidas começadas por hora do dia (0–23, Lisboa). */
  hours: number[]
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

function lisbonHour(iso: string): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)),
  )
}

/** Últimos 7 dias (com hoje) comparados com os 7 anteriores. */
export function buildGameAnalytics(rows: GamePlay[], now: Date = new Date()): GameAnalytics {
  const today = lisbonDateString(now)
  const days = lastDays(today, 7)
  const prevDays = new Set(lastDays(today, 7, 7))
  const daySet = new Set(days)

  const plays = rows.filter((r) => (SINGLEPLAYER_GAMES as readonly string[]).includes(r.game_id))
  const week = plays.filter((r) => daySet.has(r.play_date))
  const prev = plays.filter((r) => prevDays.has(r.play_date))

  const playersPerDay = (list: GamePlay[]) =>
    days.map((d) => new Set(list.filter((r) => r.play_date === d).map((r) => r.user_id)).size)

  const games: GameStats[] = SINGLEPLAYER_GAMES.map((gameId) => {
    const gWeek = week.filter((r) => r.game_id === gameId)
    const modes = Object.entries(MODE_LABELS[gameId]).map(([mode, label]) => {
      const m = gWeek.filter((r) => r.mode === mode)
      const wonAttempts = m.filter((r) => r.is_won && r.attempts != null).map((r) => r.attempts!)
      return {
        mode,
        label,
        plays: m.length,
        finished: m.filter((r) => r.is_finished).length,
        won: m.filter((r) => r.is_won).length,
        avgAttempts: avg(wonAttempts),
      }
    })
    return {
      gameId,
      week: totals(gWeek),
      previous: totals(prev.filter((r) => r.game_id === gameId)),
      daily: playersPerDay(gWeek),
      modes,
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
  for (const r of week) hours[lisbonHour(r.started_at)]++

  return { days, week: totals(week), previous: totals(prev), daily: playersPerDay(week), games, top, hours }
}

/** Variação em relação à semana anterior, em % arredondada (null se antes era 0). */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}
