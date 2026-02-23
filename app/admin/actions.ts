'use server'

import { createClient as createServerClient } from '@/utils/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

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

  // Trigger the password reset email
  const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(targetUser.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback?next=/login/reset-password`,
  })

  if (resetError) {
    throw new Error(resetError.message)
  }

  revalidatePath('/admin')
  return { success: true }
}
