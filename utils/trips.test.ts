import { describe, expect, test } from 'bun:test'
import { autoFillCars, autoFillTents, genderInfo, tentIssues, type TripCar, type TripMember, type TripTent } from './trips'

const m = (id: string, over: Partial<TripMember> = {}): TripMember => ({
  id, full_name: id, avatar_url: null, role: 'desbravador', section: 'ticoes', leadership_section: null,
  helper_role: null, helper_section: null, birth_date: null, gender: null, ...over,
})
const tent = (id: string, kind: TripTent['kind'], capacity: number, members: string[] = []): TripTent => ({
  id, name: id, kind, capacity, members: members.map((x) => ({ id: x, responsible: false })),
})

test('genderInfo: confirmado ganha ao palpite', () => {
  expect(genderInfo({ full_name: 'Maria Silva', gender: null })).toEqual({ gender: 'f', confirmed: false })
  expect(genderInfo({ full_name: 'Maria Silva', gender: 'm' })).toEqual({ gender: 'm', confirmed: true })
})

describe('autoFillTents', () => {
  test('separa por sexo e ignora tendas mistas', () => {
    const people = [m('a', { gender: 'm' }), m('b', { gender: 'f' }), m('c', { gender: 'm' })]
    const res = autoFillTents([tent('M', 'm', 4), tent('F', 'f', 4), tent('X', 'misto', 4)], people)
    const byId = Object.fromEntries(res.tents.map((t) => [t.id, t.members.map((x) => x.id).sort()]))
    expect(byId).toEqual({ M: ['a', 'c'], F: ['b'], X: [] })
    expect(res.unplaced).toEqual([])
  })
  test('junta a mesma secção e diz quem ficou sem lugar', () => {
    const people = [
      m('r1', { gender: 'm', section: 'rebentos' }),
      m('t1', { gender: 'm', section: 'ticoes' }),
      m('r2', { gender: 'm', section: 'rebentos' }),
      m('t2', { gender: 'm', section: 'ticoes' }),
      m('t3', { gender: 'm', section: 'ticoes' }),
    ]
    const res = autoFillTents([tent('A', 'm', 2), tent('B', 'm', 2)], people)
    const groups = res.tents.map((t) => t.members.map((x) => x.id).sort())
    expect(groups).toContainEqual(['r1', 'r2'])
    expect(groups).toContainEqual(['t1', 't2'])
    expect(res.unplaced.map((p) => p.id)).toEqual(['t3'])
  })
  test('mantém quem já lá estava', () => {
    const res = autoFillTents([tent('A', 'f', 3, ['x'])], [m('y', { gender: 'f' })])
    expect(res.tents[0].members.map((x) => x.id)).toEqual(['x', 'y'])
  })
})

test('autoFillCars respeita os lugares e a direção', () => {
  const cars: TripCar[] = [
    { id: 'c1', direction: 'ida', driver: '', seats: 1, meetingPoint: '', departAt: '', passengers: [] },
    { id: 'c2', direction: 'volta', driver: '', seats: 3, meetingPoint: '', departAt: '', passengers: [] },
  ]
  const res = autoFillCars(cars, 'ida', [m('a'), m('b')])
  expect(res.cars.find((c) => c.id === 'c1')!.passengers).toHaveLength(1)
  expect(res.cars.find((c) => c.id === 'c2')!.passengers).toHaveLength(0)
  expect(res.unplaced).toHaveLength(1)
})

test('tentIssues: excesso e sexo errado', () => {
  const byId = new Map([m('a', { gender: 'm' }), m('b', { gender: 'f' })].map((p) => [p.id, p]))
  const issues = tentIssues(tent('T', 'm', 1, ['a', 'b']), byId)
  expect(issues.over).toBe(1)
  expect(issues.wrongGender.map((x) => x.id)).toEqual(['b'])
})
