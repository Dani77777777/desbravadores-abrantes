import type { VanaQuestSoundKey, VanaQuestTheme } from './types'
import { normalTheme } from './normal'
import { natalTheme } from './natal'

export type { VanaQuestTheme, VanaQuestSoundKey, VanaQuestSurface, PodiumCelebration } from './types'
export { normalTheme }

/**
 * REGISTO CENTRAL dos temas do VanaQuest. A ordem é a do seletor no admin.
 * Para um tema novo: cria o ficheiro (ex.: pascoa.tsx) e acrescenta-o aqui.
 */
export const VANA_QUEST_THEMES: VanaQuestTheme[] = [normalTheme, natalTheme]

export const DEFAULT_VANA_QUEST_THEME = normalTheme.id

const BY_ID = new Map(VANA_QUEST_THEMES.map((t) => [t.id, t]))

export function isVanaQuestThemeId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id)
}

/** Tema desconhecido, vazio ou null → 'normal'. */
export function normalizeVanaQuestThemeId(id: unknown): string {
  return isVanaQuestThemeId(id) ? id : DEFAULT_VANA_QUEST_THEME
}

export function getVanaQuestTheme(id: unknown): VanaQuestTheme {
  return BY_ID.get(normalizeVanaQuestThemeId(id)) ?? normalTheme
}

/**
 * Tema de uma sessão a partir do `vana_quests(*)` embebido na query
 * (objeto ou array, conforme o Supabase). Sem coluna/valor → 'normal'.
 */
export function themeIdFromQuestJoin(joined: unknown): string {
  const quest = Array.isArray(joined) ? joined[0] : joined
  return normalizeVanaQuestThemeId((quest as { theme?: unknown } | null | undefined)?.theme)
}

// ── Áudio ──────────────────────────────────────────────────────────────

const SOUNDS_DIR = '/sounds/VanaQuest - soundboard'

/** encodeURI para escapar espaços/caracteres especiais (essencial em produção / Vercel). */
export function vanaQuestSoundUrl(file: string) {
  return encodeURI(`${SOUNDS_DIR}/${file}`)
}

export interface ResolvedSound {
  key: VanaQuestSoundKey
  /** Ficheiro a tocar (do tema, ou o normal se o tema não tiver este som). */
  src: string
  /** Ficheiro normal para usar se `src` falhar; null quando `src` já é o normal. */
  fallback: string | null
}

export function resolveVanaQuestSound(theme: VanaQuestTheme, key: VanaQuestSoundKey): ResolvedSound {
  const normal = vanaQuestSoundUrl(normalTheme.sounds[key])
  const own = theme.sounds[key]
  const src = own ? vanaQuestSoundUrl(own) : normal
  return { key, src, fallback: src === normal ? null : normal }
}
