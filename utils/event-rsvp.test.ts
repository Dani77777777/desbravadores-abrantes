import { expect, test } from 'bun:test'
import { isRsvpOpen, pendingRsvpCount, rsvpRank, summarizeRsvps } from './event-rsvp'

const start = '2026-10-10T09:00:00Z'
const t = (iso: string) => new Date(iso).getTime()

test('isRsvpOpen: prazo, início e evento fechado', () => {
  const e = { id: 'e', start_at: start, rsvp_enabled: true, rsvp_deadline: '2026-10-08T18:00:00Z' }
  expect(isRsvpOpen(e, t('2026-10-08T17:59:00Z'))).toBe(true)
  expect(isRsvpOpen(e, t('2026-10-08T18:00:00Z'))).toBe(false)
  expect(isRsvpOpen({ ...e, rsvp_deadline: null }, t('2026-10-09T12:00:00Z'))).toBe(true)
  expect(isRsvpOpen({ ...e, rsvp_deadline: null }, t(start))).toBe(false)
  expect(isRsvpOpen({ ...e, rsvp_enabled: false }, t('2026-10-01T00:00:00Z'))).toBe(false)
  expect(isRsvpOpen({ ...e, is_finished: true }, t('2026-10-01T00:00:00Z'))).toBe(false)
})

test('pendingRsvpCount conta só os abertos sem resposta', () => {
  const now = t('2026-10-01T00:00:00Z')
  const evs = [
    { id: 'a', start_at: start, rsvp_enabled: true },
    { id: 'b', start_at: start, rsvp_enabled: true },
    { id: 'c', start_at: start, rsvp_enabled: false },
  ]
  expect(pendingRsvpCount(evs, new Set(['a']), now)).toBe(1)
})

test('summarizeRsvps separa vão / não vão / sem resposta', () => {
  const rows = [
    { event_id: 'e', user_id: 'u1', going: true },
    { event_id: 'e', user_id: 'u2', going: false },
    { event_id: 'x', user_id: 'u3', going: true },
    { event_id: 'e', user_id: 'fora', going: true },
  ]
  const s = summarizeRsvps('e', rows, ['u1', 'u2', 'u3'])
  expect(s.going.sort()).toEqual(['fora', 'u1'])
  expect(s.notGoing).toEqual(['u2'])
  expect(s.noAnswer).toEqual(['u3'])
})

test('rsvpRank: vou → sem resposta → não vou', () => {
  const answers: Record<string, boolean> = { a: false, c: true }
  const order = ['a', 'b', 'c'].sort((x, y) => rsvpRank(answers[x]) - rsvpRank(answers[y]))
  expect(order).toEqual(['c', 'b', 'a'])
})
