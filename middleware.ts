import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * - áudio - .mp3, .wav, .ogg, .m4a (música e efeitos dos jogos). Sem isto, um
     *   projetor sem sessão iniciada recebia o /login em vez do mp3 e ficava mudo.
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sitemap.xml|robots.txt|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|wav|ogg|m4a)$).*)',
  ],
}
