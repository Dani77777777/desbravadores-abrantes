'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { effectiveLeadershipSection, effectiveRole } from '@/utils/permissions'
import {
  accountOwnerOf, addToClubFamily, associatedOf, familyIdOf, loadClubFamilies, makeFamilyCode,
} from '@/lib/club-families'
import {
  FAMILY_INVITE_DAYS, cleanFamilyName, normalizeFamilyCode, type ClubFamily, type FamilyKind,
} from '@/utils/club-families'

type Result = { error?: string }

async function session() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, section, leadership_section, helper_role, helper_section')
    .eq('id', user.id)
    .single()
  const role = effectiveRole(profile)
  return {
    userId: user.id,
    isCoordinator: role === 'coordenador',
    isLeader: role === 'coordenador' || role === 'dirigente',
    section: role === 'dirigente' ? effectiveLeadershipSection(profile) || profile?.section || null : null,
  }
}

const EXPIRED = 'A tua sessão expirou. Entra novamente.'
const MANAGED = 'A família desta conta é gerida pela conta do teu responsável.'

function conflictMessage(conflicts: string[]) {
  return conflicts.length === 1
    ? `${conflicts[0]} já está noutra família. Tem de sair dessa primeiro.`
    : `${conflicts.join(', ')} já estão noutras famílias. Têm de sair dessas primeiro.`
}

function refresh() {
  revalidatePath('/profile')
  revalidatePath('/admin')
}

/** Pode mexer na família: a coordenação, ou quem é da família com conta própria. */
async function canEditFamily(service: ReturnType<typeof createServiceClient>, me: NonNullable<Awaited<ReturnType<typeof session>>>, familyId: string) {
  if (me.isCoordinator) return true
  if ((await familyIdOf(service, me.userId)) !== familyId) return false
  return !(await accountOwnerOf(service, me.userId))
}

// ───────────────────────── Perfil (cada membro) ─────────────────────────

export type MyClubFamily = {
  family: ClubFamily | null
  /** Nome do responsável, se esta conta for um perfil associado (não gere a família). */
  managedBy: string | null
}

export async function getMyClubFamily(): Promise<MyClubFamily & Result> {
  const me = await session()
  if (!me) return { error: EXPIRED, family: null, managedBy: null }
  const service = createServiceClient()
  const [familyId, ownerId] = await Promise.all([familyIdOf(service, me.userId), accountOwnerOf(service, me.userId)])
  const [family] = familyId ? await loadClubFamilies(service, [familyId]) : [null]
  let managedBy: string | null = null
  if (ownerId) {
    const { data } = await service.from('profiles').select('full_name').eq('id', ownerId).maybeSingle()
    managedBy = (data?.full_name as string) || 'o teu responsável'
  }
  // O código do convite só aparece a quem pode convidar.
  if (family && managedBy) family.invite = null
  return { family: family ?? null, managedBy }
}

export async function createMyClubFamily(rawName: string): Promise<Result> {
  const me = await session()
  if (!me) return { error: EXPIRED }
  const name = cleanFamilyName(rawName)
  if (!name) return { error: 'Dá um nome à família (2 a 40 letras).' }
  const service = createServiceClient()
  if (await accountOwnerOf(service, me.userId)) return { error: MANAGED }
  if (await familyIdOf(service, me.userId)) return { error: 'Já estás numa família. Sai dela primeiro.' }

  const { data: family, error } = await service.from('club_families').insert({ name, created_by: me.userId }).select('id').single()
  if (error || !family) return { error: 'Não foi possível criar a família.' }
  const r = await addToClubFamily(service, family.id, [me.userId], me.userId)
  if (r.error || r.conflicts) {
    await service.from('club_families').delete().eq('id', family.id)
    return { error: r.error ?? conflictMessage(r.conflicts!) }
  }
  refresh()
  return {}
}

