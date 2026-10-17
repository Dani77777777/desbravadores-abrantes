import { createServiceClient } from '@/utils/supabase/service'

export type FamilyAccountSummary = {
  linkedAccount: {
    id: string
    fullName: string
    avatarUrl: string | null
    relation: 'owner' | 'associated'
  } | null
  pendingRequest: {
    code: string
    expiresAt: string
  } | null
}

/** Devolve a única conta ligada e, para a conta principal, um pedido ainda pendente. */
export async function getFamilyAccountSummary(userId: string): Promise<FamilyAccountSummary> {
  const admin = createServiceClient()
  const { data: link } = await admin
    .from('family_account_links')
    .select('owner_user_id, associated_user_id')
    .or(`owner_user_id.eq.${userId},associated_user_id.eq.${userId}`)
    .maybeSingle()

  let linkedAccount: FamilyAccountSummary['linkedAccount'] = null
  if (link) {
    const counterpartId = link.owner_user_id === userId ? link.associated_user_id : link.owner_user_id
    const { data: counterpart } = await admin
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', counterpartId)
      .maybeSingle()

    if (counterpart) {
      linkedAccount = {
        id: counterpart.id,
        fullName: counterpart.full_name || 'Conta familiar',
        avatarUrl: counterpart.avatar_url,
        relation: link.owner_user_id === userId ? 'owner' : 'associated',
      }
    }
  }

  const { data: request } = !linkedAccount
    ? await admin
        .from('family_account_requests')
        .select('code, expires_at')
        .eq('owner_user_id', userId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
    : { data: null }

  return {
    linkedAccount,
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
