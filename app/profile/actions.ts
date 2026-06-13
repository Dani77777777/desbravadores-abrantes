'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateUserProfile(data: {
  fullName?: string
  avatarUrl?: string
}) {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return { error: 'Utilizador não autenticado' }
  }

  const updateData: any = {}
  if (data.fullName) updateData.full_name = data.fullName
  if (data.avatarUrl !== undefined) updateData.avatar_url = data.avatarUrl || null

  const { error: updateError } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', user.id)

  if (updateError) {
    console.error('Update error:', updateError)
    return { error: `Erro ao atualizar: ${updateError.message}` }
  }

  revalidatePath('/')
  return { success: true }
}

export async function changeUserEmail(newEmail: string) {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return { error: 'Utilizador não autenticado' }
  }

  if (newEmail === user.email) {
    return { error: 'O novo email é igual ao atual' }
  }

  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://desbravadores-abrantes.vercel.app'}/auth/callback` }
  )

  if (error) {
    console.error('Email change error:', error)
    return { error: `Erro ao alterar email: ${error.message}` }
  }

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
