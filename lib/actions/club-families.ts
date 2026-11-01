'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { effectiveLeadershipSection, effectiveRole } from '@/utils/permissions'
import { addToClubFamily, createFamily, familyPlaceOf, loadClubFamilies, makeFamilyCode } from '@/lib/club-families'
import {
  FAMILY_INVITE_HOURS, cleanFamilyName, defaultFamilyKind, isManagedEmail, normalizeFamilyCode, type ClubFamily, type FamilyKind,
} from '@/utils/club-families'

type Result = { error?: string }
type Service = ReturnType<typeof createServiceClient>

async function session() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, section, leadership_section, helper_role, helper_section, birth_date')
    .eq('id', user.id)
    .single()
  const role = effectiveRole(profile)
  return {
    userId: user.id,
    birthDate: (profile?.birth_date as string | null) ?? null,
    isCoordinator: role === 'coordenador',
    isLeader: role === 'coordenador' || role === 'dirigente',
    section: role === 'dirigente' ? effectiveLeadershipSection(profile) || profile?.section || null : null,
  }
}

const EXPIRED = 'A tua sessão expirou. Entra novamente.'
const ADULTS_ONLY = 'Só um adulto da família pode fazer isto.'

function conflictMessage(conflicts: string[]) {
  return conflicts.length === 1
    ? `${conflicts[0]} já está noutra família. Tem de sair dessa primeiro.`
    : `${conflicts.join(', ')} já estão noutras famílias. Têm de sair dessas primeiro.`
}

function refresh() {
  revalidatePath('/profile')
  revalidatePath('/admin')
  revalidatePath('/')
}

/**
 * Tirar estas pessoas deixaria perfis sem email (só se entra neles por um adulto) numa
 * família sem adultos? Então não se tiram.
 */
async function wouldOrphanChildren(service: Service, familyId: string, leaving: string[]) {
  const { data } = await service.from('club_family_members').select('user_id, kind, managed').eq('family_id', familyId)
  const rest = (data ?? []).filter((r) => !leaving.includes(r.user_id as string))
  return rest.some((r) => r.managed) && !rest.some((r) => r.kind === 'adult')
}

// ───────────────────────── Perfil (cada membro) ─────────────────────────

export type MyClubFamily = {
  family: ClubFamily | null
  /** Adulto ou criança nesta família (null sem família). */
  myKind: FamilyKind | null
  /** Ao criar ou aceitar uma família, ficaria adulto ou criança (pela idade). */
  joinKind: FamilyKind
}

export async function getMyClubFamily(): Promise<MyClubFamily & Result> {
  const me = await session()
  if (!me) return { error: EXPIRED, family: null, myKind: null, joinKind: 'adult' }
  const service = createServiceClient()
  const place = await familyPlaceOf(service, me.userId)
  const [family] = place ? await loadClubFamilies(service, [place.familyId]) : [null]
  // O código do convite só aparece a quem pode convidar.
  if (family && place?.kind !== 'adult') family.invite = null
  return { family: family ?? null, myKind: place?.kind ?? null, joinKind: defaultFamilyKind(me.birthDate) }
}

export async function createMyClubFamily(rawName: string): Promise<Result> {
  const me = await session()
  if (!me) return { error: EXPIRED }
  const name = cleanFamilyName(rawName)
  if (!name) return { error: 'Dá um nome à família (2 a 40 letras).' }
  if (defaultFamilyKind(me.birthDate) !== 'adult') return { error: 'Só um adulto pode criar a família. Pede a um adulto da tua família que te convide.' }
  const service = createServiceClient()
  if (await familyPlaceOf(service, me.userId)) return { error: 'Já estás numa família. Sai dela primeiro.' }

  const familyId = await createFamily(service, name, me.userId)
  if (!familyId) return { error: 'Não foi possível criar a família.' }
  const r = await addToClubFamily(service, familyId, [me.userId], me.userId, { kind: 'adult' })
  if (r.error || r.conflicts) {
    await service.from('club_families').delete().eq('id', familyId)
    return { error: r.error ?? conflictMessage(r.conflicts!) }
  }
  refresh()
  return {}
}

export async function createClubFamilyInvite(): Promise<Result & { code?: string }> {
  const me = await session()
  if (!me) return { error: EXPIRED }
  const service = createServiceClient()
  const place = await familyPlaceOf(service, me.userId)
  if (!place) return { error: 'Cria primeiro a tua família.' }
  if (place.kind !== 'adult') return { error: ADULTS_ONLY }

  const expires = new Date(Date.now() + FAMILY_INVITE_HOURS * 3600000).toISOString()
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = makeFamilyCode()
    const { error } = await service
      .from('club_family_invites')
      .upsert({ family_id: place.familyId, code, created_by: me.userId, expires_at: expires, created_at: new Date().toISOString() }, { onConflict: 'family_id' })
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
  const place = await familyPlaceOf(service, me.userId)
  if (!place || place.kind !== 'adult') return { error: ADULTS_ONLY }
  await service.from('club_family_invites').delete().eq('family_id', place.familyId)
  refresh()
  return {}
}

