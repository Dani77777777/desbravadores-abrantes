import type { SupabaseClient } from '@supabase/supabase-js'
import { AVATAR_BUCKET, ownAvatarPath } from '@/utils/avatar'

/** Tamanho máximo aceite antes de redimensionar (fotos de telemóvel chegam a 10 MB). */
export const AVATAR_MAX_BYTES = 15 * 1024 * 1024
const AVATAR_SIZE = 512

/**
 * Reduz a foto a um quadrado de 512px em JPEG (corta ao centro), para não guardar
 * fotos de câmara com vários MB. Se o browser não conseguir ler o formato
 * (ex.: HEIC fora do Safari), envia o ficheiro original.
 */
async function resizeAvatar(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const side = Math.min(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = Math.min(AVATAR_SIZE, side)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
      0, 0, canvas.width, canvas.height,
    )
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    return blob ?? file
  } catch {
    return file
  }
}

/** Carrega a foto para `avatars/<userId>-…` e devolve o URL público. */
export async function uploadAvatar(supabase: SupabaseClient, userId: string, file: File): Promise<string> {
  const blob = await resizeAvatar(file)
  const isJpeg = blob !== file || file.type === 'image/jpeg'
  const ext = isJpeg ? 'jpg' : (file.name.split('.').pop() || 'img').toLowerCase()
  const path = `avatars/${userId}-${Date.now()}.${ext}`

  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, {
    cacheControl: '3600',
    upsert: false,
    contentType: isJpeg ? 'image/jpeg' : file.type || undefined,
  })
  if (error) throw error

  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl
}

/** Desfaz um upload quando a gravação do perfil falha (para não deixar ficheiros órfãos). */
export async function discardUploadedAvatar(supabase: SupabaseClient, userId: string, url: string) {
  const path = ownAvatarPath(url, userId)
  if (path) await supabase.storage.from(AVATAR_BUCKET).remove([path])
}
