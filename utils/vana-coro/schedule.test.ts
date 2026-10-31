// Testes do ritmo da "Pergunta da Semana". Correr com `bun test`.

import { describe, expect, test } from 'bun:test'
import {
  NORMAL_RHYTHM,
  TURBO_RHYTHM,
  closingFor,
  isQuestionOpen,
  lisbonAt,
  nextOpening,
  questionStatus,
  scheduleQueue,
} from './schedule'

describe('lisbonAt', () => {
  test('18:00 de Lisboa no verão é 17:00 UTC', () => {
    expect(lisbonAt('2026-07-10', 18).toISOString()).toBe('2026-07-10T17:00:00.000Z')
  })
  test('18:00 de Lisboa no inverno é 18:00 UTC', () => {
    expect(lisbonAt('2026-12-10', 18).toISOString()).toBe('2026-12-10T18:00:00.000Z')
  })
  test('no dia da mudança da hora (25 out 2026)', () => {
    expect(lisbonAt('2026-10-25', 18).toISOString()).toBe('2026-10-25T18:00:00.000Z')
    expect(lisbonAt('2026-03-29', 18).toISOString()).toBe('2026-03-29T17:00:00.000Z')
  })
})

describe('nextOpening', () => {
  test('antes das 18:00 abre hoje', () => {
    expect(nextOpening(new Date('2026-12-10T10:00:00Z')).toISOString()).toBe('2026-12-10T18:00:00.000Z')
  })
  test('depois das 18:00 abre amanhã', () => {
    expect(nextOpening(new Date('2026-12-10T18:30:00Z')).toISOString()).toBe('2026-12-11T18:00:00.000Z')
  })
  test('às 23:30 de Lisboa no verão (22:30 UTC) é amanhã', () => {
    expect(nextOpening(new Date('2026-07-10T22:30:00Z')).toISOString()).toBe('2026-07-11T17:00:00.000Z')
  })
})

describe('scheduleQueue', () => {
  const now = new Date('2026-10-20T09:00:00Z')
  const q = (id: string, created: string, opens: string | null = null) => ({ id, created_at: created, opens_at: opens })

  test('sem nada agendado: a primeira abre nas próximas 18:00 e as outras de 7 em 7 dias', () => {
    const slots = scheduleQueue([q('b', '2026-10-02'), q('a', '2026-10-01'), q('c', '2026-10-03')], NORMAL_RHYTHM, now)
    expect(slots.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(slots[0].opens_at).toBe('2026-10-20T17:00:00.000Z')
    // Atravessa a mudança da hora a 25 de outubro: continua às 18:00 de Lisboa.
    expect(slots[1].opens_at).toBe('2026-10-27T18:00:00.000Z')
    expect(slots[2].opens_at).toBe('2026-11-03T18:00:00.000Z')
    expect(slots[0].closes_at).toBe('2026-10-27T18:00:00.000Z')
  })

  test('continua a partir da última pergunta já agendada', () => {
    const slots = scheduleQueue(
      [q('x', '2026-09-01', '2026-11-10T18:00:00.000Z'), q('a', '2026-10-01')],
      NORMAL_RHYTHM,
      now,
    )
    expect(slots).toEqual([{ id: 'a', opens_at: '2026-11-17T18:00:00.000Z', closes_at: '2026-11-24T18:00:00.000Z' }])
  })

  test('se a última abertura foi há muito tempo, abre nas próximas 18:00', () => {
    const slots = scheduleQueue([q('x', '2026-01-01', '2026-02-01T18:00:00.000Z'), q('a', '2026-10-01')], NORMAL_RHYTHM, now)
    expect(slots[0].opens_at).toBe('2026-10-20T17:00:00.000Z')
  })

  test('modo turbo: de 3 em 3 dias, abertas 5', () => {
    const slots = scheduleQueue([q('a', '2026-10-01'), q('b', '2026-10-02')], TURBO_RHYTHM, now)
    expect(slots[0].opens_at).toBe('2026-10-20T17:00:00.000Z')
    expect(slots[0].closes_at).toBe('2026-10-25T18:00:00.000Z')
    expect(slots[1].opens_at).toBe('2026-10-23T17:00:00.000Z')
  })

  test('sem perguntas na fila não faz nada', () => {
    expect(scheduleQueue([q('x', '2026-09-01', '2026-11-10T18:00:00.000Z')], NORMAL_RHYTHM, now)).toEqual([])
  })
})

describe('questionStatus', () => {
  const now = new Date('2026-10-20T12:00:00Z')
  const base = { opens_at: null, closes_at: null, review_status: 'pending', used_at: null }

  test('estados pela ordem certa', () => {
    expect(questionStatus(base, now)).toBe('queued')
    expect(questionStatus({ ...base, opens_at: '2026-10-21T17:00:00Z', closes_at: '2026-10-28T18:00:00Z' }, now)).toBe('scheduled')
    expect(questionStatus({ ...base, opens_at: '2026-10-19T17:00:00Z', closes_at: '2026-10-26T18:00:00Z' }, now)).toBe('open')
    expect(questionStatus({ ...base, opens_at: '2026-10-01T17:00:00Z', closes_at: '2026-10-08T17:00:00Z' }, now)).toBe('review')
    expect(questionStatus({ ...base, opens_at: '2026-10-01T17:00:00Z', closes_at: '2026-10-08T17:00:00Z', review_status: 'ready' }, now)).toBe('ready')
    expect(questionStatus({ ...base, review_status: 'ready', used_at: '2026-10-10T20:00:00Z' }, now)).toBe('played')
  })

  test('aberta inclui a abertura e exclui o fecho', () => {
    const q = { opens_at: '2026-10-20T12:00:00Z', closes_at: '2026-10-21T12:00:00Z' }
    expect(isQuestionOpen(q, new Date('2026-10-20T12:00:00Z'))).toBe(true)
    expect(isQuestionOpen(q, new Date('2026-10-21T12:00:00Z'))).toBe(false)
  })
})

describe('closingFor', () => {
  test('7 dias depois, às 18:00 de Lisboa', () => {
    expect(closingFor(new Date('2026-10-20T17:00:00Z'), 7).toISOString()).toBe('2026-10-27T18:00:00.000Z')
  })
})
