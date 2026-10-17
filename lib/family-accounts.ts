import { createServiceClient } from '@/utils/supabase/service'

export type FamilyAccountSummary = {
  linkedAccounts: Array<{
    id: string
    fullName: string
    avatarUrl: string | null
    birthDate: string | null
    relation: 'owner' | 'associated'
  }>
  pendingRequest: {
    code: string
    expiresAt: string
  } | null
}

/** Devolve as contas ligadas e, para a conta principal, um pedido ainda pendente. */
export async function getFamilyAccountSummary(userId: string): Promise<FamilyAccountSummary> {
  const admin = createServiceClient()
  const { data: links } = await admin
    .from('family_account_links')
    .select('owner_user_id, associated_user_id')
    .or(`owner_user_id.eq.${userId},associated_user_id.eq.${userId}`)


  const counterpartIds = (links || []).map((link) =>
    link.owner_user_id === userId ? link.associated_user_id : link.owner_user_id
  )
  const { data: counterparts } = counterpartIds.length > 0
    ? await admin
      .from('profiles')
      .select('id, full_name, avatar_url, birth_date')
      .in('id', counterpartIds)
    : { data: [] }

  const profilesById = new Map((counterparts || []).map((profile) => [profile.id, profile]))
  const linkedAccounts = (links || []).flatMap((link) => {
    const counterpartId = link.owner_user_id === userId ? link.associated_user_id : link.owner_user_id
    const counterpart = profilesById.get(counterpartId)
    return counterpart ? [{
      id: counterpart.id,
      fullName: counterpart.full_name || 'Conta familiar',
      avatarUrl: counterpart.avatar_url,
      birthDate: counterpart.birth_date,
      relation: link.owner_user_id === userId ? 'owner' as const : 'associated' as const,
    }] : []
  })

  const { data: request } = linkedAccounts.every((account) => account.relation === 'owner')
    ? await admin
        .from('family_account_requests')
        .select('code, expires_at')
        .eq('owner_user_id', userId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
    : { data: null }

  return {
    linkedAccounts,
    pendingRequest: request ? { code: request.code, expiresAt: request.expires_at } : null,
  }
}

export async function canSwitchFamilyAccount(fromUserId: string, toUserId: string) {
  const admin = createServiceClient()
  const { data: link } = await admin
    .from('family_account_links')
    .select('owner_user_id, associated_user_id')
    .or(
      `and(owner_user_id.eq.${fromUserId},associated_user_id.eq.${toUserId}),and(owner_user_id.eq.${toUserId},associated_user_id.eq.${fromUserId})`
    )
    .maybeSingle()
  return !!link
}
