// Famílias do clube (quem é família de quem), à parte das contas familiares.
// Funções puras, partilhadas pelo servidor, pelo perfil e pela administração dos membros.

export type FamilyKind = 'adult' | 'child'

export type ClubFamilyMember = {
  id: string
  name: string
  avatarUrl: string | null
  gender: string | null
  section: string | null
  kind: FamilyKind
  /** É o responsável de pelo menos uma conta familiar. */
  accountOwner: boolean
  /** Perfil associado a outra conta: segue sempre o responsável. */
  managedBy: string | null
}

export type ClubFamily = {
  id: string
  name: string
  members: ClubFamilyMember[]
  invite: { code: string; expiresAt: string } | null
}

export const ADULT_AGE = 18
export const FAMILY_INVITE_DAYS = 7
export const FAMILY_CODE_LENGTH = 8
export const FAMILY_JOIN_PATH = '/familia'

export function ageOn(birthDate: string | null | undefined, today: Date = new Date()): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}/.test(birthDate)) return null
  const [y, m, d] = birthDate.slice(0, 10).split('-').map(Number)
  let age = today.getFullYear() - y
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--
  return age
}

/**
 * Adulto ou criança ao entrar na família: pela idade do perfil. Sem data, um perfil associado
 * conta como criança e uma conta própria como adulto (a família pode corrigir depois).
 */
export function defaultFamilyKind(birthDate: string | null | undefined, isAssociated: boolean, today: Date = new Date()): FamilyKind {
  const age = ageOn(birthDate, today)
  if (age === null) return isAssociated ? 'child' : 'adult'
  return age >= ADULT_AGE ? 'adult' : 'child'
}

/** "Adulto", "Adulta" ou "Criança" (o sexo vem do perfil). */
export function familyKindLabel(kind: FamilyKind, gender: string | null | undefined): string {
  if (kind === 'child') return 'Criança'
  return gender === 'f' ? 'Adulta' : 'Adulto'
}

/** Nome sugerido para a família: "Família" + último apelido. */
export function suggestedFamilyName(fullName: string | null | undefined): string {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0]
  return last ? `Família ${last}`.slice(0, 40) : 'A minha família'
}

export function cleanFamilyName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim()
  return name.length >= 2 && name.length <= 40 ? name : null
}

export function normalizeFamilyCode(raw: string): string {
  return raw.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, FAMILY_CODE_LENGTH)
}

/** Adultos primeiro, depois crianças; dentro de cada grupo por nome. */
export function sortFamilyMembers<T extends { kind: FamilyKind; name: string }>(members: T[]): T[] {
  return [...members].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'pt') : a.kind === 'adult' ? -1 : 1))
}
