import { describe, expect, test } from 'bun:test'
import { buildGameAnalytics, changePercent, lastDays, type GamePlay } from './game-analytics'

const NOW = new Date('2026-10-01T15:00:00Z') // quinta, 16:00 em Lisboa

const play = (over: Partial<GamePlay>): GamePlay => ({
  game_id: 'vantur',
  user_id: 'a',
  mode: 'solo',
  play_date: '2026-10-01',
  started_at: '2026-10-01T17:30:00Z',
  is_finished: true,
  is_won: true,
  attempts: 4,
  ...over,
})

describe('lastDays', () => {
  test('7 dias até hoje e os 7 anteriores', () => {
    expect(lastDays('2026-10-01', 7)).toEqual([
      '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01',
    ])
    expect(lastDays('2026-10-01', 7, 7)[6]).toBe('2026-09-24')
  })
})

describe('buildGameAnalytics', () => {
  const rows: GamePlay[] = [
    play({}),
    play({ mode: 'mix', is_won: false, attempts: 6 }),
    play({ user_id: 'b', play_date: '2026-09-30', is_finished: false, is_won: false, attempts: 2 }),
    play({ user_id: 'a', play_date: '2026-09-28', game_id: 'vana-codigo', mode: 'mestre', attempts: null }),
    play({ user_id: 'c', play_date: '2026-09-20' }), // semana anterior
    play({ user_id: 'd', play_date: '2026-09-10' }), // fora das duas semanas
    play({ game_id: 'vana-quest' }), // não é singleplayer
  ]
  const a = buildGameAnalytics(rows, NOW)

  test('totais da semana', () => {
    expect(a.week.players).toBe(2)
    expect(a.week.plays).toBe(4)
    expect(a.week.finished).toBe(3)
    expect(a.week.won).toBe(2)
    expect(a.week.winRate).toBeCloseTo(2 / 3)
    expect(a.week.completionRate).toBeCloseTo(3 / 4)
    expect(a.week.returning).toBe(1) // "a" jogou em 2 dias
    expect(a.previous.players).toBe(1)
  })

  test('jogadores por dia e por jogo', () => {
    expect(a.daily).toEqual([0, 0, 0, 1, 0, 1, 1])
    const vantur = a.games.find((g) => g.gameId === 'vantur')!
    expect(vantur.daily).toEqual([0, 0, 0, 0, 0, 1, 1])
    const solo = vantur.modes.find((m) => m.mode === 'solo')!
    expect(solo).toMatchObject({ plays: 2, finished: 1, won: 1, avgAttempts: 4 })
    const mestre = a.games.find((g) => g.gameId === 'vana-codigo')!.modes.find((m) => m.mode === 'mestre')!
    expect(mestre.avgAttempts).toBeNull() // linha recuperada dos pontos, sem tentativas
  })

  test('top: mais dias primeiro', () => {
    expect(a.top.map((t) => t.userId)).toEqual(['a', 'b'])
    expect(a.top[0].games).toEqual(['vantur', 'vana-codigo'])
  })

  test('horas em Lisboa', () => {
    expect(a.hours[18]).toBe(4) // 17:30 UTC = 18:30 em Lisboa (verão)
  })
})

test('changePercent', () => {
  expect(changePercent(15, 10)).toBe(50)
  expect(changePercent(5, 10)).toBe(-50)
  expect(changePercent(3, 0)).toBeNull()
})
