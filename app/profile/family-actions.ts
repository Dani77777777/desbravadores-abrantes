'use server'

import crypto from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { childrenOf, createFamily, familyPlaceOf } from '@/lib/club-families'
import { MANAGED_EMAIL_DOMAIN, canEnterAccount, suggestedFamilyName } from '@/utils/club-families'
import { IMPLAUSIBLE_BIRTH_DATE_MESSAGE, hasImplausibleBirthDate } from '@/utils/birth-date'

type Result = { success?: true; error?: string }

async function currentUserId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

function isValidBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date <= new Date()
}

/** Só um adulto da família mexe nos perfis das crianças dessa família. */
async function adultOverChild(adultId: string, childId: string) {
  const admin = createServiceClient()
  const [adult, child] = await Promise.all([familyPlaceOf(admin, adultId), familyPlaceOf(admin, childId)])
  return canEnterAccount(adult, child) ? child : null
}

async function hasDuplicateChildProfile(familyId: string, fullName: string, birthDate: string) {
  const admin = createServiceClient()
  const childIds = await childrenOf(admin, familyId)
  if (!childIds.length) return false
  const { data } = await admin
    .from('profiles')
    .select('id')
    .in('id', childIds)
    .ilike('full_name', fullName.trim())
    .eq('birth_date', birthDate)
    .limit(1)
  return !!data?.length
}

export async function createFamilyAccount(data: {
  fullName: string
  birthDate: string
  gender: 'm' | 'f'
}): Promise<Result> {
  const userId = await currentUserId()
  if (!userId) return { error: 'A tua sessão expirou. Entra novamente.' }
  if (!data.fullName.trim() || !isValidBirthDate(data.birthDate) || !['m', 'f'].includes(data.gender)) {
    return { error: 'Preenche o nome, data de nascimento e sexo da criança.' }
  }
  if (hasImplausibleBirthDate(data.birthDate)) return { error: IMPLAUSIBLE_BIRTH_DATE_MESSAGE }

  const admin = createServiceClient()
  // Só um adulto cria perfis de criança. Quem ainda não tem família fica com uma nova.
  let place = await familyPlaceOf(admin, userId)
  if (place && place.kind !== 'adult') return { error: 'Só um adulto da família pode criar perfis de criança.' }
  if (place && await hasDuplicateChildProfile(place.familyId, data.fullName, data.birthDate)) {
    return { error: 'Já há uma criança com este nome e data de nascimento na família. Confirma a lista antes de criar outra.' }
  }

  let createdFamily: string | null = null
  if (!place) {
    const { data: me } = await admin.from('profiles').select('full_name').eq('id', userId).maybeSingle()
    createdFamily = await createFamily(admin, suggestedFamilyName(me?.full_name as string | null), userId)
    if (!createdFamily) return { error: 'Não foi possível criar a família. Tenta novamente.' }
    const { error } = await admin.from('club_family_members').insert({ family_id: createdFamily, user_id: userId, kind: 'adult', added_by: userId })
    if (error) {
      await admin.from('club_families').delete().eq('id', createdFamily)
      return { error: 'Não foi possível criar a família. Tenta novamente.' }
    }
    place = { familyId: createdFamily, kind: 'adult', managed: false }
  }

  const internalEmail = `family-${crypto.randomUUID()}@${MANAGED_EMAIL_DOMAIN}`
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: internalEmail,
    password: crypto.randomBytes(32).toString('base64url'),
    email_confirm: true,
    app_metadata: { family_account: true },
  })
  if (authError || !created.user) return { error: `Não foi possível criar a conta: ${authError?.message || 'erro desconhecido'}` }

  // Alguns projetos Supabase criam o perfil automaticamente através de um trigger
  // em auth.users. O upsert funciona tanto com esse trigger como sem ele, sem tentar
  // inserir o mesmo id uma segunda vez.
  const { error: profileError } = await admin.from('profiles').upsert({
    id: created.user.id,
    full_name: data.fullName.trim(),
    birth_date: data.birthDate,
    gender: data.gender,
    role: 'desbravador',
    section: 'rebentos',
    total_xp: 0,
    current_gold: 0,
    is_invested: false,
  }, { onConflict: 'id' })
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return { error: `A conta foi criada, mas o perfil falhou: ${profileError.message}` }
  }

  const { error: memberError } = await admin.from('club_family_members').insert({
    family_id: place.familyId,
    user_id: created.user.id,
    kind: 'child',
    managed: true,
    added_by: userId,
  })
  if (memberError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return { error: 'Não foi possível juntar a criança à família. Tenta novamente.' }
  }

  revalidatePath('/profile')
  return { success: true }
}

export async function updateFamilyAccountBirthDate(childId: string, birthDate: string): Promise<Result> {
  const userId = await currentUserId()
  if (!userId) return { error: 'A tua sessão expirou. Entra novamente.' }
  if (!isValidBirthDate(birthDate)) return { error: 'Indica uma data de nascimento válida, que não seja futura.' }
  if (hasImplausibleBirthDate(birthDate)) return { error: IMPLAUSIBLE_BIRTH_DATE_MESSAGE }
  if (!await adultOverChild(userId, childId)) return { error: 'Não tens permissão para alterar esta conta.' }

  const admin = createServiceClient()
  const { error } = await admin.from('profiles').update({ birth_date: birthDate }).eq('id', childId)
  if (error) return { error: `Não foi possível guardar a data: ${error.message}` }
  revalidatePath('/profile')
  revalidatePath('/')
  return { success: true }
}

/** Apaga um perfil de criança criado pela família (contas com email próprio nunca). */
export async function deleteFamilyAccount(childId: string): Promise<Result> {
  const userId = await currentUserId()
  if (!userId) return { error: 'A tua sessão expirou. Entra novamente.' }
  if (!await adultOverChild(userId, childId)) return { error: 'Não tens permissão para apagar esta conta.' }

  const admin = createServiceClient()
  const { data: target, error: targetError } = await admin.auth.admin.getUserById(childId)
  if (targetError || !target.user?.app_metadata?.family_account) {
    return { error: 'Só podes apagar perfis criados pela família. Contas com email próprio mantêm-se por segurança.' }
  }
  const { error } = await admin.auth.admin.deleteUser(childId)
  if (error) return { error: `Não foi possível apagar a conta: ${error.message}` }
  revalidatePath('/profile')
  revalidatePath('/')
  return { success: true }
}
