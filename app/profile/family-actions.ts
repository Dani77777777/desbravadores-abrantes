'use server'

import crypto from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { getFamilyAccountSummary } from '@/lib/family-accounts'

type Result = { success?: true; error?: string; code?: string; parentName?: string }

const INTERNAL_EMAIL_DOMAIN = 'family.desbravadores-abrantes.invalid'

async function currentUserId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

/** Uma conta já associada como familiar não pode gerir outros perfis. */
async function canOwnFamilyAccounts(userId: string) {
  const admin = createServiceClient()
  const { data } = await admin
    .from('family_account_links')
    .select('owner_user_id')
    .eq('associated_user_id', userId)
    .maybeSingle()
  return !data
}

/** Para aceitar um pedido, a conta ainda não pode pertencer a nenhuma família. */
async function canBecomeAssociatedAccount(userId: string) {
  const admin = createServiceClient()
  const { data } = await admin
    .from('family_account_links')
    .select('owner_user_id')
    .or(`owner_user_id.eq.${userId},associated_user_id.eq.${userId}`)
    .limit(1)
    .maybeSingle()
  return !data
}

function makeRequestCode() {
  return crypto.randomBytes(6).toString('base64url').toUpperCase().replace(/[-_]/g, 'A').slice(0, 8)
}

function isValidBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date <= new Date()
}

async function hasDuplicateFamilyProfile(ownerUserId: string, fullName: string, birthDate: string) {
  const admin = createServiceClient()
  const { data: links } = await admin
    .from('family_account_links')
    .select('associated_user_id')
    .eq('owner_user_id', ownerUserId)
  const childIds = (links || []).map((link) => link.associated_user_id)
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
  const ownerUserId = await currentUserId()
  if (!ownerUserId) return { error: 'A tua sessão expirou. Entra novamente.' }
  if (!data.fullName.trim() || !isValidBirthDate(data.birthDate) || !['m', 'f'].includes(data.gender)) {
    return { error: 'Preenche o nome, data de nascimento e sexo da nova conta.' }
  }
  if (!await canOwnFamilyAccounts(ownerUserId)) {
    return { error: 'Esta conta já está associada a outra conta familiar.' }
  }
  if (await hasDuplicateFamilyProfile(ownerUserId, data.fullName, data.birthDate)) {
    return { error: 'Já tens um familiar com este nome e data de nascimento. Confirma a lista antes de criar outra conta.' }
  }

  const admin = createServiceClient()
  const internalEmail = `family-${crypto.randomUUID()}@${INTERNAL_EMAIL_DOMAIN}`
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

  const { error: linkError } = await admin.from('family_account_links').insert({
    owner_user_id: ownerUserId,
    associated_user_id: created.user.id,
  })
  if (linkError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return { error: 'Não foi possível associar a nova conta. Tenta novamente.' }
  }

  revalidatePath('/profile')
  return { success: true }
}

