import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { normalizeFamilyCode } from '@/utils/club-families'

// Link de convite para uma família do clube (/familia/ABCD2345). Leva ao perfil com o código
// já escrito; sem sessão, passa primeiro pelo login e volta ao perfil.
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizeFamilyCode((await params).code)
  const profile = `/profile?familia=${code}#familia`
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const url = request.nextUrl.clone()
  url.hash = ''
  if (user) {
    url.pathname = '/profile'
    url.search = `?familia=${code}`
    url.hash = 'familia'
  } else {
    url.pathname = '/login'
    url.search = `?next=${encodeURIComponent(profile)}`
  }
  return NextResponse.redirect(url)
}
