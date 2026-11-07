import { describe, expect, test } from 'bun:test'
import {
  buildRanking,
  dayLabel,
  endOfDayIso,
  isHiddenFromRanking,
  isTestAccountName,
  rankingHighlights,
  rankMembers,
  toRankingMembers,
  yesterdayKey,
  type RankingMember,
} from './ranking'
import { normalizeClubState } from './club-screen'

const m = (id: string, xp: number, gold: number, section = 'rebentos', name = id): RankingMember => ({
  id,
  full_name: name,
  avatar_url: null,
  section,
  is_invested: false,
  is_leader: false,
  total_xp: xp,
  current_gold: gold,
})

describe('rankMembers', () => {
  test('ordena pela vista e desempata pelo nome', () => {
    const list = [m('b', 10, 0, 'rebentos', 'Bruno'), m('a', 10, 0, 'rebentos', 'Ana'), m('c', 5, 50)]
    expect(rankMembers(list, 'xp', 'todos').map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(rankMembers(list, 'gold', 'todos').map((x) => x.id)).toEqual(['c', 'a', 'b'])
    expect(rankMembers(list, 'combined', 'todos').map((x) => x.id)).toEqual(['c', 'a', 'b'])
  })
  test('filtra pela secção', () => {
    const list = [m('a', 1, 0, 'ticoes'), m('b', 2, 0, 'rebentos')]
    expect(rankMembers(list, 'xp', 'ticoes').map((x) => x.id)).toEqual(['a'])
  })
})

describe('buildRanking', () => {
  test('sem "antes" não há comparação', () => {
    const rows = buildRanking([m('a', 5, 0)], 'xp', 'todos')
    expect(rows[0]).toMatchObject({ rank: 1, score: 5, before: null, gained: 0, move: null, isNew: false })
  })
  test('calcula pontos ganhos e lugares subidos/descidos', () => {
    const before = [m('a', 100, 0), m('b', 50, 0), m('c', 10, 0)]
    const now = [m('a', 100, 0), m('b', 60, 0), m('c', 120, 0), m('d', 1, 0)]
    const rows = buildRanking(now, 'xp', 'todos', before)
    const byId = Object.fromEntries(rows.map((r) => [r.member.id, r]))
    expect(byId.c).toMatchObject({ rank: 1, gained: 110, move: 2 })
    expect(byId.a).toMatchObject({ rank: 2, gained: 0, move: -1 })
    expect(byId.b).toMatchObject({ rank: 3, gained: 10, move: -1 })
    expect(byId.d).toMatchObject({ rank: 4, isNew: true, move: null })
  })
  test('as posições do "antes" são dentro da mesma secção', () => {
    const before = [m('x', 500, 0, 'ticoes'), m('a', 10, 0), m('b', 20, 0)]
    const now = [m('x', 500, 0, 'ticoes'), m('a', 30, 0), m('b', 20, 0)]
    const rows = buildRanking(now, 'xp', 'rebentos', before)
    expect(rows.map((r) => [r.member.id, r.rank, r.move])).toEqual([
      ['a', 1, 1],
      ['b', 2, -1],
    ])
  })
})

describe('rankingHighlights', () => {
  test('maior subida e quem mais ganhou', () => {
    const before = [m('a', 100, 0), m('b', 90, 0), m('c', 80, 0), m('d', 70, 0)]
    const now = [m('a', 100, 0), m('b', 95, 0), m('c', 80, 0), m('d', 130, 0)]
    const { climber, gainers } = rankingHighlights(buildRanking(now, 'xp', 'todos', before))
    expect(climber?.member.id).toBe('d')
    expect(gainers.map((g) => g.member.id)).toEqual(['d', 'b'])
  })
  test('sem mudanças não há destaques', () => {
    const list = [m('a', 1, 0)]
    expect(rankingHighlights(buildRanking(list, 'xp', 'todos', list))).toEqual({ climber: null, gainers: [] })
  })
})

describe('datas', () => {
  test('ontem e fim do dia local', () => {
    const now = new Date(2026, 0, 1, 10, 0)
    expect(yesterdayKey(now)).toBe('2025-12-31')
    expect(new Date(endOfDayIso('2025-12-31')).getTime()).toBe(new Date(2025, 11, 31, 23, 59, 59, 999).getTime())
    expect(dayLabel('2025-12-31', now)).toBe('ontem')
    expect(dayLabel('2025-12-30', now)).toBe('anteontem')
    expect(dayLabel('2025-09-01', now)).toBe('1 set 2025')
    expect(dayLabel('2026-01-01', new Date(2026, 5, 1))).toBe('1 jan')
  })
})

describe('toRankingMembers', () => {
  test('converte bigint em texto e ignora lixo', () => {
    const rows = toRankingMembers([{ id: 'a', full_name: 'Ana', total_xp: '12', current_gold: 3, is_invested: true }, null, { x: 1 }])
    expect(rows).toEqual([
      { id: 'a', full_name: 'Ana', avatar_url: null, section: null, is_invested: true, is_leader: false, total_xp: 12, current_gold: 3 },
    ])
  })

  test('marca os dirigentes', () => {
    const rows = toRankingMembers([
      { id: 'a', role: 'desbravador', total_xp: 1, current_gold: 0 },
      { id: 'b', role: 'dirigente', total_xp: 2, current_gold: 0 },
    ])
    expect(rows.map((r) => r.is_leader)).toEqual([false, true])
  })
})

describe('normalizeClubState', () => {
  test('valores inválidos voltam ao padrão', () => {
    const s = normalizeClubState({ stage: 'nope', ranking: { view: 'x', section: 'marte', beforeDay: 'ontem', speed: 9 } })
    expect(s.stage).toBe('logo')
    expect(s.checkin).toEqual({ eventId: null })
    expect(s.ranking).toMatchObject({ view: 'combined', section: 'todos', beforeDay: null, speed: 'normal', scrolling: true })
  })
  test('mantém valores válidos', () => {
    const s = normalizeClubState({
      stage: 'ranking',
      ranking: { view: 'gold', section: 'ticoes', beforeDay: '2026-09-20', revealed: true, revealId: 'r1', scrolling: false, speed: 'fast' },
      checkin: { eventId: 'e1' },
      sentAt: 5,
      by: 'pc',
    })
    expect(s).toEqual({
      stage: 'ranking',
      ranking: { view: 'gold', section: 'ticoes', beforeDay: '2026-09-20', revealed: true, revealId: 'r1', scrolling: false, speed: 'fast' },
      checkin: { eventId: 'e1' },
      sentAt: 5,
      by: 'pc',
    })
  })
})

test('contas de teste e contas só com email ficam fora do ranking', () => {
  expect(isTestAccountName('Daniel Filho - testes')).toBe(true)
  expect(isTestAccountName('TESTE')).toBe(true)
  expect(isTestAccountName('Lorena Bastos')).toBe(false)
  expect(isHiddenFromRanking('Daniel Filho - testes2')).toBe(true)
  expect(isHiddenFromRanking('alguem@gmail.com')).toBe(true)
  expect(isHiddenFromRanking('  ')).toBe(true)
  expect(isHiddenFromRanking(null)).toBe(true)
  expect(isHiddenFromRanking('Celeste Miranda')).toBe(false)
})
