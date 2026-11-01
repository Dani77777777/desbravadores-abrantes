import { expect, test } from 'bun:test'
import {
  ageOn, cleanFamilyName, defaultFamilyKind, familyKindLabel, normalizeFamilyCode, sortFamilyMembers, suggestedFamilyName,
} from './club-families'

const today = new Date(2026, 10, 1) // 1 de novembro de 2026

test('idade conta o aniversário deste ano', () => {
  expect(ageOn('2008-11-01', today)).toBe(18)
  expect(ageOn('2008-11-02', today)).toBe(17)
  expect(ageOn(null, today)).toBeNull()
  expect(ageOn('lixo', today)).toBeNull()
})

test('adulto ou criança pela idade; sem data depende de ser perfil associado', () => {
  expect(defaultFamilyKind('1980-05-10', false, today)).toBe('adult')
  expect(defaultFamilyKind('2015-05-10', false, today)).toBe('child')
  // Irmã mais velha responsável pelas contas dos irmãos: adulta pela idade.
  expect(defaultFamilyKind('2004-01-01', false, today)).toBe('adult')
  expect(defaultFamilyKind(null, true, today)).toBe('child')
  expect(defaultFamilyKind(null, false, today)).toBe('adult')
})

test('etiquetas e nome sugerido', () => {
  expect(familyKindLabel('adult', 'f')).toBe('Adulta')
  expect(familyKindLabel('adult', 'm')).toBe('Adulto')
  expect(familyKindLabel('child', 'f')).toBe('Criança')
  expect(suggestedFamilyName('Adalgiza Maria Costa')).toBe('Família Costa')
  expect(suggestedFamilyName('Juvico')).toBe('Família Juvico')
  expect(suggestedFamilyName('')).toBe('A minha família')
})

test('nome e código limpos', () => {
  expect(cleanFamilyName('  Família   Costa ')).toBe('Família Costa')
  expect(cleanFamilyName('x')).toBeNull()
  expect(normalizeFamilyCode(' ab-cd 12ef ')).toBe('ABCD12EF')
})

test('adultos primeiro', () => {
  const sorted = sortFamilyMembers([
    { kind: 'child' as const, name: 'Ana' },
    { kind: 'adult' as const, name: 'Zé' },
    { kind: 'adult' as const, name: 'Bia' },
  ])
  expect(sorted.map((m) => m.name)).toEqual(['Bia', 'Zé', 'Ana'])
})
