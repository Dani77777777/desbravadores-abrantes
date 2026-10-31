// Testes do quadro (§3.1). Correr com `bun test`.

import { describe, expect, test } from 'bun:test'
import { checkBoard, computeBoard, normalizePoints, type BoardGroupInput } from './board'

const people = (n: number, prefix = 'p') => Array.from({ length: n }, (_, i) => `${prefix}${i}`)
const group = (id: string, n: number, extra: Partial<BoardGroupInput> = {}): BoardGroupInput => ({
  id,
  label: id,
  emoji: null,
  hidden: false,
  respondentKeys: people(n),
  ...extra,
})

describe('normalizePoints', () => {
  test('exemplo da spec: 7·5·4·3·2 → 33·24·19·14·10', () => {
    expect(normalizePoints([7, 5, 4, 3, 2])).toEqual([33, 24, 19, 14, 10])
  })

  test('soma sempre 100, mesmo com arredondamentos', () => {
    for (const votes of [[1, 1, 1], [3, 3, 3, 3, 3], [10, 2, 2], [5, 4, 3, 2, 2]]) {
      expect(normalizePoints(votes).reduce((s, p) => s + p, 0)).toBe(100)
    }
    expect(normalizePoints([1, 1, 1])).toEqual([34, 33, 33])
  })
})

describe('computeBoard', () => {
  test('até 5 grupos, por votos, com 2+ pessoas', () => {
    const board = computeBoard([
      group('d', 3), group('a', 7), group('f', 1), group('b', 5), group('e', 2), group('c', 4), group('g', 2),
    ])
    expect(board.map((e) => e.label)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(board.map((e) => e.points)).toEqual([33, 24, 19, 14, 10])
    expect(board.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5])
  })

  test('a mesma pessoa duas vezes no mesmo grupo conta 1', () => {
    const board = computeBoard([group('a', 0, { respondentKeys: ['p1', 'p1', 'p2'] }), group('b', 3)])
    expect(board.find((e) => e.label === 'a')?.respondents).toBe(2)
  })

  test('grupos escondidos ficam de fora; empates pelo nome', () => {
    const board = computeBoard([group('Zebra', 3), group('Abelha', 3), group('Lixo', 9, { hidden: true })])
    expect(board.map((e) => e.label)).toEqual(['Abelha', 'Zebra'])
  })
})

describe('checkBoard', () => {
  test('pronta com 12+ pessoas e 3+ grupos válidos', () => {
    expect(checkBoard([group('a', 6), group('b', 4), group('c', 2)], 12).problems).toEqual([])
  })

  test('avisa o que falta', () => {
    const { problems } = checkBoard([group('a', 6), group('b', 2), group('c', 1)], 9)
    expect(problems).toEqual(['Só 9 pessoas: mínimo 12.', 'Só 2 grupos válidos (com 2+ pessoas): mínimo 3.'])
  })
})
