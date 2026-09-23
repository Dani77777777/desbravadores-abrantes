'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/utils/supabase/service'
import { deleteUserCompletely } from '@/utils/delete-account'
import { deleteOwnAvatarFile } from '@/utils/avatar-storage'

export async function updateUserProfile(data: {
  fullName?: string
  avatarUrl?: string
  gender?: 'm' | 'f'
}) {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return { error: 'Utilizador não autenticado' }
  }

  const updateData: any = {}
  if (data.fullName) updateData.full_name = data.fullName
  if (data.avatarUrl !== undefined) updateData.avatar_url = data.avatarUrl || null
  // Foto atual (lida da BD) para apagar do bucket se for trocada ou removida
  const { data: current } = await supabase.from('profiles').select('avatar_url, gender').eq('id', user.id).single()

  // O sexo escolhe-se no onboarding; aqui só o podem indicar (uma vez) as contas antigas sem ele.
  if (data.gender !== undefined) {
    if (data.gender !== 'm' && data.gender !== 'f') return { error: 'Sexo inválido.' }
    if (current?.gender) return { error: 'O sexo já está definido. Fala com a coordenação se estiver errado.' }
    updateData.gender = data.gender
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', user.id)

  if (updateError) {
    console.error('Update error:', updateError)
    return { error: `Erro ao atualizar: ${updateError.message}` }
  }

  if ('avatar_url' in updateData && current?.avatar_url && current.avatar_url !== updateData.avatar_url) {
    await deleteOwnAvatarFile(current.avatar_url, user.id)
  }

  revalidatePath('/')
  return { success: true }
}


export async function transferGoldAction(recipientId: string, amount: number) {
  const supabase = await createClient()

  const { error } = await supabase.rpc('transfer_gold', {
    recipient_id: recipientId,
    amount: amount
  })

  if (error) {
    console.error('Transfer error:', error)
    return { error: error.message }
  }

  revalidatePath('/')
  revalidatePath('/points-history')
  return { success: true }
}

/**
 * Passo 1 da remoção da conta: envia um código de verificação para o email
 * da sessão atual (template "Magic Link" do Supabase com {{ .Token }}).
 */
export async function requestAccountDeletionCode(): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user?.email) {
    return { error: 'Utilizador não autenticado' }
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: user.email,
    options: { shouldCreateUser: false },
  })

  if (error) {
    console.error('Deletion code error:', error)
    if (error.status === 429 || /rate|seconds/i.test(error.message)) {
      return { error: 'Pediste um código há pouco. Aguarda um minuto e tenta novamente.' }
    }
    return { error: `Erro ao enviar código: ${error.message}` }
  }

  return { success: true }
}

/**
 * Passo 2: valida o código recebido por email e apaga a conta do próprio utilizador.
 */
export async function deleteOwnAccount(code: string): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user?.email) {
    return { error: 'Utilizador não autenticado' }
  }

  const token = code.replace(/\s/g, '')
  if (!/^\d{6,8}$/.test(token)) {
    return { error: 'Código inválido.' }
  }

  const supabaseAdmin = createServiceClient()

  // Não deixar o clube sem coordenador.
  const { data: me } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (me?.role === 'coordenador') {
    const { count } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'coordenador')
    if ((count ?? 0) <= 1) {
      return { error: 'És o único coordenador. Nomeia outro coordenador antes de apagar a tua conta.' }
    }
  }

  const { data: verified, error: otpError } = await supabase.auth.verifyOtp({
    email: user.email,
    token,
    type: 'email',
  })

  if (otpError || verified.user?.id !== user.id) {
    return { error: 'Código inválido ou expirado.' }
  }

  const result = await deleteUserCompletely(user.id)
  if (result.error) return result

  await supabase.auth.signOut().catch(() => {})
  revalidatePath('/', 'layout')
  return { success: true }
}
