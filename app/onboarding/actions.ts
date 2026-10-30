'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { deleteOwnAvatarFile } from '@/utils/avatar-storage'
import { IMPLAUSIBLE_BIRTH_DATE_MESSAGE, hasImplausibleBirthDate } from '@/utils/birth-date'

export async function updateProfile(data: {
  birthDate: string
  fullName: string
  gender: 'm' | 'f'
  avatarUrl?: string
}) {
  const supabase = await createClient()

  // Get the current user
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return { error: 'Utilizador não autenticado' }
  }

  if (data.gender !== 'm' && data.gender !== 'f') {
    return { error: 'Indica se és do sexo masculino ou feminino.' }
  }

  if (hasImplausibleBirthDate(data.birthDate)) {
    return { error: IMPLAUSIBLE_BIRTH_DATE_MESSAGE }
  }

  // Check if profile exists
  const { data: existingProfile, error: fetchError } = await supabase
    .from('profiles')
    .select('id, avatar_url')
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
        gender: data.gender,
        role: 'desbravador',
        section: 'rebentos', // Substituída pela classe da idade no trigger on_profile_lifecycle
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
        gender: data.gender,
        avatar_url: data.avatarUrl || null
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('Update error:', updateError)
      return { error: `Erro ao atualizar: ${updateError.message}` }
    }

    // Foto antiga carregada por este utilizador que foi trocada ou removida
    if (existingProfile?.avatar_url && existingProfile.avatar_url !== (data.avatarUrl || null)) {
      await deleteOwnAvatarFile(existingProfile.avatar_url, user.id)
    }
  }

  revalidatePath('/')
  return { success: true }
}
