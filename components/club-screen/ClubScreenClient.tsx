'use client'

import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  Coins,
  Copy,
  ExternalLink,
  Flag,
  LogOut,
  MonitorPlay,
  MonitorUp,
  MonitorX,
  Pause,
  Play,
  QrCode,
  RotateCcw,
  Shuffle,
  Smartphone,
  Sparkles,
  Star,
  Timer,
  TriangleAlert,
  Trophy,
  UsersRound,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  CLUB_PROJECTOR_PATH,
  CLUB_PROJECTOR_WINDOW_NAME,
  SPEED_LABELS,
  STAGE_TOOL_HREF,
  getClubApp,
  type ClubAppBridge,
  type ClubAppDisplayStatus,
  type ClubAppScreen,
  type ClubScreenState,
  type ClubStage,
  type RankingSettings,
  type ScrollSpeed,
} from '@/utils/club-screen'
import { SECTIONS, SECTION_LABELS, VIEW_LABELS, dayLabel, localDayKey, yesterdayKey, type RankingSection, type RankingView } from '@/utils/ranking'
import { useClubScreen } from './useClubScreen'
import { CheckinCard } from './CheckinCard'
import type { RaffleEvent } from '@/utils/raffle'

type IconType = ComponentType<{ className?: string }>

const STAGE_BUTTONS: { stage: ClubStage; label: string; icon: IconType; tool?: string }[] = [
  { stage: 'logo', label: 'Logo', icon: Flag },
  { stage: 'ranking', label: 'Ranking', icon: Trophy },
  { stage: 'checkin', label: 'Presenças', icon: QrCode },
  { stage: 'timer', label: 'Cronómetro', icon: Timer, tool: 'o Cronómetro' },
  { stage: 'raffle', label: 'Sorteio', icon: Shuffle, tool: 'o Sorteador' },
  { stage: 'teams', label: 'Equipas', icon: UsersRound, tool: 'o Formador de equipas' },
]

const VIEW_BUTTONS: { view: RankingView; icon: IconType }[] = [
  { view: 'combined', icon: Star },
  { view: 'xp', icon: Trophy },
  { view: 'gold', icon: Coins },
]

const newRevealId = () => Math.random().toString(36).slice(2, 10)

