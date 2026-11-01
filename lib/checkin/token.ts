import crypto from 'node:crypto'
import { CHECKIN_PASS_MS, checkinSlot, slotIsFresh } from '@/utils/checkin'

// Assinaturas das presenças por QR. A chave é a service role (já é segredo do servidor),
// como nos links de "deixar de receber" dos convites.
//   • código do QR: `<troca em base36>.<assinatura>` — muda a cada 30 s, por isso uma foto
//     enviada para o grupo deixa de servir passado um minuto;
//   • passe: depois de ler o QR, um cookie de 30 min para dar tempo de entrar na conta.

function key() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function sign(payload: string, length: number) {
  return crypto.createHmac('sha256', key()).update(payload).digest('base64url').slice(0, length)
}

function sameText(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

export function qrToken(eventId: string, now = Date.now()) {
  const slot = checkinSlot(now)
  return `${slot.toString(36)}.${sign(`checkin-qr:${eventId}:${slot}`, 16)}`
}

export function isValidQrToken(eventId: string, token: string | null | undefined, now = Date.now()) {
  if (!key() || !token) return false
  const [slotText, sig] = token.split('.')
  const slot = parseInt(slotText ?? '', 36)
  if (!sig || !slotIsFresh(slot, now)) return false
  return sameText(sig, sign(`checkin-qr:${eventId}:${slot}`, 16))
}

export function passValue(eventId: string, now = Date.now()) {
  const exp = (now + CHECKIN_PASS_MS).toString(36)
  return `${eventId}.${exp}.${sign(`checkin-pass:${eventId}:${exp}`, 22)}`
}

/** Id do evento do passe, se for válido e ainda não tiver expirado. */
export function eventFromPass(value: string | null | undefined, now = Date.now()): string | null {
  if (!key() || !value) return null
  const [eventId, exp, sig] = value.split('.')
  if (!eventId || !exp || !sig || parseInt(exp, 36) < now) return null
  return sameText(sig, sign(`checkin-pass:${eventId}:${exp}`, 22)) ? eventId : null
}