export async function createClubFamilyInvite(): Promise<Result & { code?: string }> {
  const me = await session()
  if (!me) return { error: EXPIRED }
  const service = createServiceClient()
  if (await accountOwnerOf(service, me.userId)) return { error: MANAGED }
  const familyId = await familyIdOf(service, me.userId)
  if (!familyId) return { error: 'Cria primeiro a tua família.' }

  const expires = new Date(Date.now() + FAMILY_INVITE_DAYS * 86400000).toISOString()
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = makeFamilyCode()
    const { error } = await service
      .from('club_family_invites')
      .upsert({ family_id: familyId, code, created_by: me.userId, expires_at: expires, created_at: new Date().toISOString() }, { onConflict: 'family_id' })
    if (!error) {
      refresh()
      return { code }
    }
    if (error.code !== '23505') return { error: 'Não foi possível criar o convite.' }
  }
  return { error: 'Não foi possível gerar um código. Tenta novamente.' }
}

export async function revokeClubFamilyInvite(): Promise<Result> {
  const me = await session()
  if (!me) return { error: EXPIRED }
  const service = createServiceClient()
  const familyId = await familyIdOf(service, me.userId)
  if (!familyId || (await accountOwnerOf(service, me.userId))) return { error: MANAGED }
  await service.from('club_family_invites').delete().eq('family_id', familyId)
  refresh()
  return {}
}

/** Valida o convite para mostrar de que família é antes de aceitar. */
async function findInvite(service: ReturnType<typeof createServiceClient>, rawCode: string) {
  const code = normalizeFamilyCode(rawCode)
  if (!code) return null
  const { data } = await service
    .from('club_family_invites')
    .select('family_id')
    .eq('code', code)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  return (data?.family_id as string | undefined) ?? null
}

export async function inspectClubFamilyInvite(rawCode: string): Promise<Result & { familyName?: string; members?: string[] }> {
  const me = await session()
  if (!me) return { error: EXPIRED }
  const service = createServiceClient()
  if (await accountOwnerOf(service, me.userId)) return { error: MANAGED }
  const familyId = await findInvite(service, rawCode)
  if (!familyId) return { error: 'Este código não é válido ou já expirou.' }
  const mine = await familyIdOf(service, me.userId)
  if (mine === familyId) return { error: 'Já estás nesta família.' }
  if (mine) return { error: 'Já estás noutra família. Sai dela primeiro para aceitares este convite.' }
  const [family] = await loadClubFamilies(service, [familyId])
  if (!family) return { error: 'Este código não é válido ou já expirou.' }
  return { familyName: family.name, members: family.members.map((m) => m.name) }
}

export async function acceptClubFamilyInvite(rawCode: string): Promise<Result> {
  const me = await session()
  if (!me) return { error: EXPIRED }
  const service = createServiceClient()
  if (await accountOwnerOf(service, me.userId)) return { error: MANAGED }
  const familyId = await findInvite(service, rawCode)
  if (!familyId) return { error: 'Este convite já não está disponível.' }
  const r = await addToClubFamily(service, familyId, [me.userId], me.userId)
  if (r.error) return { error: r.error }
  if (r.conflicts) return { error: 'Já estás noutra família. Sai dela primeiro para aceitares este convite.' }
  refresh()
  return {}
}

/** Sai da família com os perfis associados a esta conta. */
export async function leaveMyClubFamily(): Promise<Result> {
  const me = await session()
  if (!me) return { error: EXPIRED }
  const service = createServiceClient()
  if (await accountOwnerOf(service, me.userId)) return { error: MANAGED }
  const familyId = await familyIdOf(service, me.userId)
  if (!familyId) return {}
  const ids = [me.userId, ...(await associatedOf(service, [me.userId]))]
  const { error } = await service.from('club_family_members').delete().eq('family_id', familyId).in('user_id', ids)
  if (error) return { error: 'Não foi possível sair da família.' }
  refresh()
  return {}
}

export async function renameClubFamily(familyId: string, rawName: string): Promise<Result> {
  const me = await session()
  if (!me) return { error: EXPIRED }
  const name = cleanFamilyName(rawName)
  if (!name) return { error: 'Dá um nome à família (2 a 40 letras).' }
  const service = createServiceClient()
  if (!(await canEditFamily(service, me, familyId))) return { error: 'Não podes alterar esta família.' }
  const { error } = await service.from('club_families').update({ name }).eq('id', familyId)
  if (error) return { error: 'Não foi possível mudar o nome.' }
  refresh()
  return {}
}