async function findInvite(service: Service, rawCode: string) {
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

/** Mostra de que família é o convite e se a pessoa entra como adulto ou criança. */
export async function inspectClubFamilyInvite(rawCode: string): Promise<Result & { familyName?: string; members?: string[]; kind?: FamilyKind }> {
  const me = await session()
  if (!me) return { error: EXPIRED }
  const service = createServiceClient()
  const familyId = await findInvite(service, rawCode)
  if (!familyId) return { error: 'Este código não é válido ou já expirou.' }
  const mine = await familyPlaceOf(service, me.userId)
  if (mine?.familyId === familyId) return { error: 'Já estás nesta família.' }
  if (mine) return { error: 'Já estás noutra família. Sai dela primeiro para aceitares este convite.' }
  const [family] = await loadClubFamilies(service, [familyId])
  if (!family) return { error: 'Este código não é válido ou já expirou.' }
  return { familyName: family.name, members: family.members.map((m) => m.name), kind: defaultFamilyKind(me.birthDate) }
}

/** Aceita o convite (uma só utilização): entra como adulto ou criança pela idade. */
export async function acceptClubFamilyInvite(rawCode: string): Promise<Result> {
  const me = await session()
  if (!me) return { error: EXPIRED }
  const service = createServiceClient()
  const familyId = await findInvite(service, rawCode)
  if (!familyId) return { error: 'Este convite já não está disponível.' }
  const r = await addToClubFamily(service, familyId, [me.userId], me.userId)
  if (r.error) return { error: r.error }
  if (r.conflicts) return { error: 'Já estás noutra família. Sai dela primeiro para aceitares este convite.' }
  await service.from('club_family_invites').delete().eq('family_id', familyId)
  refresh()
  return {}
}

/** Um adulto sai da família (perde o acesso às contas das crianças). */
export async function leaveMyClubFamily(): Promise<Result> {
  const me = await session()
  if (!me) return { error: EXPIRED }
  const service = createServiceClient()
  const place = await familyPlaceOf(service, me.userId)
  if (!place) return {}
  if (place.kind !== 'adult') return { error: 'Para saíres da família, fala com um adulto da família ou com a coordenação.' }
  if (await wouldOrphanChildren(service, place.familyId, [me.userId])) {
    return { error: 'És o último adulto: as crianças sem email ficavam sem ninguém que entrasse nas contas delas. Fala com a coordenação.' }
  }
  const { error } = await service.from('club_family_members').delete().eq('user_id', me.userId)
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
  if (!me.isCoordinator) {
    const place = await familyPlaceOf(service, me.userId)
    if (place?.familyId !== familyId || place.kind !== 'adult') return { error: 'Não podes alterar esta família.' }
  }
  const { error } = await service.from('club_families').update({ name }).eq('id', familyId)
  if (error) return { error: 'Não foi possível mudar o nome.' }
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

/**
 * Adulto ou criança (só a coordenação, porque muda quem entra em que conta). Um perfil sem
 * email próprio só passa a adulto depois de ter um email: senão ninguém conseguia entrar nele.
 */
export async function setClubFamilyKind(userId: string, kind: FamilyKind): Promise<Result> {
  if (kind !== 'adult' && kind !== 'child') return { error: 'Escolha inválida.' }
  const me = await requireCoordinator()
  if (!me) return { error: 'Só a coordenação muda quem é adulto ou criança.' }
  const service = createServiceClient()
  const place = await familyPlaceOf(service, userId)
  if (!place) return { error: 'Esta pessoa já não está na família.' }
  let managed = place.managed
  if (kind === 'adult') {
    const { data } = await service.auth.admin.getUserById(userId)
    managed = isManagedEmail(data.user?.email)
    if (managed) return { error: 'Este perfil ainda não tem email próprio. Põe-lhe primeiro um email para que possa entrar sozinho.' }
  } else if (await wouldOrphanChildren(service, place.familyId, [userId])) {
    return { error: 'É o último adulto da família: as crianças sem email ficavam sem ninguém que entrasse nas contas delas.' }
  }
  const { error } = await service.from('club_family_members').update({ kind, managed }).eq('user_id', userId)
  if (error) return { error: 'Não foi possível guardar.' }
  refresh()
  return {}
}

export async function adminCreateClubFamily(rawName: string, memberIds: string[]): Promise<Result> {
  const me = await requireCoordinator()
  if (!me) return { error: 'Só a coordenação pode criar famílias aqui.' }
  const name = cleanFamilyName(rawName)
  if (!name) return { error: 'Dá um nome à família (2 a 40 letras).' }
  if (memberIds.length === 0) return { error: 'Escolhe pelo menos uma pessoa.' }
  const service = createServiceClient()
  const familyId = await createFamily(service, name, me.userId)
  if (!familyId) return { error: 'Não foi possível criar a família.' }
  const r = await addToClubFamily(service, familyId, memberIds, me.userId)
  if (r.error || r.conflicts) {
    await service.from('club_families').delete().eq('id', familyId)
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

export async function adminRemoveFromClubFamily(familyId: string, userId: string): Promise<Result> {
  const me = await requireCoordinator()
  if (!me) return { error: 'Só a coordenação pode mexer nas famílias aqui.' }
  const service = createServiceClient()
  const place = await familyPlaceOf(service, userId)
  if (place?.managed) return { error: 'Este perfil não tem email próprio: fora da família ninguém conseguia entrar nele.' }
  if (await wouldOrphanChildren(service, familyId, [userId])) {
    return { error: 'É o último adulto da família: as crianças sem email ficavam sem ninguém que entrasse nas contas delas.' }
  }
  const { error } = await service.from('club_family_members').delete().eq('family_id', familyId).eq('user_id', userId)
  if (error) return { error: 'Não foi possível tirar da família.' }
  refresh()
  return {}
}

export async function adminDeleteClubFamily(familyId: string): Promise<Result> {
  const me = await requireCoordinator()
  if (!me) return { error: 'Só a coordenação pode apagar famílias.' }
  const service = createServiceClient()
  const { data } = await service.from('club_family_members').select('user_id').eq('family_id', familyId).eq('managed', true).limit(1)
  if (data?.length) return { error: 'Esta família tem perfis sem email próprio. Apagar a família deixava-os sem ninguém que entrasse neles.' }
  const { error } = await service.from('club_families').delete().eq('id', familyId)
  if (error) return { error: 'Não foi possível apagar a família.' }
  refresh()
  return {}
}
