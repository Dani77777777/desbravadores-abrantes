import crypto from 'crypto'
import { createServiceClient } from '@/utils/supabase/service'
import { childrenOf, familyPlaceOf } from '@/lib/club-families'

// Trocar de conta dentro da família: um adulto entra nas contas das crianças da sua família.
// A sessão passa mesmo para a conta da criança, por isso, para o adulto poder voltar, fica um
// cookie assinado "o adulto X entrou na conta da criança Y". Só com ele a criança tem o botão
// de voltar (e de passar para os irmãos); quem entra sozinho na conta da criança não o tem.

export const FAMILY_RETURN_COOKIE = 'familia_voltar'
export const FAMILY_RETURN_MAX_AGE = 12 * 60 * 60

export type SwitchableAccount = {
  id: string
  fullName: string
  avatarUrl: string | null
  birthDate: string | null
  /** child: conta de uma criança; return: voltar à conta do adulto que entrou. */
  relation: 'child' | 'return'
}

function sign(payload: string) {
  return crypto.createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || '').update(`familia:${payload}`).digest('base64url').slice(0, 22)
}

export function familyReturnValue(adultId: string, childId: string) {
  return `${adultId}.${childId}.${sign(`${adultId}.${childId}`)}`
}

function readReturn(value: string | null | undefined): { adultId: string; childId: string } | null {
  if (!value || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  const [adultId, childId, sig] = value.split('.')
  if (!adultId || !childId || !sig) return null
  const expected = Buffer.from(sign(`${adultId}.${childId}`))
  const given = Buffer.from(sig)
  return expected.length === given.length && crypto.timingSafeEqual(expected, given) ? { adultId, childId } : null
}

/**
 * As contas para onde esta sessão pode mudar:
 *   • um adulto: as crianças da sua família;
 *   • uma criança, só se um adulto da família entrou nela (cookie): voltar a esse adulto e os irmãos.
 */
export async function switchableAccounts(userId: string, returnCookie: string | null | undefined): Promise<SwitchableAccount[]> {
  const service = createServiceClient()
  const place = await familyPlaceOf(service, userId)
  if (!place) return []

  let actingAdult: string | null = null
  if (place.kind === 'adult') actingAdult = userId
  else {
    const ret = readReturn(returnCookie)
    if (ret && ret.childId === userId) {
      const adult = await familyPlaceOf(service, ret.adultId)
      if (adult?.kind === 'adult' && adult.familyId === place.familyId) actingAdult = ret.adultId
    }
  }
  if (!actingAdult) return []

  const children = (await childrenOf(service, place.familyId)).filter((id) => id !== userId)
  const back = actingAdult !== userId ? [actingAdult] : []
  const ids = [...back, ...children]
  if (ids.length === 0) return []
  const { data: profiles } = await service.from('profiles').select('id, full_name, avatar_url, birth_date').in('id', ids)
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]))
  return ids.flatMap((id) => {
    const p = byId.get(id)
    if (!p) return []
    return [{
      id,
      fullName: (p.full_name as string) || 'Conta familiar',
      avatarUrl: (p.avatar_url as string | null) ?? null,
      birthDate: (p.birth_date as string | null) ?? null,
      relation: back.includes(id) ? 'return' as const : 'child' as const,
    }]
  }).sort((a, b) => (a.relation === b.relation ? a.fullName.localeCompare(b.fullName, 'pt') : a.relation === 'return' ? -1 : 1))
}

/**
 * Se esta sessão pode mudar para `targetId`, devolve o novo valor do cookie de voltar
 * (string ao entrar numa criança, null ao voltar ao adulto). Senão, `allowed: false`.
 */
export async function familySwitch(userId: string, targetId: string, returnCookie: string | null | undefined) {
  const accounts = await switchableAccounts(userId, returnCookie)
  const target = accounts.find((a) => a.id === targetId)
  if (!target) return { allowed: false as const }
  if (target.relation === 'return') return { allowed: true as const, cookie: null }
  const adultId = readReturn(returnCookie)?.childId === userId ? readReturn(returnCookie)!.adultId : userId
  return { allowed: true as const, cookie: familyReturnValue(adultId, targetId) }
}
