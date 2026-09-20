'use server'

import { createClient as createServerClient } from '@/utils/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createServiceClient } from '@/utils/supabase/service'
import { deleteUserCompletely } from '@/utils/delete-account'

export async function triggerResetPassword(userId: string) {
  const supabase = await createServerClient()
  
  // 1. Check if requester is admin
  const { data: { user: requester }, error: authError } = await supabase.auth.getUser()
  if (authError || !requester) {
    throw new Error('Não autorizado')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', requester.id)
    .single()

  if (!profile || (profile.role !== 'coordenador' && profile.role !== 'dirigente')) {
    throw new Error('Apenas administradores podem resetar passwords')
  }

  // 2. Use Admin Client (Service Role) to get member email and trigger reset
  // We need the service role key to access auth.users or to trigger reset for another user
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )

  // Get the user's email first
  const { data: { user: targetUser }, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId)
  
  if (getUserError || !targetUser?.email) {
    throw new Error('Não foi possível encontrar o email do utilizador')
  }

  // 1. Get origin from headers to be dynamic and avoid environment variable issues
  const headerList = await headers()
  const host = headerList.get('host')
  const protocol = headerList.get('x-forwarded-proto') || 'https'
  const origin = `${protocol}://${host}`
  
  const redirectTo = `${origin}/login/reset-password`

  // Trigger the password reset email
  const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(targetUser.email, {
    redirectTo,
  })

  if (resetError) {
    throw new Error(resetError.message)
  }

  revalidatePath('/admin')
  return { success: true }
}

/**
 * Apaga definitivamente a conta de um membro (auth.users → profiles em cascata).
 * Só o coordenador REAL pode apagar; não pode apagar-se a si próprio (usa o
 * Perfil para isso) nem apagar outro coordenador.
 */
export async function deleteMemberAccount(memberId: string): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createServerClient()

  const { data: { user: requester }, error: authError } = await supabase.auth.getUser()
  if (authError || !requester) {
    return { error: 'Não autorizado' }
  }

  const { data: requesterProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', requester.id)
    .single()

  if (requesterProfile?.role !== 'coordenador') {
    return { error: 'Apenas o coordenador pode apagar contas.' }
  }

  if (memberId === requester.id) {
    return { error: 'Não podes apagar a tua própria conta aqui. Usa a página de Perfil.' }
  }

  const supabaseAdmin = createServiceClient()

  const { data: target } = await supabaseAdmin
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', memberId)
    .maybeSingle()

  if (target?.role === 'coordenador') {
    return { error: 'Não é possível apagar a conta de outro coordenador. Altera primeiro o cargo.' }
  }

  const result = await deleteUserCompletely(memberId)
  if (result.error) return result

  revalidatePath('/admin')
  revalidatePath('/leaderboard')
  return { success: true }
}
