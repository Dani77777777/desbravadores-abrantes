import crypto from 'crypto'
import { createServiceClient } from '@/utils/supabase/service'
import {
  FAMILY_CODE_LENGTH, defaultFamilyKind, sortFamilyMembers, type ClubFamily, type ClubFamilyMember, type FamilyKind,
} from '@/utils/club-families'

type Service = ReturnType<typeof createServiceClient>

export type FamilyPlace = { familyId: string; kind: FamilyKind; managed: boolean }

/** A família de uma pessoa (no máximo uma) e se é adulto ou criança nela. */
export async function familyPlaceOf(service: Service, userId: string): Promise<FamilyPlace | null> {
  const { data } = await service.from('club_family_members').select('family_id, kind, managed').eq('user_id', userId).maybeSingle()
  return data ? { familyId: data.family_id as string, kind: data.kind as FamilyKind, managed: !!data.managed } : null
}

/** As crianças da família (para um adulto: as contas em que pode entrar). */
export async function childrenOf(service: Service, familyId: string): Promise<string[]> {
  const { data } = await service.from('club_family_members').select('user_id').eq('family_id', familyId).eq('kind', 'child')
  return (data ?? []).map((r) => r.user_id as string)
}

export async function adultsOf(service: Service, familyId: string): Promise<string[]> {
  const { data } = await service.from('club_family_members').select('user_id').eq('family_id', familyId).eq('kind', 'adult')
  return (data ?? []).map((r) => r.user_id as string)
}

export function makeFamilyCode(): string {
  // Sem 0/O e 1/I para se ler bem ao ditar o código.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.randomBytes(FAMILY_CODE_LENGTH)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

/** Carrega as famílias (todas, ou só as indicadas) com os membros e o convite ativo. */
export async function loadClubFamilies(service: Service, familyIds?: string[]): Promise<ClubFamily[]> {
  if (familyIds && familyIds.length === 0) return []
  let familiesQuery = service.from('club_families').select('id, name').order('name')
  if (familyIds) familiesQuery = familiesQuery.in('id', familyIds)
  const { data: families } = await familiesQuery
  const ids = (families ?? []).map((f) => f.id as string)
  if (ids.length === 0) return []

  const [{ data: rows }, { data: invites }] = await Promise.all([
    service.from('club_family_members').select('family_id, user_id, kind, managed').in('family_id', ids),
    service.from('club_family_invites').select('family_id, code, expires_at').in('family_id', ids).gt('expires_at', new Date().toISOString()),
  ])
  const userIds = [...new Set((rows ?? []).map((r) => r.user_id as string))]
  const { data: profiles } = userIds.length
    ? await service.from('profiles').select('id, full_name, avatar_url, gender, section, birth_date').in('id', userIds)
    : { data: [] }
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
          birthDate: (p?.birth_date as string | null) ?? null,
          kind: r.kind as FamilyKind,
          managed: !!r.managed,
        }
      })
    return { id: f.id as string, name: f.name as string, members: sortFamilyMembers(members), invite: inviteByFamily.get(f.id as string) ?? null }
  })
}

/**
 * Junta pessoas com conta própria a uma família, como adulto ou criança pela idade (ou pelo
 * `kind` indicado). Tudo ou nada: se alguém já está noutra família, não junta ninguém e
 * devolve os nomes em `conflicts`.
 */
export async function addToClubFamily(
  service: Service,
  familyId: string,
  userIds: string[],
  addedBy: string,
  options: { kind?: FamilyKind; managed?: boolean } = {},
): Promise<{ error?: string; conflicts?: string[]; added?: number }> {
  const requested = [...new Set(userIds)]
  if (requested.length === 0) return { added: 0 }

  const { data: existing } = await service.from('club_family_members').select('user_id, family_id').in('user_id', requested)
  const familyOf = new Map((existing ?? []).map((r) => [r.user_id as string, r.family_id as string]))
  const conflictIds = requested.filter((id) => familyOf.has(id) && familyOf.get(id) !== familyId)
  if (conflictIds.length) {
    const { data: names } = await service.from('profiles').select('full_name').in('id', conflictIds)
    return { conflicts: (names ?? []).map((n) => (n.full_name as string) || 'Sem nome') }
  }

  const toAdd = requested.filter((id) => !familyOf.has(id))
  if (toAdd.length === 0) return { added: 0 }
  const { data: profiles } = await service.from('profiles').select('id, birth_date').in('id', toAdd)
  const rows = (profiles ?? []).map((p) => ({
    family_id: familyId,
    user_id: p.id as string,
    kind: options.kind ?? defaultFamilyKind(p.birth_date as string | null),
    managed: !!options.managed,
    added_by: addedBy,
  }))
  const { error } = await service.from('club_family_members').upsert(rows, { onConflict: 'user_id', ignoreDuplicates: true })
  if (error) return { error: 'Não foi possível juntar à família. Tenta novamente.' }
  return { added: rows.length }
}

/** Cria uma família com o nome indicado e devolve o id. */
export async function createFamily(service: Service, name: string, createdBy: string): Promise<string | null> {
  const { data, error } = await service.from('club_families').insert({ name, created_by: createdBy }).select('id').single()
  return error || !data ? null : (data.id as string)
}

/** Grupos de pessoas que são da mesma família (para o Formador de equipas). */
export async function clubFamilyGroups(service: Service): Promise<string[][]> {
  const { data } = await service.from('club_family_members').select('family_id, user_id')
  const byFamily = new Map<string, string[]>()
  for (const r of data ?? []) byFamily.set(r.family_id as string, [...(byFamily.get(r.family_id as string) ?? []), r.user_id as string])
  return [...byFamily.values()]
}
