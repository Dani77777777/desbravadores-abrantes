import { describe, expect, test } from 'bun:test'
import { DEFAULT_CONFIG, elapsedAt, formatTimer, lapRanking, roundPhases, timerView, totalDurationMs, type TimerConfig } from './timer'

const cfg = (over: Partial<TimerConfig>): TimerConfig => ({ ...DEFAULT_CONFIG, ...over })

describe('formatTimer', () => {
  test('ao descer arredonda para cima', () => {
    expect(formatTimer(300_000, { countsDown: true })).toBe('5:00')
    expect(formatTimer(59_001, { countsDown: true })).toBe('1:00')
    expect(formatTimer(1, { countsDown: true })).toBe('0:01')
    expect(formatTimer(0, { countsDown: true })).toBe('0:00')
  })
  test('ao subir mostra décimas e horas', () => {
    expect(formatTimer(65_432, { countsDown: false, tenths: true })).toBe('1:05.4')
    expect(formatTimer(3_723_000, { countsDown: false })).toBe('1:02:03')
  })
})

describe('timerView', () => {
  test('contagem: aviso nos últimos 10 s e fim', () => {
    const c = cfg({ mode: 'countdown', durationMs: 60_000 })
    expect(timerView(c, 0).warn).toBe(false)
    expect(timerView(c, 50_500).warn).toBe(true)
    expect(timerView(c, 60_000).done).toBe(true)
    expect(timerView(c, 90_000).displayMs).toBe(0)
  })
  test('rondas: ronda, pausa, ronda, fim', () => {
    const c = cfg({ mode: 'rounds', rounds: { workMs: 60_000, restMs: 20_000, count: 2 } })
    expect(totalDurationMs(c)).toBe(140_000)
    expect(roundPhases(c.rounds).map((p) => p.kind)).toEqual(['work', 'rest', 'work'])
    expect(timerView(c, 10_000).phaseLabel).toBe('Ronda 1 de 2')
    expect(timerView(c, 65_000).phaseLabel).toBe('Pausa')
    expect(timerView(c, 65_000).displayMs).toBe(15_000)
    expect(timerView(c, 85_000).phaseLabel).toBe('Ronda 2 de 2')
    expect(timerView(c, 140_000).done).toBe(true)
  })
  test('sem pausa não cria fases de pausa', () => {
    expect(roundPhases({ workMs: 1000, restMs: 0, count: 3 }).every((p) => p.kind === 'work')).toBe(true)
  })
})

test('elapsedAt só avança a correr', () => {
  expect(elapsedAt({ running: true, elapsedMs: 1000 }, 5000, 7000)).toBe(3000)
  expect(elapsedAt({ running: false, elapsedMs: 1000 }, 5000, 7000)).toBe(1000)
})

test('lapRanking: terminadas por tempo, depois as que faltam', () => {
  const r = lapRanking(['A', 'B', 'C'], [{ team: 'C', ms: 50 }, { team: 'A', ms: 90 }])
  expect(r.map((x) => [x.team, x.place])).toEqual([['C', 1], ['A', 2], ['B', null]])
})
