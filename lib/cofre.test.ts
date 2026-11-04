import { describe, expect, test } from 'bun:test'
import { centsToParam, monthRange, movementSign, parseEurInput, periodLabel, signedCents, summarize, toCents, type CashMovement } from './cofre'

const mv = (id: string, kind: CashMovement['kind'], amount: number | string, reverses: string | null = null): CashMovement => ({
  id, kind, amount_eur: amount, reverses_id: reverses,
  created_at: '2026-11-04T10:00:00Z', occurred_on: '2026-11-04', method: 'numerario',
  holder_id: 'a', purchase_id: null, description: 'x', receipt_path: null, created_by: 'a',
})

describe('cêntimos', () => {
  test('toCents aceita string e number sem erros de float', () => {
    expect(toCents('0.10')).toBe(10)
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents('19.99')).toBe(1999)
    expect(toCents(null)).toBe(0)
    expect(toCents('abc')).toBe(0)
  })

  test('centsToParam', () => {
    expect(centsToParam(1250)).toBe('12.50')
    expect(centsToParam(5)).toBe('0.05')
    expect(centsToParam(100000)).toBe('1000.00')
  })

  test('parseEurInput', () => {
    expect(parseEurInput('12,5')).toBe(1250)
    expect(parseEurInput('12.50')).toBe(1250)
    expect(parseEurInput('12 €')).toBe(1200)
    expect(parseEurInput('1.234,56')).toBe(123456)
    expect(parseEurInput('1,234.56')).toBe(123456)
    expect(parseEurInput('1.234')).toBe(123400)
    expect(parseEurInput('0,01')).toBe(1)
    expect(parseEurInput('0')).toBeNull()
    expect(parseEurInput('-5')).toBeNull()
    expect(parseEurInput('1,234')).toBe(123400)
    expect(parseEurInput('abc')).toBeNull()
    expect(parseEurInput('')).toBeNull()
  })
})

describe('sinais', () => {
  test('igual a cofre_sign', () => {
    expect(movementSign('venda')).toBe(1)
    expect(movementSign('abertura')).toBe(1)
    expect(movementSign('entrada_outra')).toBe(1)
    expect(movementSign('despesa')).toBe(-1)
    expect(movementSign('reembolso')).toBe(-1)
    expect(movementSign('estorno', 'despesa')).toBe(1)
    expect(movementSign('estorno', 'venda')).toBe(-1)
    expect(movementSign('estorno', null)).toBe(0)
  })

  test('summarize com estorno', () => {
    const list = [mv('1', 'abertura', '50.00'), mv('2', 'despesa', '20.01'), mv('3', 'estorno', '20.01', '2'), mv('4', 'venda', 10)]
    const byId = new Map(list.map(m => [m.id, m]))
    expect(signedCents(list[2], byId)).toBe(2001)
    const t = summarize(list, byId)
    expect(t.inCents).toBe(5000 + 2001 + 1000)
    expect(t.outCents).toBe(2001)
    expect(t.byKind.estorno).toBe(2001)
  })
})

describe('períodos', () => {
  test('monthRange', () => {
    expect(monthRange('2026-11-04')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(monthRange('2026-01-15', -1)).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(monthRange('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })

  test('periodLabel', () => {
    expect(periodLabel('2026-11-01', '2026-11-30')).toBe('novembro de 2026')
    expect(periodLabel('2026-10-01', '2026-11-15')).toBe('01/10/2026 a 15/11/2026')
  })
})
