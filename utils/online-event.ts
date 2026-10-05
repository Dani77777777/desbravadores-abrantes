// Eventos online: link da reunião (Meet, Zoom, Teams, YouTube…) em vez de local físico.

export type OnlinePlace = {
  is_online?: boolean | null
  online_url?: string | null
}

export function isOnlineEvent(e: OnlinePlace): boolean {
  return !!e.is_online
}

/** Acrescenta https:// quando falta. null se não parecer um link. */
export function normalizeUrl(input: string): string | null {
  const v = input.trim()
  if (!v) return null
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`
  try {
    const u = new URL(withScheme)
    if (!u.hostname.includes('.') || /\s/.test(withScheme)) return null
    return u.toString()
  } catch {
    return null
  }
}

const PLATFORMS: [RegExp, string][] = [
  [/(^|\.)meet\.google\.com$/, 'Google Meet'],
  [/(^|\.)zoom\.(us|com)$/, 'Zoom'],
  [/(^|\.)teams\.(microsoft|live)\.com$/, 'Microsoft Teams'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)(discord\.gg|discord\.com)$/, 'Discord'],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, 'WhatsApp'],
  [/(^|\.)jit\.si$/, 'Jitsi'],
  [/(^|\.)(facebook\.com|fb\.watch)$/, 'Facebook'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)twitch\.tv$/, 'Twitch'],
]

/** Nome da plataforma a partir do link ("Google Meet", "Zoom"…), ou null. */
export function onlinePlatform(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const host = new URL(url).hostname.toLowerCase()
    return PLATFORMS.find(([re]) => re.test(host))?.[1] ?? null
  } catch {
    return null
  }
}

/** "Online · Google Meet" / "Online". */
export function onlineLabel(e: OnlinePlace): string {
  const p = onlinePlatform(e.online_url)
  return p ? `Online · ${p}` : 'Online'
}

/** Link sem https:// nem barra final, para mostrar ("meet.google.com/abc-defg-hij"). */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')
}
