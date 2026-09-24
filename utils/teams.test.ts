import { expect, test } from 'bun:test'
import { conflictCount, formTeams, pairKey, revealOrder, teamsForSize, type TeamPerson } from './teams'

const person = (id: string, over: Partial<TeamPerson> = {}): TeamPerson => ({
  id, name: id, avatar: null, gender: 'm', section: 'ticoes', age: 12, leader: false, ...over,
})
const all = { age: true, gender: true, leaders: true }

test('tamanhos equilibrados (diferença máxima de 1)', () => {
  const people = Array.from({ length: 13 }, (_, i) => person(`p${i}`))
  const teams = formTeams(people, 4, all, [], { attempts: 10 })
  const sizes = teams.map((t) => t.length).sort()
  expect(sizes).toEqual([3, 3, 3, 4])
  expect(new Set(teams.flat()).size).toBe(13)
})

test('espalha rapazes/raparigas e dirigentes', () => {
  const people = [
    ...Array.from({ length: 4 }, (_, i) => person(`m${i}`, { gender: 'm' })),
    ...Array.from({ length: 4 }, (_, i) => person(`f${i}`, { gender: 'f' })),
    person('d1', { leader: true }),
    person('d2', { leader: true }),
  ]
  const teams = formTeams(people, 2, all)
  for (const t of teams) {
    expect(t.filter((id) => id.startsWith('d')).length).toBe(1)
    expect(t.filter((id) => id.startsWith('f')).length).toBe(2)
  }
})

test('mistura idades', () => {
  const people = [8, 9, 10, 11, 14, 15, 16, 17].map((age) => person(`a${age}`, { age, section: null }))
  const teams = formTeams(people, 2, { age: true, gender: false, leaders: false })
  const avgs = teams.map((t) => t.reduce((s, id) => s + Number(id.slice(1)), 0) / t.length)
  expect(Math.abs(avgs[0] - avgs[1])).toBeLessThanOrEqual(1.5)
})

test('não junta pares marcados', () => {
  const people = Array.from({ length: 6 }, (_, i) => person(`p${i}`))
  const pairs: [string, string][] = [['p0', 'p1'], ['p2', 'p3'], ['p4', 'p5']]
  const teams = formTeams(people, 2, all, pairs)
  expect(conflictCount(teams, new Set(pairs.map(([a, b]) => pairKey(a, b))))).toBe(0)
})

test('"formar de novo" não dá sempre o mesmo', () => {
  const people = [8, 9, 10, 11, 12, 13, 14, 15].map((age) => person(`a${age}`, { age }))
  const runs = new Set(Array.from({ length: 8 }, () => JSON.stringify(formTeams(people, 2, all).map((t) => [...t].sort()).sort())))
  expect(runs.size).toBeGreaterThan(1)
})

test('teamsForSize e revealOrder', () => {
  expect(teamsForSize(13, 4)).toBe(3)
  expect(teamsForSize(3, 4)).toBe(2)
  expect(revealOrder([{ members: [1, 2] }, { members: [1] }])).toEqual([[0, 0], [1, 0], [0, 1]])
})
