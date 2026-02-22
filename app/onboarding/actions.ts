'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateProfile(data: {
  birthDate: string
  fullName: string
  avatarUrl?: string
}) {
  const supabase = await createClient()

  // Get the current user
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return { error: 'Utilizador não autenticado' }
  }

  // Check if profile exists
  const { data: existingProfile, error: fetchError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single()

  if (fetchError && fetchError.code === 'PGRST116') {
    // Profile doesn't exist, create it
    const { error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        full_name: data.fullName,
        avatar_url: data.avatarUrl || null,
        birth_date: data.birthDate,
        role: 'desbravador',
        section: 'rebentos', // Default, will be calculated later
        total_xp: 0,
        current_gold: 0,
        is_invested: false
      })

    if (insertError) {
      console.error('Insert error:', insertError)
      return { error: `Erro ao criar perfil: ${insertError.message}` }
    }
  } else if (fetchError) {
    console.error('Fetch error:', fetchError)
    return { error: `Erro ao verificar perfil: ${fetchError.message}` }
  } else {
    // Profile exists, update it
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ 
        birth_date: data.birthDate,
        full_name: data.fullName,
        avatar_url: data.avatarUrl || null
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('Update error:', updateError)
      return { error: `Erro ao atualizar: ${updateError.message}` }
    }
  }

  revalidatePath('/')
  return { success: true }
}
