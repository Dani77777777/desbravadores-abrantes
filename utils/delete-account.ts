import { createServiceClient } from '@/utils/supabase/service'
import { deleteOwnAvatarFile } from '@/utils/avatar-storage'

/**
 * Apaga um utilizador do Auth (o perfil e os dados ligados caem em cascata).
 * Se o utilizador já não existir no Auth, limpa o perfil órfão.
 * Só usar em server actions, depois de validar permissões.
 */
export async function deleteUserCompletely(userId: string): Promise<{ success?: true; error?: string }> {
  const supabaseAdmin = createServiceClient()

  // Guardar o URL da foto antes de o perfil desaparecer, para a apagar do bucket no fim
  const { data: profile } = await supabaseAdmin.from('profiles').select('avatar_url').eq('id', userId).maybeSingle()

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)

  if (error) {
    const notFound = error.status === 404 || /not.?found/i.test(error.message)
    if (!notFound) {
      console.error('deleteUser error:', error)
      if (/foreign key|violates/i.test(error.message)) {
        return { error: 'A conta tem dados associados que impedem a remoção. Contacta o administrador técnico.' }
      }
      return { error: `Erro ao apagar conta: ${error.message}` }
    }
  }

  // Garante que não fica um perfil órfão (ex.: utilizador já removido do Auth).
  const { error: profileError } = await supabaseAdmin.from('profiles').delete().eq('id', userId)
  if (profileError) {
    console.error('Profile delete error:', profileError)
    return { error: `Conta removida, mas o perfil não foi apagado: ${profileError.message}` }
  }

  await deleteOwnAvatarFile(profile?.avatar_url, userId)

  return { success: true }
}
