import { createServiceClient } from '@/utils/supabase/service'
import { deleteOwnAvatarFile } from '@/utils/avatar-storage'

type ServiceClient = ReturnType<typeof createServiceClient>

/** Prefixo da descrição no points_log. Não mudar: a origem dos pontos identifica-se pela descrição. */
export const LEGACY_DESCRIPTION_PREFIX = 'Herança de'

export type DeleteOptions = {
  /** Quem recebe o XP e o Gold acumulados de quem sai (opcional). */
  heirId?: string | null
  /** Quem fez a remoção (coordenador). Fica vazio quando é o próprio a apagar a conta. */
  awardedBy?: string | null
}

/**
 * Passa o XP e o Gold de quem sai para o herdeiro, com uma linha no points_log
 * (os totais do perfil são recalculados pelo trigger). Devolve o id da linha,
 * para a desfazer se a conta acabar por não ser apagada.
 */
async function grantLegacy(
  supabaseAdmin: ServiceClient,
  userId: string,
  heirId: string,
  awardedBy: string | null,
): Promise<{ logId?: string | null; error?: string }> {
  if (heirId === userId) return { error: 'Não podes deixar os pontos à própria conta.' }

  const { data: people, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, total_xp, current_gold')
    .in('id', [userId, heirId])
  if (error) return { error: `Erro ao preparar a herança: ${error.message}` }

  const leaver = people?.find((p) => p.id === userId)
  const heir = people?.find((p) => p.id === heirId)
  if (!heir) return { error: 'A pessoa escolhida para receber os pontos já não existe. Escolhe outra.' }
  if (!leaver) return { logId: null }

  const xp = Math.max(0, leaver.total_xp ?? 0)
  const gold = Math.max(0, leaver.current_gold ?? 0)
  if (xp === 0 && gold === 0) return { logId: null }

  const { data: log, error: insertError } = await supabaseAdmin
    .from('points_log')
    .insert({
      target_user_id: heirId,
      awarded_by_user_id: awardedBy,
      amount_xp: xp,
      amount_gold: gold,
      description: `${LEGACY_DESCRIPTION_PREFIX} ${leaver.full_name || 'um membro'} (saiu do clube)`,
    })
    .select('id')
    .single()
  if (insertError) {
    console.error('Legacy insert error:', insertError)
    return { error: `Não foi possível passar os pontos: ${insertError.message}` }
  }
  return { logId: log.id }
}

/**
 * Apaga um utilizador do Auth (o perfil e os dados ligados caem em cascata).
 * Se o utilizador já não existir no Auth, limpa o perfil órfão.
 * Com `heirId`, o XP e o Gold acumulados passam primeiro para essa pessoa.
 * Só usar em server actions, depois de validar permissões.
 */
export async function deleteUserCompletely(
  userId: string,
  options: DeleteOptions = {},
): Promise<{ success?: true; error?: string }> {
  const supabaseAdmin = createServiceClient()

  // Guardar o URL da foto antes de o perfil desaparecer, para a apagar do bucket no fim
  const { data: profile } = await supabaseAdmin.from('profiles').select('avatar_url').eq('id', userId).maybeSingle()

  // A herança entra antes de apagar: se falhar, a conta fica como estava.
  let legacyLogId: string | null = null
  if (options.heirId) {
    const legacy = await grantLegacy(supabaseAdmin, userId, options.heirId, options.awardedBy ?? null)
    if (legacy.error) return { error: legacy.error }
    legacyLogId = legacy.logId ?? null
  }

  const undoLegacy = async () => {
    if (!legacyLogId) return
    const { error } = await supabaseAdmin.from('points_log').delete().eq('id', legacyLogId)
    if (error) console.error('Legacy rollback error:', error)
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)

  if (error) {
    const notFound = error.status === 404 || /not.?found/i.test(error.message)
    if (!notFound) {
      console.error('deleteUser error:', error)
      await undoLegacy()
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
    await undoLegacy()
    return { error: `Conta removida, mas o perfil não foi apagado: ${profileError.message}` }
  }

  await deleteOwnAvatarFile(profile?.avatar_url, userId)

  return { success: true }
}
