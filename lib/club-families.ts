import crypto from 'crypto'
import { createServiceClient } from '@/utils/supabase/service'
import {
  FAMILY_CODE_LENGTH, defaultFamilyKind, sortFamilyMembers, type ClubFamily, type ClubFamilyMember, type FamilyKind,
} from '@/utils/club-families'

type Service = ReturnType<typeof createServiceClient>

/** Família do clube a que a pessoa pertence (no máximo uma). */
export async function familyIdOf(service: Service, userId: string): Promise<string | null> {
  const { data } = await service.from('club_family_members').select('family_id').eq('user_id', userId).maybeSingle()
  return (data?.family_id as string | undefined) ?? null
}

/** Responsável da conta, se a pessoa for um perfil associado. */
export async function accountOwnerOf(service: Service, userId: string): Promise<string | null> {
  const { data } = await service.from('family_account_links').select('owner_user_id').eq('associated_user_id', userId).maybeSingle()
  return (data?.owner_user_id as string | undefined) ?? null
}

/** Perfis associados às contas indicadas (entram e saem da família com o responsável). */
export async function associatedOf(service: Service, ownerIds: string[]): Promise<string[]> {
  if (ownerIds.length === 0) return []
  const { data } = await service.from('family_account_links').select('associated_user_id').in('owner_user_id', ownerIds)
  return (data ?? []).map((l) => l.associated_user_id as string)
}

