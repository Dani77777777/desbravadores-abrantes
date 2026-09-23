// Fotos de perfil guardadas no bucket público do Supabase (pasta avatars/).
// Partilhado entre cliente e servidor: não importar nada de servidor aqui.

export const AVATAR_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'imagens'

/**
 * Caminho no bucket de um avatar carregado pelo próprio utilizador
 * (`avatars/<userId>-…`), ou null se o URL for externo, de outra pasta ou de outra pessoa.
 * Serve de guarda antes de apagar ficheiros: nunca apagamos algo que não seja do utilizador.
 */
export function ownAvatarPath(url: string | null | undefined, userId: string): string | null {
  if (!url || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null
  try {
    const parsed = new URL(url)
    const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
    const prefix = `/storage/v1/object/public/${AVATAR_BUCKET}/`
    if (parsed.origin !== base.origin || !parsed.pathname.startsWith(prefix)) return null
    const path = decodeURIComponent(parsed.pathname.slice(prefix.length))
    if (path.includes('..') || !path.startsWith(`avatars/${userId}-`)) return null
    return path
  } catch {
    return null
  }
}
