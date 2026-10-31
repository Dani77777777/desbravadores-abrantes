// Testes da normalização das respostas. Correr com `bun test`.

import { describe, expect, test } from 'bun:test'
import { checkAnswer, cleanAnswerText, normalizeAnswer } from './normalize'

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
