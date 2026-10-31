// Testes da normalização das respostas. Correr com `bun test`.

import { describe, expect, test } from 'bun:test'
import {
  autoGroup,
  checkAnswer,
  cleanAnswerText,
  groupLabel,
  isTypoOf,
  levenshtein,
  normalizeAnswer,
  suggestGroup,
} from './normalize'

describe('normalizeAnswer', () => {
  test('minúsculas e sem acentos', () => {
    expect(normalizeAnswer('Moisés')).toBe('moises')
    expect(normalizeAnswer('MOISÉS')).toBe('moises')
    expect(normalizeAnswer('Pão')).toBe('pao')
    expect(normalizeAnswer('Coração')).toBe('coracao')
  })

  test('tira pontuação e emojis e junta espaços', () => {
    expect(normalizeAnswer('Lanterna!!! 🔦')).toBe('lanterna')
    expect(normalizeAnswer('  saco-cama ')).toBe('saco cama')
    expect(normalizeAnswer('a   Bíblia.')).toBe('biblia')
    expect(normalizeAnswer('"Tenda"')).toBe('tenda')
  })

  test('tira só o artigo inicial', () => {
    expect(normalizeAnswer('O Moisés')).toBe('moises')
    expect(normalizeAnswer('uma lanterna')).toBe('lanterna')
    expect(normalizeAnswer('Os mosquitos')).toBe('mosquitos')
    expect(normalizeAnswer('Pão e água')).toBe('pao e agua')
    expect(normalizeAnswer('Ovos')).toBe('ovos')
  })

  test('não tira plurais', () => {
    expect(normalizeAnswer('Moisés')).not.toBe(normalizeAnswer('Moisé'))
    expect(normalizeAnswer('mosquitos')).toBe('mosquitos')
  })

  test('um artigo sozinho fica', () => {
    expect(normalizeAnswer('A')).toBe('a')
    expect(normalizeAnswer('Uma')).toBe('uma')
  })

  test('só emojis dá vazio', () => {
    expect(normalizeAnswer('🔥🔥')).toBe('')
  })
})

describe('cleanAnswerText', () => {
  test('limpa espaços e caracteres de controlo, mas mantém o texto', () => {
    expect(cleanAnswerText('  O   Moisés\n')).toBe('O Moisés')
    expect(cleanAnswerText('a\tb')).toBe('a b')
  })
})

describe('checkAnswer', () => {
  test('resposta válida', () => {
    expect(checkAnswer('  Moisés ')).toEqual({ ok: true, text: 'Moisés', normalized: 'moises' })
  })

  test('vazia', () => {
    expect(checkAnswer('   ').ok).toBe(false)
  })

  test('até 40 caracteres, contados como o Postgres', () => {
    expect(checkAnswer('a'.repeat(40)).ok).toBe(true)
    expect(checkAnswer('a'.repeat(41)).ok).toBe(false)
    // 20 emojis + texto = 21 caracteres (não 41 unidades UTF-16)
    expect(checkAnswer('🔥'.repeat(20) + 'x').ok).toBe(true)
  })

  test('sem letras nem números', () => {
    expect(checkAnswer('?!').ok).toBe(false)
    expect(checkAnswer('🔥').ok).toBe(false)
  })
})

describe('erros de escrita', () => {
  test('levenshtein', () => {
    expect(levenshtein('moises', 'moizes')).toBe(1)
    expect(levenshtein('pao', 'pa')).toBe(1)
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('igual', 'igual')).toBe(0)
  })

  test('limite pelo tamanho: moizes↔moises juntam, pao↔pa não', () => {
    expect(isTypoOf('moizes', 'moises')).toBe(true)
    expect(isTypoOf('pao', 'pa')).toBe(false)
    expect(isTypoOf('leao', 'leoa')).toBe(false)
    expect(isTypoOf('marshmallows', 'marshmalows')).toBe(true)
    expect(isTypoOf('marshmallows', 'marshmlws')).toBe(false)
    expect(isTypoOf('jonas', 'jesus')).toBe(false)
  })
})

describe('autoGroup', () => {
  const a = (id: string, text: string) => ({ id, text, normalized: normalizeAnswer(text) })

  test('junta iguais e erros de escrita, separa coisas diferentes', () => {
    const groups = autoGroup([
      a('1', 'Moisés'), a('2', 'moises'), a('3', 'Moizés'), a('4', 'O Moisés'),
      a('5', 'Arão'), a('6', 'arao'),
      a('7', 'Pão'), a('8', 'pá'),
    ])
    expect(groups[0]).toEqual({ label: 'Moisés', answerIds: ['1', '2', '4', '3'] })
    expect(groups[1]).toEqual({ label: 'Arão', answerIds: ['5', '6'] })
    expect(groups.find((g) => g.answerIds.includes('7'))?.answerIds).toEqual(['7'])
    expect(groups.find((g) => g.answerIds.includes('8'))?.answerIds).toEqual(['8'])
  })

  test('respostas vazias ficam de fora', () => {
    expect(autoGroup([{ id: '1', text: '🔥', normalized: '' }])).toEqual([])
  })
})

describe('groupLabel', () => {
  test('o mais escrito ganha; nos empates, com acentos e maiúscula', () => {
    expect(groupLabel(['noe', 'noe', 'Noé'])).toBe('Noe')
    expect(groupLabel(['noe', 'Noé'])).toBe('Noé')
    expect(groupLabel(['lanterna', 'Lanterna'])).toBe('Lanterna')
  })
})

describe('suggestGroup', () => {
  const groups = [
    { id: 'g1', label: 'Lanterna', texts: ['lanterna', 'frontal', 'luz'] },
    { id: 'g2', label: 'Saco-cama', texts: ['saco cama', 'Saco de cama'] },
    { id: 'g3', label: 'Pão', texts: ['pao'] },
  ]

  test('pelo nome, por uma resposta do grupo ou com um erro de escrita', () => {
    expect(suggestGroup('A lanterna!', groups)).toBe('g1')
    expect(suggestGroup('Frontal', groups)).toBe('g1')
    expect(suggestGroup('lanterma', groups)).toBe('g1')
    expect(suggestGroup('saco de cama', groups)).toBe('g2')
  })

  test('uma contém a outra', () => {
    expect(suggestGroup('uma lanterna grande', groups)).toBe('g1')
  })

  test('nada parecido → null', () => {
    expect(suggestGroup('tenda', groups)).toBeNull()
    expect(suggestGroup('pa', groups)).toBeNull()
    expect(suggestGroup('', groups)).toBeNull()
  })
})
