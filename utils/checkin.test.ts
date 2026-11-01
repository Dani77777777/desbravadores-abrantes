import { expect, test } from 'bun:test'
import { checkinOpen, checkinSlot, checkinStatus, cleanGuestName, slotIsFresh } from './checkin'

const start = '2026-11-01T15:00:00Z'
const at = (iso: string) => new Date(iso).getTime()

test('até 10 min depois do início é presente; depois é atrasado', () => {
  expect(checkinStatus(start, at('2026-11-01T14:30:00Z'))).toBe('presente')
  expect(checkinStatus(start, at('2026-11-01T15:10:00Z'))).toBe('presente')
  expect(checkinStatus(start, at('2026-11-01T15:10:01Z'))).toBe('atrasado')
})

test('as presenças abrem 3 h antes e fecham 1 h depois do fim', () => {
  const e = { start_at: start, end_at: '2026-11-01T18:00:00Z', is_finished: false }
  expect(checkinOpen(e, at('2026-11-01T11:59:00Z'))).toBe(false)
  expect(checkinOpen(e, at('2026-11-01T12:00:00Z'))).toBe(true)
  expect(checkinOpen(e, at('2026-11-01T19:00:00Z'))).toBe(true)
  expect(checkinOpen(e, at('2026-11-01T19:01:00Z'))).toBe(false)
  expect(checkinOpen({ ...e, is_finished: true }, at('2026-11-01T15:00:00Z'))).toBe(false)
  expect(checkinOpen({ ...e, end_at: null }, at('2026-11-02T02:59:00Z'))).toBe(true)
})

test('o código do QR só serve durante ~1 minuto', () => {
  const now = at('2026-11-01T15:00:00Z')
  const slot = checkinSlot(now)
  expect(slotIsFresh(slot, now)).toBe(true)
  expect(slotIsFresh(slot - 2, now)).toBe(true)
  expect(slotIsFresh(slot - 3, now)).toBe(false)
  expect(slotIsFresh(slot + 1, now)).toBe(false)
})

test('nome do convidado', () => {
  expect(cleanGuestName('  Tiago   Silva ')).toBe('Tiago Silva')
  expect(cleanGuestName('T')).toBeNull()
  expect(cleanGuestName(42)).toBeNull()
})