/** Marca uma pessoa da família como adulto ou criança. */
export async function setClubFamilyKind(userId: string, kind: FamilyKind): Promise<Result> {
  if (kind !== 'adult' && kind !== 'child') return { error: 'Escolha inválida.' }
  const me = await session()
  if (!me) return { error: EXPIRED }
  const service = createServiceClient()
  const familyId = await familyIdOf(service, userId)
  if (!familyId) return { error: 'Esta pessoa já não está na família.' }
  if (!(await canEditFamily(service, me, familyId))) return { error: 'Não podes alterar esta família.' }
  const { error } = await service.from('club_family_members').update({ kind }).eq('user_id', userId)
  if (error) return { error: 'Não foi possível guardar.' }
  refresh()
  return {}
}

// ───────────────────── Administração dos membros ─────────────────────

/**
 * Todas as famílias para a coordenação (que as pode corrigir). O dirigente só vê as que
 * têm alguém da sua secção, sem editar.
 */
export async function listClubFamiliesForAdmin(): Promise<Result & { families?: ClubFamily[]; canEdit?: boolean }> {
  const me = await session()
  if (!me?.isLeader) return { error: 'Sem permissão.' }
  const service = createServiceClient()
  let families = await loadClubFamilies(service)
  if (!me.isCoordinator) families = families.filter((f) => f.members.some((m) => m.section === me.section))
  // Os códigos de convite são da família; a administração não precisa deles.
  return { families: families.map((f) => ({ ...f, invite: null })), canEdit: me.isCoordinator }
}

async function requireCoordinator() {
  const me = await session()
  return me?.isCoordinator ? me : null
}

export async function adminCreateClubFamily(rawName: string, memberIds: string[]): Promise<Result> {
  const me = await requireCoordinator()
  if (!me) return { error: 'Só a coordenação pode criar famílias aqui.' }
  const name = cleanFamilyName(rawName)
  if (!name) return { error: 'Dá um nome à família (2 a 40 letras).' }
  if (memberIds.length === 0) return { error: 'Escolhe pelo menos uma pessoa.' }
  const service = createServiceClient()
  const { data: family, error } = await service.from('club_families').insert({ name, created_by: me.userId }).select('id').single()
  if (error || !family) return { error: 'Não foi possível criar a família.' }
  const r = await addToClubFamily(service, family.id, memberIds, me.userId)
  if (r.error || r.conflicts) {
    await service.from('club_families').delete().eq('id', family.id)
    return { error: r.error ?? conflictMessage(r.conflicts!) }
  }
  refresh()
  return {}
}

export async function adminAddToClubFamily(familyId: string, memberIds: string[]): Promise<Result> {
  const me = await requireCoordinator()
  if (!me) return { error: 'Só a coordenação pode mexer nas famílias aqui.' }
  const service = createServiceClient()
  const r = await addToClubFamily(service, familyId, memberIds, me.userId)
  if (r.error) return { error: r.error }
  if (r.conflicts) return { error: conflictMessage(r.conflicts) }
  refresh()
  return {}
}

/** Tira só esta pessoa (os perfis associados ficam; tira-os um a um se for preciso). */
export async function adminRemoveFromClubFamily(familyId: string, userId: string): Promise<Result> {
  const me = await requireCoordinator()
  if (!me) return { error: 'Só a coordenação pode mexer nas famílias aqui.' }
  const service = createServiceClient()
  const { error } = await service.from('club_family_members').delete().eq('family_id', familyId).eq('user_id', userId)
  if (error) return { error: 'Não foi possível tirar da família.' }
  refresh()
  return {}
}

export async function adminDeleteClubFamily(familyId: string): Promise<Result> {
  const me = await requireCoordinator()
  if (!me) return { error: 'Só a coordenação pode apagar famílias.' }
  const service = createServiceClient()
  const { error } = await service.from('club_families').delete().eq('id', familyId)
  if (error) return { error: 'Não foi possível apagar a família.' }
  refresh()
  return {}
}
