// Ecrã do Clube (Ferramentas da gestão): o que está no projetor e as definições do ranking.
// Lógica pura, partilhada entre o controlo (PC, telemóvel, app) e o projetor.

import { isDayKey, isSection, type RankingSection, type RankingView } from '@/utils/ranking'

export type ClubStage = 'logo' | 'ranking' | 'checkin' | 'timer' | 'raffle' | 'teams'

export const CLUB_STAGES: ClubStage[] = ['logo', 'ranking', 'checkin', 'timer', 'raffle', 'teams']

export function isClubStage(value: unknown): value is ClubStage {
  return typeof value === 'string' && (CLUB_STAGES as string[]).includes(value)
}

/** Página de controlo de cada ferramenta que pode aparecer no ecrã. */
export const STAGE_TOOL_HREF: Partial<Record<ClubStage, string>> = {
  timer: '/admin/ferramentas/cronometro',
  raffle: '/admin/ferramentas/sorteio',
  teams: '/admin/ferramentas/equipas',
}

export type ScrollSpeed = 'slow' | 'normal' | 'fast'

/** Velocidade da descida automática, em alturas de ecrã por segundo. */
export const SCROLL_SPEEDS: Record<ScrollSpeed, number> = {
  slow: 0.035,
  normal: 0.06,
  fast: 0.1,
}

export const SPEED_LABELS: Record<ScrollSpeed, string> = { slow: 'Lento', normal: 'Normal', fast: 'Rápido' }

export type RankingSettings = {
  view: RankingView
  section: RankingSection
  /** Dia do "antes" (pontos até ao fim desse dia). null = ontem, sempre relativo a hoje. */
  beforeDay: string | null
  /** false = mostra o "antes"; true = mostra agora, com quem subiu e desceu. */
  revealed: boolean
  /** Muda a cada "Revelar", para o ecrã voltar a fazer a animação. */
  revealId: string | null
  /** Descida automática ligada. */
  scrolling: boolean
  speed: ScrollSpeed
}

/** Presenças por QR: o evento cujo QR está no ecrã. */
export type CheckinSettings = { eventId: string | null }

/** Estado sincronizado com o projetor (tabela `club_screens.state`). */
export type ClubScreenState = {
  stage: ClubStage
  ranking: RankingSettings
  checkin: CheckinSettings
  /** Hora de envio no relógio de quem enviou (só se compara com mensagens do mesmo `by`). */
  sentAt: number
  /** Quem enviou (um id aleatório por janela aberta). */
  by: string
}

export const DEFAULT_RANKING: RankingSettings = {
  view: 'combined',
  section: 'todos',
  beforeDay: null,
  revealed: false,
  revealId: null,
  scrolling: true,
  speed: 'normal',
}

export const DEFAULT_CLUB_STATE: ClubScreenState = {
  stage: 'logo',
  ranking: DEFAULT_RANKING,
  checkin: { eventId: null },
  sentAt: 0,
  by: 'default',
}

/** Lê o estado vindo da base de dados / de outra janela, aceitando só valores válidos. */
export function normalizeClubState(raw: unknown): ClubScreenState {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const r = s.ranking && typeof s.ranking === 'object' ? (s.ranking as Record<string, unknown>) : {}
  const view: RankingView = r.view === 'xp' || r.view === 'gold' ? r.view : 'combined'
  const speed: ScrollSpeed = r.speed === 'slow' || r.speed === 'fast' ? r.speed : 'normal'
  const c = s.checkin && typeof s.checkin === 'object' ? (s.checkin as Record<string, unknown>) : {}
  return {
    stage: isClubStage(s.stage) ? s.stage : 'logo',
    ranking: {
      view,
      section: isSection(r.section) ? r.section : 'todos',
      beforeDay: isDayKey(r.beforeDay) ? r.beforeDay : null,
      revealed: r.revealed === true,
      revealId: typeof r.revealId === 'string' ? r.revealId : null,
      scrolling: r.scrolling !== false,
      speed,
    },
    checkin: { eventId: typeof c.eventId === 'string' ? c.eventId : null },
    sentAt: typeof s.sentAt === 'number' ? s.sentAt : 0,
    by: typeof s.by === 'string' ? s.by : 'default',
  }
}

/**
 * Janelas no MESMO computador (ex.: a app do clube, ou um separador + a janela do projetor)
 * falam por BroadcastChannel — instantâneo, sem base de dados.
 *   projetor → controlo: hello (pede o estado)
 *   qualquer um → todos: state
 */
export type ClubLocalMessage = { type: 'hello' } | { type: 'state'; state: ClubScreenState }

export function clubLocalChannelName(userId: string) {
  return `club-screen-local-${userId}`
}

export const CLUB_PATH = '/admin/ferramentas/ecra'
export const CLUB_PROJECTOR_PATH = '/admin/ferramentas/ecra/projetor'
export const CLUB_PROJECTOR_WINDOW_NAME = 'ecra-do-clube'

/** Ponte exposta pela app "Ecrã do Clube" (Electron) — só existe dentro da app. */
export type ClubAppScreen = { id: string; label: string; primary: boolean }
export type ClubAppDisplayStatus = { open: boolean; displayId: string | null }
export type ClubAppBridge = {
  version: string
  getScreens: () => Promise<ClubAppScreen[]>
  getDisplayStatus: () => Promise<ClubAppDisplayStatus>
  openDisplay: (displayId: string) => void
  closeDisplay: () => void
  onDisplayStatus: (cb: (status: ClubAppDisplayStatus) => void) => () => void
  onShowStage: (cb: (stage: string) => void) => () => void
  logout: () => void
}

declare global {
  interface Window {
    clubApp?: ClubAppBridge
  }
}

export function getClubApp(): ClubAppBridge | null {
  if (typeof window === 'undefined') return null
  return window.clubApp ?? null
}
