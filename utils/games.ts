// Registo central dos jogos do site + regras de disponibilidade.
//
// Usado pelo Centro de Jogos, pela landing page, pelo painel de gestão (aba "Jogos")
// e pelo middleware. Não importar nada de React/servidor aqui: o middleware também
// usa este ficheiro. Para adicionar um jogo novo basta acrescentar uma entrada a GAMES.
//
// A disponibilidade vive na tabela `game_settings` (supabase-migration-game-settings.sql).
// Um jogo sem linha na tabela (ou se a tabela ainda não existir) conta como ativo para todos.
//
// Para cada visitante, um jogo está num de três estados:
//   • available   → aparece e pode jogar
//   • unavailable → aparece como "Indisponível" e não entra
//   • hidden      → nem aparece (surpresas); o link direto dá 404

import type { SupabaseClient } from '@supabase/supabase-js'

export const GAME_ROLES = ['desbravador', 'dirigente', 'coordenador'] as const
export type GameRole = (typeof GAME_ROLES)[number]

export const GAME_ROLE_LABELS: Record<GameRole, string> = {
  desbravador: 'Desbravadores',
  dirigente: 'Dirigentes',
  coordenador: 'Coordenação',
}

export interface GameDefinition {
  id: string
  title: string
  description: string
  image: string
  /** Página do jogo; tudo o que estiver debaixo deste caminho respeita a disponibilidade. */
  href: string
  /** Para onde mandar quem não tem sessão iniciada (jogos que exigem conta). */
  loginHref: string
  /** Página de gestão do jogo; ausente nos jogos que não têm nada a gerir. */
  adminHref?: string
  /** Gradiente Tailwind do cartão. */
  color: string
  /** true → jogar precisa de login; false → convidados sem conta também jogam. */
  requiresAuth: boolean
  /** A página de gestão só aparece à coordenação. */
  adminCoordOnly: boolean
}

export const GAMES: GameDefinition[] = [
  {
    id: 'vantur',
    title: 'VANTUR',
    description: 'O clássico jogo de adivinhar palavras bíblicas. Solo, Mix ou Plex!',
    image: '/images/vantur.png',
    href: '/jogos/vantur',
    loginHref: '/login?next=/jogos/vantur',
    adminHref: '/admin/vantur',
    color: 'from-amber-400 to-orange-600',
    requiresAuth: true,
    adminCoordOnly: true,
  },
  {
    id: 'vana-quest',
    title: 'VanaQuest',
    description: 'Quiz em tempo real ao estilo Kahoot! Responde rápido, acumula pontos e sobe ao pódio.',
    image: '/images/VanaQuest.png',
    href: '/jogos/vana-quest',
    loginHref: '/jogos/vana-quest',
    adminHref: '/admin/vana-quest',
    color: 'from-blue-700 via-blue-900 to-yellow-500',
    requiresAuth: false,
    adminCoordOnly: true,
  },
  {
    id: 'vana-words',
    title: 'VanaWords',
    description: 'Jogo de palavras secretas ao estilo Codenames! Guia a tua equipa com dicas e descobre as palavras certas.',
    image: '/images/VanaWords.png',
    href: '/jogos/vana-words',
    loginHref: '/login?next=/jogos/vana-words',
    adminHref: '/admin/vana-words',
    color: 'from-emerald-600 via-teal-700 to-indigo-800',
    requiresAuth: true,
    adminCoordOnly: false,
  },
  {
    id: 'vana-trilha',
    title: 'VanaTrilha',
    description: 'A Rota da Promessa. Desafio bíblico diário: do Egito à Terra Prometida.',
    image: '/images/VanaTrilha.png',
    href: '/jogos/vana-trilha',
    loginHref: '/login?next=/jogos/vana-trilha',
    adminHref: '/admin/vana-trilha',
    color: 'from-amber-500 via-orange-600 to-yellow-500',
    requiresAuth: true,
    adminCoordOnly: false,
  },
  {
    id: 'vana-camp',
    title: 'VanaCamp: Infiltrados',
    description: 'Jogo de dedução e aventura do clube. Descobre quem sabota o acampamento antes que seja tarde.',
    image: '/images/VanaCamp.png',
    href: '/jogos/vana-camp',
    loginHref: '/login?next=/jogos/vana-camp',
    adminHref: '/admin/vana-camp',
    color: 'from-stone-900 via-amber-900 to-orange-600',
    requiresAuth: true,
    adminCoordOnly: true,
  },
  {
    id: 'vana-espada',
    title: 'VanaEspada',
    description: 'Onde está este versículo? Saca a tua Bíblia e sê o mais rápido do JA!',
    image: '/images/VanaEspada.jpeg',
    href: '/jogos/vana-espada',
    loginHref: '/jogos/vana-espada',
    adminHref: '/admin/vana-espada',
    color: 'from-slate-800 via-sky-800 to-amber-400',
    requiresAuth: false,
    adminCoordOnly: false,
  },
  {
    id: 'vana-sketch',
    title: 'VanaSketch',
    description: 'Pictionary bíblico! Um desenha no telemóvel, o desenho aparece no projetor e os outros adivinham.',
    image: '/images/VanaSketch.png',
    href: '/jogos/vana-sketch',
    loginHref: '/login?next=/jogos/vana-sketch',
    adminHref: '/admin/vana-sketch',
    color: 'from-pink-500 via-rose-600 to-indigo-800',
    requiresAuth: true,
    adminCoordOnly: false,
  },
  {
    id: 'vana-codigo',
    title: 'VanaCódigo',
    description: 'Desafio diário de decifração! Morse, Semáforo e Cifras — o código muda todos os dias.',
    image: '/images/VanaCodigo.png',
    href: '/jogos/vana-codigo',
    loginHref: '/login?next=/jogos/vana-codigo',
    adminHref: '/admin/vana-codigo',
    color: 'from-emerald-500 via-emerald-700 to-slate-800',
    requiresAuth: true,
    adminCoordOnly: false,
  },
]

