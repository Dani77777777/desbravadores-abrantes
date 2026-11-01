import { createServiceClient } from '@/utils/supabase/service'
import { childrenOf, clubFamilyGroups, familyPlaceOf } from '@/lib/club-families'

type Service = ReturnType<typeof createServiceClient>

/**
 * Quem esta conta pode marcar em "Quem está aqui?": a própria e, se for adulto da família,
 * as crianças da família (as mesmas contas em que pode entrar). Começa sempre pela própria.
 */
export async function familyGroupIds(service: Service, userId: string): Promise<string[]> {
  const place = await familyPlaceOf(service, userId)
  if (!place || place.kind !== 'adult') return [userId]
  const children = await childrenOf(service, place.familyId)
  return [userId, ...children.filter((id) => id !== userId)]
}

/**
 * Todas as famílias que juntam pelo menos duas pessoas de `memberIds`.
 * Usado no Formador de equipas para não separar famílias.
 */
export async function familyGroupsAmong(service: Service, memberIds: string[]): Promise<string[][]> {
  if (memberIds.length === 0) return []
  const wanted = new Set(memberIds)
  return (await clubFamilyGroups(service)).map((ids) => ids.filter((id) => wanted.has(id))).filter((ids) => ids.length > 1)
}
