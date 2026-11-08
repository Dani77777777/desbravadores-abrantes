import { describe, expect, test } from 'bun:test'
import {
  cleanPrize,
  isHelperFor,
  isLeaderFor,
  MAX_PRIZE_POINTS,
  pickWinners,
  prizeLabel,
  recommendEvent,
  type RaffleEvent,
  type RaffleMember,
} from './raffle'

describe('prémio do sorteio', () => {
  const points = (xp: number, gold: number) => ({ kind: 'points' as const, name: 'ignorado', xp, gold })
  const physical = (name: string) => ({ kind: 'physical' as const, name, xp: 9, gold: 9 })

  test('o prémio físico precisa de um nome e ignora os pontos', () => {
    expect(cleanPrize(physical('  Caixa   de chocolates '))).toEqual({ kind: 'physical', name: 'Caixa de chocolates', xp: 0, gold: 0 })
    expect(cleanPrize(physical('   '))).toBeNull()
    expect(cleanPrize(physical('x'.repeat(81)))).toBeNull()
  })

  test('os pontos precisam de pelo menos um valor inteiro dentro do limite', () => {
    expect(cleanPrize(points(50, 0))).toEqual({ kind: 'points', name: '', xp: 50, gold: 0 })
    expect(cleanPrize(points(0, 0))).toBeNull()
    expect(cleanPrize(points(-5, 10))).toBeNull()
    expect(cleanPrize(points(1.5, 0))).toBeNull()
    expect(cleanPrize(points(MAX_PRIZE_POINTS + 1, 0))).toBeNull()
  })

  test('o nome do prémio mostra só o que foi dado', () => {
    expect(prizeLabel(points(50, 10))).toBe('50 XP + 10 Gold')
    expect(prizeLabel(points(0, 10))).toBe('10 Gold')
    expect(prizeLabel(physical('Boné'))).toBe('Boné')
  })
})

const member = (over: Partial<RaffleMember>): RaffleMember => ({
  id: 'x', full_name: 'X', avatar_url: null, role: 'desbravador', section: 'ticoes',
  leadership_section: null, helper_role: null, helper_section: null, ...over,
})
const event = (over: Partial<RaffleEvent>): RaffleEvent => ({
  id: 'e', title: 'E', start_at: new Date().toISOString(), end_at: null, target_section: null, is_finished: false, ...over,
})

const coord = member({ id: 'c', role: 'coordenador' })
const dirTicoes = member({ id: 'dt', role: 'dirigente', leadership_section: 'ticoes' })
const dirRebentos = member({ id: 'dr', role: 'dirigente', leadership_section: 'rebentos' })
const helperCoord = member({ id: 'hc', helper_role: 'coordenador' })
const helperTicoes = member({ id: 'ht', helper_role: 'dirigente', helper_section: 'ticoes' })
const kid = member({ id: 'k' })
const all = [coord, dirTicoes, dirRebentos, helperCoord, helperTicoes, kid]
const ids = (f: (m: RaffleMember) => boolean) => all.filter(f).map((m) => m.id)

describe('tirar dirigentes', () => {
  test('evento geral tira só coordenadores', () => {
    expect(ids((m) => isLeaderFor(m, event({})))).toEqual(['c'])
  })
  test('evento de secção tira os dirigentes dessa secção', () => {
    expect(ids((m) => isLeaderFor(m, event({ target_section: 'ticoes' })))).toEqual(['dt'])
  })
  test('sem evento tira todos os dirigentes e coordenadores', () => {
    expect(ids((m) => isLeaderFor(m, null))).toEqual(['c', 'dt', 'dr'])
  })
})

describe('tirar ajudantes', () => {
  test('evento geral tira ajudantes da coordenação', () => {
    expect(ids((m) => isHelperFor(m, event({})))).toEqual(['hc'])
  })
  test('evento de secção tira ajudantes dessa secção', () => {
    expect(ids((m) => isHelperFor(m, event({ target_section: 'ticoes' })))).toEqual(['ht'])
  })
  test('sem evento tira todos os ajudantes', () => {
    expect(ids((m) => isHelperFor(m, null))).toEqual(['hc', 'ht'])
  })
})

describe('pickWinners', () => {
  test('devolve pessoas diferentes, no máximo o tamanho da lista', () => {
    const pool = ['a', 'b', 'c', 'd', 'e']
    for (let i = 0; i < 200; i++) {
      const w = pickWinners(pool, 3)
      expect(new Set(w).size).toBe(3)
      w.forEach((x) => expect(pool).toContain(x))
    }
    expect(pickWinners(pool, 10).length).toBe(5)
  })
})

describe('recommendEvent', () => {
  const now = new Date('2026-09-20T15:00:00Z').getTime()
  test('escolhe o evento mais próximo de agora e ignora os distantes', () => {
    const evs = [
      event({ id: 'ontem', start_at: '2026-09-19T15:00:00Z' }),
      event({ id: 'hoje', start_at: '2026-09-20T14:30:00Z' }),
      event({ id: 'logo', start_at: '2026-09-20T17:00:00Z' }),
    ]
    expect(recommendEvent(evs, now)?.id).toBe('hoje')
    expect(recommendEvent([evs[0]], now)).toBeNull()
  })
  test('um evento longo a decorrer conta', () => {
    const acamp = event({ id: 'acamp', start_at: '2026-09-18T09:00:00Z', end_at: '2026-09-21T18:00:00Z' })
    expect(recommendEvent([acamp], now)?.id).toBe('acamp')
  })
})
