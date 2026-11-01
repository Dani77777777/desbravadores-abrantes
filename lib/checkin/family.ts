import { createServiceClient } from '@/utils/supabase/service'

type Service = ReturnType<typeof createServiceClient>

/**
 * A família de uma conta, pelas contas familiares: a conta principal e todos os perfis
 * associados a ela (irmãos incluídos). Sem ligações, é só a própria conta.
 * Começa sempre pela própria conta.
 */
export async function familyGroupIds(service: Service, userId: string): Promise<string[]> {
  const { data: asAssociated } = await service
    .from('family_account_links')
    .select('owner_user_id')
    .eq('associated_user_id', userId)
    .maybeSingle()
  const ownerId = asAssociated?.owner_user_id ?? userId
  const { data: links } = await service.from('family_account_links').select('associated_user_id').eq('owner_user_id', ownerId)
  const ids = [ownerId, ...(links ?? []).map((l) => l.associated_user_id as string)]
  return [userId, ...ids.filter((id) => id !== userId)]
}

/**
 * Todas as famílias (conta principal + perfis associados) que juntam pelo menos duas
 * pessoas de `memberIds`. Usado no Formador de equipas para não separar famílias.
 */
export async function familyGroupsAmong(service: Service, memberIds: string[]): Promise<string[][]> {
  if (memberIds.length === 0) return []
  const { data } = await service.from('family_account_links').select('owner_user_id, associated_user_id')
  const wanted = new Set(memberIds)
  const byOwner = new Map<string, string[]>()
  for (const l of data ?? []) {
    const list = byOwner.get(l.owner_user_id) ?? [l.owner_user_id]
    list.push(l.associated_user_id)
    byOwner.set(l.owner_user_id, list)
  }
  return [...byOwner.values()].map((ids) => ids.filter((id) => wanted.has(id))).filter((ids) => ids.length > 1)
}