export function ClubScreenClient({
  userId,
  userName,
  initialState,
  events,
}: {
  userId: string
  userName: string
  initialState: ClubScreenState
  /** Eventos recentes e próximos (para as presenças por QR). */
  events: RaffleEvent[]
}) {
  const { state, update, saveError } = useClubScreen(userId, initialState, 'controller')
  const [app, setApp] = useState<ClubAppBridge | null>(null)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setApp(getClubApp()), [])

  const ranking = state.ranking
  const setStage = (stage: ClubStage) => update((s) => ({ ...s, stage }))
  const setRanking = (change: Partial<RankingSettings>) => update((s) => ({ ...s, ranking: { ...s.ranking, ...change } }))
  const setCheckinEvent = (eventId: string | null) => update((s) => ({ ...s, checkin: { eventId } }))

  const reveal = () =>
    update((s) => ({ ...s, stage: 'ranking', ranking: { ...s.ranking, revealed: true, revealId: newRevealId() } }))
  const backToBefore = () => setRanking({ revealed: false })

  const [today, setToday] = useState<Date | null>(null)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setToday(new Date()), [])
  const yesterday = today ? yesterdayKey(today) : null
  const beforeDay = ranking.beforeDay ?? yesterday
  const beforeText = beforeDay && today ? dayLabel(beforeDay, today) : 'ontem'

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 pb-24 pt-6">
      <div className="flex items-center gap-3">
        <Link href="/admin?tab=tools" className="text-slate-500 hover:text-slate-700" title="Voltar às Ferramentas">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <MonitorPlay className="h-6 w-6 text-yellow-500" /> Ecrã do Clube
        </h1>
      </div>

      {saveError && (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <TriangleAlert className="h-5 w-5 flex-shrink-0 text-amber-600" />
          <p>
            Não foi possível guardar no servidor, por isso o controlo a partir de <b>outro dispositivo</b> não funciona (no mesmo
            computador funciona na mesma). A coordenação tem de correr <code>supabase-setup-tools-club-screen.sql</code> no Supabase.
          </p>
        </div>
      )}

      {app ? <AppDisplayCard app={app} userName={userName} /> : <ProjectorCard />}

      {/* O que está no ecrã */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No ecrã agora</CardTitle>
          <CardDescription>Muda na hora o que aparece no projetor.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {STAGE_BUTTONS.map(({ stage, label, icon: Icon }) => {
              const active = state.stage === stage
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setStage(stage)}
                  aria-pressed={active}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3.5 text-xs font-bold transition-colors ${
                    active
                      ? 'border-blue-950 bg-blue-950 text-yellow-300 shadow-md'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  {label}
                </button>
              )
            })}
          </div>
          {STAGE_BUTTONS.filter((b) => b.tool && b.stage === state.stage).map((b) => (
            <Link
              key={b.stage}
              href={STAGE_TOOL_HREF[b.stage]!}
              className="flex items-center justify-between gap-3 rounded-xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900 hover:bg-blue-100"
            >
              <span>Controlar {b.tool}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          ))}
        </CardContent>
      </Card>

      <CheckinCard
        events={events}
        eventId={state.checkin.eventId}
        onScreen={state.stage === 'checkin'}
        onEvent={setCheckinEvent}
        onShow={() => setStage('checkin')}
      />

      {/* Ranking */}
      <Card className={state.stage === 'ranking' ? 'ring-2 ring-yellow-400' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-5 w-5 text-yellow-500" /> Ranking
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                ranking.revealed ? 'bg-yellow-100 text-yellow-800' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {ranking.revealed ? 'A mostrar hoje' : `A mostrar ${beforeText}`}
            </span>
          </CardTitle>
          <CardDescription>
            Começa com os pontos de {beforeText}. Ao revelar, os pontos sobem até hoje e cada um desliza para o novo lugar, com quem subiu e
            desceu.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!ranking.revealed ? (
            <button
              type="button"
              onClick={reveal}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-yellow-400 text-base font-extrabold text-blue-950 shadow-[0_10px_25px_-10px_rgba(250,204,21,.9)] hover:bg-yellow-300"
            >
              <Sparkles className="h-5 w-5" /> Revelar hoje
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={backToBefore}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                <CalendarDays className="h-4 w-4" /> Voltar a {beforeText}
              </button>
              <button
                type="button"
                onClick={reveal}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-950 text-sm font-bold text-yellow-300 hover:bg-blue-900"
              >
                <RotateCcw className="h-4 w-4" /> Revelar outra vez
              </button>
            </div>
          )}
          {state.stage !== 'ranking' && (
            <button
              type="button"
              onClick={() => setStage('ranking')}
              className="flex w-full items-center justify-center gap-2 text-sm font-bold text-blue-800 hover:underline"
            >
              <MonitorUp className="h-4 w-4" /> Pôr o ranking no ecrã
            </button>
          )}

          <Field label="Vista">
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-gray-100 p-1">
              {VIEW_BUTTONS.map(({ view, icon: Icon }) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setRanking({ view })}
                  aria-pressed={ranking.view === view}
                  className={`flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition-colors ${
                    ranking.view === view ? 'bg-white text-blue-950 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Icon className="h-4 w-4" /> {VIEW_LABELS[view].short}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Secção">
            <div className="flex flex-wrap gap-1.5">
              {(['todos', ...SECTIONS] as RankingSection[]).map((section) => (
                <button
                  key={section}
                  type="button"
                  onClick={() => setRanking({ section })}
                  aria-pressed={ranking.section === section}
                  className={`h-9 rounded-full px-3.5 text-sm font-bold transition-colors ${
                    ranking.section === section ? 'bg-blue-950 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {section === 'todos' ? 'Todos' : SECTION_LABELS[section]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Comparar com">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={beforeDay ?? ''}
                max={today ? localDayKey(today) : undefined}
                onChange={(e) => {
                  const v = e.target.value
                  if (!v) return
                  setRanking({ beforeDay: v === yesterday ? null : v, revealed: false })
                }}
                className="h-10 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm"
              />
              {ranking.beforeDay && (
                <button
                  type="button"
                  onClick={() => setRanking({ beforeDay: null, revealed: false })}
                  className="h-10 flex-shrink-0 rounded-xl border border-gray-200 px-3 text-sm font-bold text-gray-600 hover:bg-gray-50"
                >
                  Ontem
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">Pontos até ao fim desse dia. Por defeito é sempre ontem.</p>
          </Field>

          <Field label="Descer pela lista">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setRanking({ scrolling: !ranking.scrolling })}
                className={`flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold ${
                  ranking.scrolling ? 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50' : 'bg-blue-950 text-white'
                }`}
              >
                {ranking.scrolling ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {ranking.scrolling ? 'Pausar' : 'Retomar'}
              </button>
              <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
                {(Object.keys(SPEED_LABELS) as ScrollSpeed[]).map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => setRanking({ speed })}
                    aria-pressed={ranking.speed === speed}
                    className={`h-8 rounded-lg px-3 text-xs font-bold ${
                      ranking.speed === speed ? 'bg-white text-blue-950 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {SPEED_LABELS[speed]}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">Mostra os tops, desce devagar até ao fim e volta ao topo.</p>
          </Field>
        </CardContent>
      </Card>
    </main>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">{label}</p>
      {children}
    </div>
  )
}

/** Dentro da app do clube: escolher o monitor, abrir/fechar o ecrã e trocar de pessoa. */
function AppDisplayCard({ app, userName }: { app: ClubAppBridge; userName: string }) {
  const [screens, setScreens] = useState<ClubAppScreen[]>([])
  const [selected, setSelected] = useState('')
  const [status, setStatus] = useState<ClubAppDisplayStatus>({ open: false, displayId: null })
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([app.getScreens(), app.getDisplayStatus()]).then(([list, st]) => {
      if (cancelled) return
      setScreens(list)
      setStatus(st)
      // Por defeito, um monitor que não seja o principal (o projetor).
      setSelected(st.displayId ?? (list.find((s) => !s.primary) ?? list[0])?.id ?? '')
    })
    const off = app.onDisplayStatus((st) => setStatus(st))
    return () => {
      cancelled = true
      off()
    }
  }, [app])

  const logout = async () => {
    setLeaving(true)
    await createClient()
      .auth.signOut()
      .catch(() => {})
    app.logout()
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-blue-950 px-5 py-3 text-white">
        <p className="min-w-0 truncate text-sm">
          <span className="text-blue-200">Sessão de</span> <b>{userName}</b>
        </p>
        <button
          type="button"
          onClick={logout}
          disabled={leaving}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-yellow-300 ring-1 ring-white/15 hover:bg-white/20 disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5" /> Trocar de pessoa
        </button>
      </div>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MonitorPlay className="h-5 w-5 text-yellow-500" /> Monitor do projetor
          {status.open && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Ecrã aberto
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Escolhe o monitor ligado ao projetor. Também dá para controlar do telemóvel: entra no site com esta conta e abre Gestão →
          Ferramentas → Ecrã do Clube.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={status.open}
          className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm disabled:bg-gray-50"
        >
          {screens.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {status.open ? (
          <button
            type="button"
            onClick={() => app.closeDisplay()}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white hover:bg-red-500"
          >
            <MonitorX className="h-4 w-4" /> Fechar ecrã
          </button>
        ) : (
          <button
            type="button"
            onClick={() => selected && app.openDisplay(selected)}
            disabled={!selected}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-900 px-5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-40"
          >
            <MonitorUp className="h-4 w-4" /> Abrir ecrã
          </button>
        )}
      </CardContent>
    </Card>
  )
}

/** No browser: abrir a janela do projetor, ou usar outro computador com a mesma conta. */
function ProjectorCard() {
  const [origin, setOrigin] = useState('')
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOrigin(window.location.origin), [])

  const openWindow = () => {
    const w = window.open(CLUB_PROJECTOR_PATH, CLUB_PROJECTOR_WINDOW_NAME, 'popup=yes,width=1280,height=720')
    if (!w) {
      toast.error('O browser bloqueou a janela. Permite pop-ups para este site e tenta outra vez.')
      return
    }
    w.focus()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MonitorPlay className="h-5 w-5 text-yellow-500" /> Projetor
        </CardTitle>
        <CardDescription>
          No computador do projetor usa a app <b>Ecrã do Clube</b>, ou abre a janela do projetor, arrasta-a para o projetor e clica em
          &quot;ecrã inteiro&quot;.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <button
          type="button"
          onClick={openWindow}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-900 px-4 text-sm font-bold text-white hover:bg-blue-800 sm:w-auto"
        >
          <ExternalLink className="h-4 w-4" /> Abrir janela do projetor
        </button>
        <div className="space-y-2 border-t border-gray-100 pt-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
            <Smartphone className="h-4 w-4" /> Controlar a partir do telemóvel
          </p>
          <p className="text-sm text-gray-600">
            Com o projetor aberto noutro computador com <b>a tua conta</b>, tudo o que mudares aqui aparece lá. Endereço do projetor:
          </p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-gray-100 px-3 py-2.5 text-xs text-gray-700">
              {origin}
              {CLUB_PROJECTOR_PATH}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(`${origin}${CLUB_PROJECTOR_PATH}`)
                  .then(() => toast.success('Endereço copiado'))
                  .catch(() => toast.error('Não foi possível copiar.'))
              }}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
              title="Copiar"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
