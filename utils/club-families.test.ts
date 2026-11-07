import { expect, test } from 'bun:test'
import {
  ageOn, canEnterAccount, cleanFamilyName, cleanOwnEmail, defaultFamilyKind, familyKindLabel, isGrownChild, isManagedEmail,
  normalizeFamilyCode, sortFamilyMembers, suggestedFamilyName,
} from './club-families'

const today = new Date(2026, 10, 1) // 1 de novembro de 2026

test('idade conta o aniversário deste ano', () => {
  expect(ageOn('2008-11-01', today)).toBe(18)
  expect(ageOn('2008-11-02', today)).toBe(17)
  expect(ageOn(null, today)).toBeNull()
  expect(ageOn('lixo', today)).toBeNull()
})

test('adulto ou criança pela idade; sem data é adulto', () => {
  expect(defaultFamilyKind('1980-05-10', today)).toBe('adult')
  expect(defaultFamilyKind('2015-05-10', today)).toBe('child')
  expect(defaultFamilyKind(null, today)).toBe('adult')
})

test('só um adulto entra na conta de uma criança da mesma família', () => {
  const pri = { familyId: 'f1', kind: 'adult' as const }
  const juvico = { familyId: 'f1', kind: 'adult' as const }
  const lorena = { familyId: 'f1', kind: 'child' as const }
  const outra = { familyId: 'f2', kind: 'child' as const }
  expect(canEnterAccount(pri, lorena)).toBe(true)
  expect(canEnterAccount(lorena, pri)).toBe(false)
  expect(canEnterAccount(pri, juvico)).toBe(false)
  expect(canEnterAccount(pri, outra)).toBe(false)
  expect(canEnterAccount(null, lorena)).toBe(false)
})

test('criança que já fez 18 anos fica assinalada', () => {
  expect(isGrownChild({ kind: 'child', birthDate: '2008-01-01' }, today)).toBe(true)
  expect(isGrownChild({ kind: 'child', birthDate: '2012-01-01' }, today)).toBe(false)
  expect(isGrownChild({ kind: 'adult', birthDate: '2000-01-01' }, today)).toBe(false)
})

test('emails internos dos perfis da família', () => {
  expect(isManagedEmail('family-123@family.desbravadores-abrantes.invalid')).toBe(true)
  expect(isManagedEmail('pri@gmail.com')).toBe(false)
  expect(isManagedEmail(null)).toBe(false)
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

test('email próprio: limpo, válido e nunca o domínio interno', () => {
  expect(cleanOwnEmail('  Lorena@Gmail.com ')).toBe('lorena@gmail.com')
  expect(cleanOwnEmail('sem-arroba')).toBeNull()
  expect(cleanOwnEmail('a b@gmail.com')).toBeNull()
  expect(cleanOwnEmail('x@gmail')).toBeNull()
  expect(cleanOwnEmail('family-1@family.desbravadores-abrantes.invalid')).toBeNull()
})