export async function createFamilyAssociationRequest(): Promise<Result> {
  const ownerUserId = await currentUserId()
  if (!ownerUserId) return { error: 'A tua sessão expirou. Entra novamente.' }
  if (!await canOwnFamilyAccounts(ownerUserId)) return { error: 'Esta conta já está associada a outra conta familiar.' }

  const summary = await getFamilyAccountSummary(ownerUserId)
  if (summary.pendingRequest) return { success: true, code: summary.pendingRequest.code }

  const admin = createServiceClient()
  let code = makeRequestCode()
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await admin.from('family_account_requests').insert({
      owner_user_id: ownerUserId,
      code,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    if (!error) {
      revalidatePath('/profile')
      return { success: true, code }
    }
    if (error.code !== '23505') return { error: `Não foi possível criar o pedido: ${error.message}` }
    code = makeRequestCode()
  }
  return { error: 'Não foi possível gerar um código seguro. Tenta novamente.' }
}

export async function inspectFamilyAssociationCode(rawCode: string): Promise<Result> {
  const userId = await currentUserId()
  if (!userId) return { error: 'A tua sessão expirou. Entra novamente.' }
  if (!await canBecomeAssociatedAccount(userId)) return { error: 'A tua conta já tem uma associação familiar.' }
  const code = rawCode.trim().toUpperCase()
  const admin = createServiceClient()
  const { data: request } = await admin
    .from('family_account_requests')
    .select('owner_user_id, expires_at')
    .eq('code', code)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (!request || request.owner_user_id === userId) return { error: 'Este código não é válido ou já expirou.' }

  const { data: parent } = await admin.from('profiles').select('full_name').eq('id', request.owner_user_id).maybeSingle()
  return { success: true, code, parentName: parent?.full_name || 'esta conta' }
}

export async function acceptFamilyAssociationCode(rawCode: string): Promise<Result> {
  const associatedUserId = await currentUserId()
  if (!associatedUserId) return { error: 'A tua sessão expirou. Entra novamente.' }
  if (!await canBecomeAssociatedAccount(associatedUserId)) return { error: 'A tua conta já tem uma associação familiar.' }
  const code = rawCode.trim().toUpperCase()
  const admin = createServiceClient()
  const { data: request } = await admin
    .from('family_account_requests')
    .select('id, owner_user_id')
    .eq('code', code)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (!request || request.owner_user_id === associatedUserId) return { error: 'Este pedido já não está disponível.' }

  const { error: linkError } = await admin.from('family_account_links').insert({
    owner_user_id: request.owner_user_id,
    associated_user_id: associatedUserId,
  })
  if (linkError) return { error: 'Não foi possível concluir a associação. Confirma que nenhuma das contas já está associada.' }

  await admin.from('family_account_requests').update({
    status: 'accepted', accepted_at: new Date().toISOString(), accepted_by_user_id: associatedUserId,
  }).eq('id', request.id)
  revalidatePath('/profile')
  return { success: true }
}

export async function revokeFamilyAssociationRequest(): Promise<Result> {
  const userId = await currentUserId()
  if (!userId) return { error: 'A tua sessão expirou. Entra novamente.' }
  const admin = createServiceClient()
  const { error } = await admin.from('family_account_requests').update({ status: 'revoked' })
    .eq('owner_user_id', userId).eq('status', 'pending')
  if (error) return { error: 'Não foi possível cancelar o pedido.' }
  revalidatePath('/profile')
  return { success: true }
}

export async function updateFamilyAccountBirthDate(associatedUserId: string, birthDate: string): Promise<Result> {
  const ownerUserId = await currentUserId()
  if (!ownerUserId) return { error: 'A tua sessão expirou. Entra novamente.' }
  if (!isValidBirthDate(birthDate)) return { error: 'Indica uma data de nascimento válida, que não seja futura.' }

  const admin = createServiceClient()
  const { data: link } = await admin.from('family_account_links')
    .select('associated_user_id')
    .eq('owner_user_id', ownerUserId)
    .eq('associated_user_id', associatedUserId)
    .maybeSingle()
  if (!link) return { error: 'Não tens permissão para alterar esta conta.' }

  const { error } = await admin.from('profiles').update({ birth_date: birthDate }).eq('id', associatedUserId)
  if (error) return { error: `Não foi possível guardar a data: ${error.message}` }
  revalidatePath('/profile')
  revalidatePath('/')
  return { success: true }
}

export async function deleteFamilyAccount(associatedUserId: string): Promise<Result> {
  const ownerUserId = await currentUserId()
  if (!ownerUserId) return { error: 'A tua sessão expirou. Entra novamente.' }
  const admin = createServiceClient()
  const { data: link } = await admin.from('family_account_links')
    .select('associated_user_id')
    .eq('owner_user_id', ownerUserId)
    .eq('associated_user_id', associatedUserId)
    .maybeSingle()
  if (!link) return { error: 'Não tens permissão para apagar esta conta.' }

  const { data: target, error: targetError } = await admin.auth.admin.getUserById(associatedUserId)
  if (targetError || !target.user?.app_metadata?.family_account) {
    return { error: 'Só podes apagar contas criadas como familiares. Contas existentes mantêm-se por segurança.' }
  }
  const { error } = await admin.auth.admin.deleteUser(associatedUserId)
  if (error) return { error: `Não foi possível apagar a conta: ${error.message}` }
  revalidatePath('/profile')
  revalidatePath('/')
  return { success: true }
}
