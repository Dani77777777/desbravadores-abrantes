import { createServiceClient } from '@/utils/supabase/service'
import { AVATAR_BUCKET, ownAvatarPath } from '@/utils/avatar'

/**
 * Apaga do bucket a foto de perfil antiga de um utilizador (se foi carregada por ele).
 * Só usar em server actions, com o URL lido da base de dados (nunca vindo do cliente).
 * Falhar a limpeza não deve bloquear a gravação do perfil, por isso só regista o erro.
 */
export async function deleteOwnAvatarFile(url: string | null | undefined, userId: string) {
  const path = ownAvatarPath(url, userId)
  if (!path) return

  const { error } = await createServiceClient().storage.from(AVATAR_BUCKET).remove([path])
  if (error) console.error('Erro ao apagar avatar antigo:', path, error)
}
