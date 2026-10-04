import { describe, expect, test } from 'bun:test'
import {
  autoFillCars,
  autoFillTents,
  carStops,
  genderInfo,
  pointIdOf,
  routeUrl,
  tentIssues,
  type TripCar,
  type TripMember,
  type TripPlanData,
  type TripTent,
} from './trips'

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
  const res = autoFillCars(cars, 'ida', [m('a'), m('b')], { points: [], personPoints: {} })
  expect(res.cars.find((c) => c.id === 'c1')!.passengers).toHaveLength(1)
  expect(res.cars.find((c) => c.id === 'c2')!.passengers).toHaveLength(0)
  expect(res.unplaced).toHaveLength(1)
})

describe('pontos de encontro', () => {
  const plan: Pick<TripPlanData, 'points' | 'personPoints'> = {
    points: [
      { id: 'centro', name: 'Centro', lat: 39.46, lng: -8.19 },
      { id: 'alf', name: 'Alferrarede', lat: 39.47, lng: -8.17 },
    ],
    personPoints: {
      manel: { ida: 'centro' },
      maria: { ida: 'alf', volta: 'centro' },
      rui: { ida: 'centro', volta: '' },
      ana: { ida: 'apagado' },
    },
  }
  const car = (over: Partial<TripCar> = {}): TripCar => ({
    id: 'c', direction: 'ida', driver: '', seats: 4, meetingPoint: 'Sede', departAt: '2026-10-10T08:30', passengers: [], ...over,
  })

  test('pointIdOf: volta igual à ida por defeito, "" = sem ponto, ponto apagado = sem ponto', () => {
    expect(pointIdOf(plan, 'manel', 'volta')).toBe('centro')
    expect(pointIdOf(plan, 'maria', 'volta')).toBe('centro')
    expect(pointIdOf(plan, 'rui', 'volta')).toBeNull()
    expect(pointIdOf(plan, 'ana', 'ida')).toBeNull()
    expect(pointIdOf(plan, 'ninguem', 'ida')).toBeNull()
  })

  test('carStops: agrupa por ponto, ordena pela hora e deixa quem não tem ponto no fim', () => {
    const stops = carStops(car({ passengers: ['ana', 'manel', 'maria', 'rui'], stopTimes: { alf: '08:00', centro: '08:20' } }), plan)
    expect(stops.map((s) => [s.point?.id ?? null, s.time, s.passengers])).toEqual([
      ['alf', '08:00', ['maria']],
      ['centro', '08:20', ['manel', 'rui']],
      [null, '', ['ana']],
    ])
  })

  test('autoFillCars junta quem tem o mesmo ponto', () => {
    const p2 = { points: plan.points, personPoints: { a: { ida: 'centro' }, b: { ida: 'alf' }, c: { ida: 'centro' }, d: { ida: 'alf' } } }
    const cars = [car({ id: 'x', seats: 2 }), car({ id: 'y', seats: 2 })]
    const res = autoFillCars(cars, 'ida', [m('a'), m('b'), m('c'), m('d')], p2)
    const groups = res.cars.map((c) => [...c.passengers].sort())
    expect(groups).toContainEqual(['a', 'c'])
    expect(groups).toContainEqual(['b', 'd'])
  })

  test('routeUrl: ida acaba no evento, volta começa no evento', () => {
    const stops = carStops(car({ passengers: ['manel', 'maria'], stopTimes: { alf: '08:00', centro: '08:20' } }), plan)
    const dest = { name: 'Acampamento', lat: 39.5, lng: -8.0 }
    const ida = new URL(routeUrl('ida', stops, dest)!)
    expect(ida.searchParams.get('destination')).toBe('39.5,-8')
    expect(ida.searchParams.get('waypoints')).toBe('39.47,-8.17|39.46,-8.19')
    const volta = new URL(routeUrl('volta', stops, dest)!)
    expect(volta.searchParams.get('origin')).toBe('39.5,-8')
    expect(volta.searchParams.get('destination')).toBe('39.46,-8.19')
    expect(routeUrl('ida', [], dest)).toBeNull()
  })
})

test('tentIssues: excesso e sexo errado', () => {
  const byId = new Map([m('a', { gender: 'm' }), m('b', { gender: 'f' })].map((p) => [p.id, p]))
  const issues = tentIssues(tent('T', 'm', 1, ['a', 'b']), byId)
  expect(issues.over).toBe(1)
  expect(issues.wrongGender.map((x) => x.id)).toEqual(['b'])
})
