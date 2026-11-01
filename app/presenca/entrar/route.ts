import { NextResponse, type NextRequest } from 'next/server'
import { isValidQrToken, passValue } from '@/lib/checkin/token'
import { CHECKIN_PASS_COOKIE, CHECKIN_PASS_MS } from '@/utils/checkin'

// Destino do QR das presenças (Ecrã do Clube → Presenças). O código do QR muda a cada
// 30 s; se ainda for válido, o telemóvel recebe um passe de 30 min para este evento
// (dá tempo de entrar na conta) e segue para a página de marcar presença.
export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get('e') || ''
  const token = request.nextUrl.searchParams.get('t')
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return NextResponse.redirect(new URL('/', request.url))

  const url = request.nextUrl.clone()
  url.pathname = `/presenca/${eventId}`
  url.search = ''

  if (!isValidQrToken(eventId, token)) {
    url.search = '?expirado=1'
    return NextResponse.redirect(url)
  }

  const response = NextResponse.redirect(url)
  response.cookies.set(CHECKIN_PASS_COOKIE, passValue(eventId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(CHECKIN_PASS_MS / 1000),
  })
  return response
}
