// Famílias do clube: pais, mães, irmãos…, cada um Adulto ou Criança.
// Os adultos entram nas contas das crianças da mesma família; as crianças não entram em
// conta nenhuma. Funções puras, partilhadas pelo servidor, pelo perfil e pela administração.

export type FamilyKind = 'adult' | 'child'

export type ClubFamilyMember = {
  id: string
  name: string
  avatarUrl: string | null
  gender: string | null
  section: string | null
  birthDate: string | null
  kind: FamilyKind
  /** Perfil criado pela família, sem email próprio. */
  managed: boolean
}

export type ClubFamily = {
  id: string
  name: string
  members: ClubFamilyMember[]
  invite: { code: string; expiresAt: string } | null
}

export const ADULT_AGE = 18
export const FAMILY_INVITE_HOURS = 48
export const FAMILY_CODE_LENGTH = 8
export const FAMILY_JOIN_PATH = '/familia'
/** Domínio dos emails internos dos perfis criados pela família (não recebem nada). */
export const MANAGED_EMAIL_DOMAIN = 'family.desbravadores-abrantes.invalid'

export function ageOn(birthDate: string | null | undefined, today: Date = new Date()): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}/.test(birthDate)) return null
  const [y, m, d] = birthDate.slice(0, 10).split('-').map(Number)
  let age = today.getFullYear() - y
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--
  return age
}

/** Adulto ou criança ao entrar numa família com conta própria: pela idade (sem data, adulto). */
export function defaultFamilyKind(birthDate: string | null | undefined, today: Date = new Date()): FamilyKind {
  const age = ageOn(birthDate, today)
  return age === null || age >= ADULT_AGE ? 'adult' : 'child'
}

/** Um adulto entra na conta de uma criança da mesma família. Nunca o contrário, nunca entre adultos. */
export function canEnterAccount(
  from: { familyId: string; kind: FamilyKind } | null,
  to: { familyId: string; kind: FamilyKind } | null,
): boolean {
  return !!from && !!to && from.familyId === to.familyId && from.kind === 'adult' && to.kind === 'child'
}

/** Criança que já fez 18 anos (a coordenação decide quando passa a adulto). */
export function isGrownChild(member: { kind: FamilyKind; birthDate: string | null }, today: Date = new Date()): boolean {
  const age = ageOn(member.birthDate, today)
  return member.kind === 'child' && age !== null && age >= ADULT_AGE
}

export function isManagedEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${MANAGED_EMAIL_DOMAIN}`)
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