export function getGame(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id)
}

/** Jogo a que pertence um caminho (ex.: /jogos/vana-words/abc/control → VanaWords). */
export function findGameByPath(pathname: string): GameDefinition | undefined {
  return GAMES.find((g) => pathname === g.href || pathname.startsWith(`${g.href}/`))
}

/**
 * Ecrãs de projetor (/present) são públicos por natureza: só existem para sessões
 * criadas por quem pôde entrar no jogo. Por isso só são bloqueados quando o jogo
 * está desativado — a restrição por cargos não se aplica a eles.
 */
export function isSpectatorPath(pathname: string): boolean {
  return /\/present(\/|$)/.test(pathname)
}

export interface GameSetting {
  game_id: string
  enabled: boolean
  allowed_roles: GameRole[]
  /** Esconder o jogo (em vez de o mostrar como indisponível) a quem não pode jogar. */
  hidden: boolean
}

export function defaultGameSetting(gameId: string): GameSetting {
  return { game_id: gameId, enabled: true, allowed_roles: [...GAME_ROLES], hidden: false }
}

/** Mapa jogo → definição, com o valor por defeito para jogos sem linha na BD. */
export function buildGameSettingsMap(rows: Partial<GameSetting>[] | null | undefined): Record<string, GameSetting> {
  const map: Record<string, GameSetting> = {}
  for (const game of GAMES) map[game.id] = defaultGameSetting(game.id)
  for (const row of rows ?? []) {
    if (!row.game_id) continue
    map[row.game_id] = normalizeGameSetting(row.game_id, row)
  }
  return map
}

// `select('*')`: se faltar uma coluna nova (migração por correr), o resto da configuração continua a valer.
export async function fetchGameSettings(supabase: SupabaseClient): Promise<Record<string, GameSetting>> {
  const { data } = await supabase.from('game_settings').select('*')
  return buildGameSettingsMap(data as Partial<GameSetting>[] | null)
}

export async function fetchGameSetting(supabase: SupabaseClient, gameId: string): Promise<GameSetting> {
  const { data } = await supabase
    .from('game_settings')
    .select('*')
    .eq('game_id', gameId)
    .maybeSingle()
  return normalizeGameSetting(gameId, data as Partial<GameSetting> | null)
}

export function normalizeGameSetting(gameId: string, row: Partial<GameSetting> | null | undefined): GameSetting {
  if (!row) return defaultGameSetting(gameId)
  const roles = (row.allowed_roles ?? []).filter((r): r is GameRole => (GAME_ROLES as readonly string[]).includes(r))
  return { game_id: gameId, enabled: row.enabled !== false, allowed_roles: roles, hidden: row.hidden === true }
}

/**
 * Público a que alguém pertence para efeitos de disponibilidade.
 * Usa o cargo EFETIVO (ajudantes contam como o cargo que ajudam).
 * Membros sem cargo de liderança e visitantes sem conta contam como desbravadores.
 */
export function gameAudienceOf(role: string | null | undefined): GameRole {
  return role === 'dirigente' || role === 'coordenador' ? role : 'desbravador'
}

export function canAccessGame(setting: GameSetting | null | undefined, role: string | null | undefined): boolean {
  if (!setting) return true
  if (!setting.enabled) return false
  return setting.allowed_roles.includes(gameAudienceOf(role))
}

export function isOpenToEveryone(setting: GameSetting): boolean {
  return setting.enabled && GAME_ROLES.every((r) => setting.allowed_roles.includes(r))
}

export type GameVisibility = 'available' | 'unavailable' | 'hidden'

/** Estado do jogo para um cargo (null = visitante sem conta). */
export function gameVisibilityFor(setting: GameSetting | null | undefined, role: string | null | undefined): GameVisibility {
  if (canAccessGame(setting, role)) return 'available'
  return setting?.hidden ? 'hidden' : 'unavailable'
}

export type GameAvailabilityTone = 'green' | 'amber' | 'red'

/**
 * Resumo legível da configuração, ex.: "Só liderança", "Desativado".
 * `hidden` só é true quando há alguém de quem o jogo está escondido.
 */
export function gameAvailabilitySummary(setting: GameSetting): { label: string; tone: GameAvailabilityTone; hidden: boolean } {
  if (!setting.enabled || setting.allowed_roles.length === 0) {
    return { label: 'Desativado', tone: 'red', hidden: setting.hidden }
  }
  if (isOpenToEveryone(setting)) return { label: 'Disponível para todos', tone: 'green', hidden: false }

  const has = (r: GameRole) => setting.allowed_roles.includes(r)
  if (!has('desbravador') && has('dirigente') && has('coordenador')) {
    return { label: 'Só liderança', tone: 'amber', hidden: setting.hidden }
  }

  const names = GAME_ROLES.filter(has).map((r) => GAME_ROLE_LABELS[r])
  const label = names.length === 1 ? `Só ${names[0].toLowerCase()}` : names.join(' e ')
  return { label, tone: 'amber', hidden: setting.hidden }
}