export function makeFamilyCode(): string {
  // Sem 0/O e 1/I para se ler bem ao ditar o código.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.randomBytes(FAMILY_CODE_LENGTH)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

/** Carrega as famílias (todas, ou só as indicadas) com os membros, etiquetas e convite ativo. */
export async function loadClubFamilies(service: Service, familyIds?: string[]): Promise<ClubFamily[]> {
  if (familyIds && familyIds.length === 0) return []
  let familiesQuery = service.from('club_families').select('id, name').order('name')
  if (familyIds) familiesQuery = familiesQuery.in('id', familyIds)
  const { data: families } = await familiesQuery
  const ids = (families ?? []).map((f) => f.id as string)
  if (ids.length === 0) return []

  const [{ data: rows }, { data: invites }] = await Promise.all([
    service.from('club_family_members').select('family_id, user_id, kind').in('family_id', ids),
    service.from('club_family_invites').select('family_id, code, expires_at').in('family_id', ids).gt('expires_at', new Date().toISOString()),
  ])
  const userIds = [...new Set((rows ?? []).map((r) => r.user_id as string))]
  const [{ data: profiles }, { data: owned }, { data: managed }] = userIds.length
    ? await Promise.all([
        service.from('profiles').select('id, full_name, avatar_url, gender, section').in('id', userIds),
        service.from('family_account_links').select('owner_user_id').in('owner_user_id', userIds),
        service.from('family_account_links').select('owner_user_id, associated_user_id').in('associated_user_id', userIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  // Nomes dos responsáveis (podem não estar na família).
  const ownerIds = [...new Set((managed ?? []).map((l) => l.owner_user_id as string))]
  const { data: owners } = ownerIds.length
    ? await service.from('profiles').select('id, full_name').in('id', ownerIds)
    : { data: [] }
  const ownerName = new Map((owners ?? []).map((p) => [p.id as string, (p.full_name as string) || 'Conta familiar']))
  const managedBy = new Map((managed ?? []).map((l) => [l.associated_user_id as string, ownerName.get(l.owner_user_id as string) ?? null]))
  const owners_ = new Set((owned ?? []).map((l) => l.owner_user_id as string))
  const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]))
  const inviteByFamily = new Map((invites ?? []).map((i) => [i.family_id as string, { code: i.code as string, expiresAt: i.expires_at as string }]))

  return (families ?? []).map((f) => {
    const members: ClubFamilyMember[] = (rows ?? [])
      .filter((r) => r.family_id === f.id)
      .map((r) => {
        const p = profileById.get(r.user_id as string)
        return {
          id: r.user_id as string,
          name: (p?.full_name as string) || 'Sem nome',
          avatarUrl: (p?.avatar_url as string | null) ?? null,
          gender: (p?.gender as string | null) ?? null,
          section: (p?.section as string | null) ?? null,
          kind: r.kind as FamilyKind,
          accountOwner: owners_.has(r.user_id as string),
          managedBy: managedBy.get(r.user_id as string) ?? null,
        }
      })
    return { id: f.id as string, name: f.name as string, members: sortFamilyMembers(members), invite: inviteByFamily.get(f.id as string) ?? null }
  })
}

/**
 * Junta pessoas a uma família. Os perfis associados de cada uma vêm atrás (se ainda não
 * tiverem família). Tudo ou nada: se alguém pedido já está noutra família, não junta ninguém
 * e devolve os nomes em `conflicts`.
 */
export async function addToClubFamily(
  service: Service,
  familyId: string,
  userIds: string[],
  addedBy: string,
): Promise<{ error?: string; conflicts?: string[]; added?: number }> {
  const requested = [...new Set(userIds)]
  if (requested.length === 0) return { added: 0 }
  const everyone = [...new Set([...requested, ...(await associatedOf(service, requested))])]

  const { data: existing } = await service.from('club_family_members').select('user_id, family_id').in('user_id', everyone)
  const familyOf = new Map((existing ?? []).map((r) => [r.user_id as string, r.family_id as string]))
  const conflictIds = requested.filter((id) => familyOf.has(id) && familyOf.get(id) !== familyId)
  if (conflictIds.length) {
    const { data: names } = await service.from('profiles').select('full_name').in('id', conflictIds)
    return { conflicts: (names ?? []).map((n) => (n.full_name as string) || 'Sem nome') }
  }

  const toAdd = everyone.filter((id) => !familyOf.has(id))
  if (toAdd.length === 0) return { added: 0 }
  const [{ data: profiles }, { data: links }] = await Promise.all([
    service.from('profiles').select('id, birth_date').in('id', toAdd),
    service.from('family_account_links').select('associated_user_id').in('associated_user_id', toAdd),
  ])
  const associated = new Set((links ?? []).map((l) => l.associated_user_id as string))
  const rows = (profiles ?? []).map((p) => ({
    family_id: familyId,
    user_id: p.id as string,
    kind: defaultFamilyKind(p.birth_date as string | null, associated.has(p.id as string)),
    added_by: addedBy,
  }))
  const { error } = await service.from('club_family_members').upsert(rows, { onConflict: 'user_id', ignoreDuplicates: true })
  if (error) return { error: 'Não foi possível juntar à família. Tenta novamente.' }
  return { added: rows.length }
}

/**
 * Depois de criar ou associar uma conta familiar: se o responsável já tem família no clube,
 * o novo perfil associado entra nela (se ainda não tiver outra).
 */
export async function syncAssociatedIntoFamily(service: Service, ownerId: string): Promise<void> {
  const familyId = await familyIdOf(service, ownerId)
  if (!familyId) return
  const children = await associatedOf(service, [ownerId])
  const { data: existing } = children.length
    ? await service.from('club_family_members').select('user_id').in('user_id', children)
    : { data: [] }
  const taken = new Set((existing ?? []).map((r) => r.user_id as string))
  const free = children.filter((id) => !taken.has(id))
  if (free.length) await addToClubFamily(service, familyId, free, ownerId)
}

/** Grupos de pessoas que são da mesma família do clube (para o Formador de equipas). */
export async function clubFamilyGroups(service: Service): Promise<string[][]> {
  const { data } = await service.from('club_family_members').select('family_id, user_id')
  const byFamily = new Map<string, string[]>()
  for (const r of data ?? []) byFamily.set(r.family_id as string, [...(byFamily.get(r.family_id as string) ?? []), r.user_id as string])
  return [...byFamily.values()]
}
