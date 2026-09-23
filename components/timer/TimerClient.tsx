'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ChevronLeft,
  Copy,
  ExternalLink,
  Flag,
  Minus,
  MonitorPlay,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Smartphone,
  Timer,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  DEFAULT_CONFIG,
  MAX_ROUNDS,
  MAX_TEAMS,
  MODE_LABELS,
  TIMER_PROJECTOR_PATH,
  TIMER_PROJECTOR_WINDOW_NAME,
  formatTimer,
  newTimerId,
  timerLocalChannelName,
  totalDurationMs,
  type TimerConfig,
  type TimerLap,
  type TimerLocalMessage,
  type TimerMode,
  type TimerScreenState,
} from '@/utils/timer'
import { unlockTimerSound } from '@/utils/timer-sound'
import { TimerStage } from './TimerStage'

type Saved = { v: 1; config: TimerConfig; sound: boolean; projector: boolean }

const MODES: { id: TimerMode; hint: string }[] = [
  { id: 'countdown', hint: 'Defines um tempo e ele conta até zero.' },
  { id: 'stopwatch', hint: 'Conta a partir de zero, para medir quanto tempo demora.' },
  { id: 'laps', hint: 'Cronómetro a subir: carregas no nome de cada equipa quando termina e sai o ranking.' },
  { id: 'rounds', hint: 'Várias rondas seguidas com pausa entre elas; passa sozinho de uma para a outra.' },
]

function storageKey(userId: string) {
  return `timer:v1:${userId}`
}

function loadSaved(userId: string): Saved | null {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const s = JSON.parse(raw) as Saved
    return s?.v === 1 && s.config ? s : null
  } catch {
    return null
  }
}

export function TimerClient({ userId }: { userId: string }) {
  const [supabase] = useState(() => createClient())

  const [hydrated, setHydrated] = useState(false)
  const [config, setConfig] = useState<TimerConfig>(DEFAULT_CONFIG)
  const [sound, setSound] = useState(true)
  const [projector, setProjector] = useState(false)

  // Relógio: tempo acumulado antes da corrida atual + hora (local) em que começou a correr.
  const [runId, setRunId] = useState(() => newTimerId())
  const [running, setRunning] = useState(false)
  const [baseElapsed, setBaseElapsed] = useState(0)
  const [startedAt, setStartedAt] = useState(0)
  const [laps, setLaps] = useState<TimerLap[]>([])
  const [teamName, setTeamName] = useState('')

  const elapsedNow = useCallback(
    () => baseElapsed + (running ? Date.now() - startedAt : 0),
    [baseElapsed, running, startedAt],
  )

  // ── Guardar as definições neste browser ────────────────────
  // Lido só depois de montar (no servidor não há localStorage; evita diferenças na hidratação).
  useEffect(() => {
    const saved = loadSaved(userId)
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConfig({ ...DEFAULT_CONFIG, ...saved.config, rounds: { ...DEFAULT_CONFIG.rounds, ...saved.config.rounds } })
      setSound(saved.sound !== false)
      setProjector(!!saved.projector)
    }
    setHydrated(true)
  }, [userId])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify({ v: 1, config, sound, projector } satisfies Saved))
    } catch {
      /* armazenamento indisponível — segue sem guardar */
    }
  }, [hydrated, userId, config, sound, projector])

  // ── Controlo ───────────────────────────────────────────────
  const total = totalDurationMs(config)
  const started = running || baseElapsed > 0
  const finished = total !== null && !running && baseElapsed >= total
  const allTeamsDone = config.mode === 'laps' && config.teams.length > 0 && laps.length >= config.teams.length

  const reset = useCallback(() => {
    setRunId(newTimerId())
    setRunning(false)
    setBaseElapsed(0)
    setStartedAt(0)
    setLaps([])
  }, [])

  const start = () => {
    unlockTimerSound()
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    if (config.mode === 'countdown' && config.durationMs <= 0) {
      toast.error('Escolhe um tempo maior que zero.')
      return
    }
    if (config.mode === 'rounds' && config.rounds.workMs <= 0) {
      toast.error('Escolhe a duração de cada ronda.')
      return
    }
    // Acabou (ou todas as equipas terminaram) → recomeça do zero
    if (finished || allTeamsDone) {
      setRunId(newTimerId())
      setBaseElapsed(0)
      setLaps([])
    }
    setStartedAt(Date.now())
    setRunning(true)
  }

  const pause = useCallback(() => {
    setBaseElapsed(elapsedNow())
    setRunning(false)
  }, [elapsedNow])

  const toggle = () => (running ? pause() : start())

  // Contagem/rondas: para sozinho no fim (fica exatamente no total).
  useEffect(() => {
    if (!running || total === null) return
    const check = () => {
      if (baseElapsed + Date.now() - startedAt >= total) {
        setBaseElapsed(total)
        setRunning(false)
      }
    }
    const t = setInterval(check, 100)
    return () => clearInterval(t)
  }, [running, total, baseElapsed, startedAt])

  const markTeam = (team: string) => {
    if (!running) return
    if (laps.some((l) => l.team === team)) return
    const next = [...laps, { team, ms: elapsedNow() }]
    setLaps(next)
    // A última equipa terminou → pausa
    if (config.teams.every((t) => next.some((l) => l.team === t))) pause()
  }

  const undoLap = (team: string) => setLaps((prev) => prev.filter((l) => l.team !== team))

  const updateConfig = (patch: Partial<TimerConfig>) => setConfig((c) => ({ ...c, ...patch }))

  const setMode = (mode: TimerMode) => {
    if (mode === config.mode) return
    reset()
    updateConfig({ mode })
  }

  const addTeam = () => {
    const name = teamName.trim().replace(/\s+/g, ' ')
    if (!name) return
    if (config.teams.some((t) => t.toLowerCase() === name.toLowerCase())) {
      toast.error('Já existe uma equipa com esse nome.')
      return
    }
    if (config.teams.length >= MAX_TEAMS) {
      toast.error(`No máximo ${MAX_TEAMS} equipas.`)
      return
    }
    updateConfig({ teams: [...config.teams, name] })
    setTeamName('')
  }

  const removeTeam = (team: string) => {
    updateConfig({ teams: config.teams.filter((t) => t !== team) })
    undoLap(team)
  }

  // ── Estado para o projetor ─────────────────────────────────
  const snapshot = useCallback(
    (): TimerScreenState => ({ config, runId, running, elapsedMs: elapsedNow(), sentAt: Date.now(), laps }),
    [config, runId, running, elapsedNow, laps],
  )
  const snapshotRef = useRef(snapshot)
  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  // Pré-visualização aqui: o estado "vale" desde o momento em que foi calculado.
  const preview = useMemo(() => {
    const s = snapshot()
    return { state: s, anchor: s.sentAt }
  }, [snapshot])

  const controlKey = `${runId}:${running}:${laps.length}:${baseElapsed}`
  const lastPushedRef = useRef('')
  useEffect(() => {
    if (!hydrated || !projector) return
    const push = () =>
      supabase
        .from('timer_screens')
        .upsert({ host_id: userId, state: snapshotRef.current(), updated_at: new Date().toISOString() })
        .then(({ error }) => {
          if (error) console.warn('timer_screens:', error.message)
        })
    // Iniciar/pausar/marcar vão já; editar as definições espera um pouco.
    if (controlKey !== lastPushedRef.current) {
      lastPushedRef.current = controlKey
      push()
      return
    }
    const t = setTimeout(push, 500)
    return () => clearTimeout(t)
  }, [hydrated, projector, controlKey, config, supabase, userId])

  // Janela do projetor neste computador (BroadcastChannel)
  const bcRef = useRef<BroadcastChannel | null>(null)
  const lastPingRef = useRef(0)
  const [localProjector, setLocalProjector] = useState(false)

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel(timerLocalChannelName(userId))
    bcRef.current = bc
    const send = (m: TimerLocalMessage) => bc.postMessage(m)
    bc.onmessage = (ev: MessageEvent<TimerLocalMessage>) => {
      const m = ev.data
      if (m.type === 'hello' || m.type === 'ping') {
        const wasOff = Date.now() - lastPingRef.current > 5000
        lastPingRef.current = Date.now()
        setLocalProjector(true)
        if (m.type === 'hello' || wasOff) send({ type: 'state', state: snapshotRef.current() })
      } else if (m.type === 'bye' && m.from === 'projector') {
        lastPingRef.current = 0
        setLocalProjector(false)
      }
    }
    const check = setInterval(() => {
      if (lastPingRef.current && Date.now() - lastPingRef.current > 5000) {
        lastPingRef.current = 0
        setLocalProjector(false)
      }
    }, 2000)
    const onHide = () => send({ type: 'bye', from: 'controller' })
    window.addEventListener('pagehide', onHide)
    return () => {
      clearInterval(check)
      window.removeEventListener('pagehide', onHide)
      onHide()
      bc.close()
      bcRef.current = null
    }
  }, [userId])

  useEffect(() => {
    bcRef.current?.postMessage({ type: 'state', state: preview.state } satisfies TimerLocalMessage)
  }, [preview])

  const openProjectorWindow = () => {
    unlockTimerSound()
    const w = window.open(TIMER_PROJECTOR_PATH, TIMER_PROJECTOR_WINDOW_NAME, 'popup=yes,width=1280,height=720')
    if (!w) {
      toast.error('O browser bloqueou a janela. Permite pop-ups para este site e tenta outra vez.')
      return
    }
    w.focus()
  }

  const [origin, setOrigin] = useState('')
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOrigin(window.location.origin), [])

  // ── Atalhos: Espaço inicia/pausa, R reinicia, 1–9 marca a equipa ──
  const keysRef = useRef({ toggle, reset, markTeam, config })
  useEffect(() => {
    keysRef.current = { toggle, reset, markTeam, config }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.closest('input, textarea, select, button, a, [contenteditable="true"]') || t.isContentEditable)) return
      const k = keysRef.current
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        k.toggle()
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        k.reset()
      } else if (k.config.mode === 'laps' && /^[1-9]$/.test(e.key)) {
        const team = k.config.teams[Number(e.key) - 1]
        if (team) {
          e.preventDefault()
          k.markTeam(team)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const locked = started && !finished && !allTeamsDone
  const lapByTeam = new Map(laps.map((l) => [l.team, l]))

  return (
    <>
      <main className="mx-auto max-w-3xl space-y-5 px-4 pb-36 pt-6">
        <div className="flex items-center gap-3">
          <Link href="/admin?tab=tools" className="text-slate-500 hover:text-slate-700" title="Voltar às Ferramentas">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Timer className="h-6 w-6 text-orange-600" /> Cronómetro
          </h1>
        </div>

        {/* Projetor */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MonitorPlay className="h-5 w-5 text-orange-600" /> Projetor
              {localProjector && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Janela ligada
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Abre a janela do projetor, arrasta-a para o ecrã do projetor e clica lá em &quot;ecrã inteiro&quot;. Controlas tudo a partir
              daqui (Espaço inicia/pausa, R reinicia{config.mode === 'laps' ? ', 1–9 marca a equipa' : ''}).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <button
              type="button"
              onClick={openProjectorWindow}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-900 px-4 text-sm font-bold text-white hover:bg-blue-800 sm:w-auto"
            >
              <ExternalLink className="h-4 w-4" /> {localProjector ? 'Mostrar janela do projetor' : 'Abrir janela do projetor'}
            </button>

            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="timer-remote" className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
                    <Smartphone className="h-4 w-4" /> Controlar a partir do telemóvel
                  </span>
                  <span className="block text-xs text-gray-500">
                    Para quando o projetor está noutro computador: este dispositivo controla e o outro mostra.
                  </span>
                </label>
                <Switch id="timer-remote" checked={projector} onCheckedChange={setProjector} />
              </div>
              {projector && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-gray-600">
                    No computador do projetor, entra com <b>a tua conta</b> e abre <b>Gestão → Ferramentas → Cronómetro → Ecrã do
                    projetor</b>, ou este endereço:
                  </p>
                  <div className="flex gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-gray-100 px-3 py-2.5 text-xs text-gray-700">
                      {origin}
                      {TIMER_PROJECTOR_PATH}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard
                          ?.writeText(`${origin}${TIMER_PROJECTOR_PATH}`)
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
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pré-visualização */}
        <div className="h-[22rem] overflow-hidden rounded-3xl shadow-lg ring-1 ring-black/5">
          <TimerStage
            state={preview.state}
            anchor={preview.anchor}
            variant="preview"
            // Com a janela do projetor ligada, o som toca só lá (senão ouvia-se a dobrar)
            sound={sound && !localProjector}
          />
        </div>

        {/* Equipas: marcar quem termina */}
        {config.mode === 'laps' && config.teams.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Flag className="h-5 w-5 text-orange-600" /> Marcar chegada
              </CardTitle>
              <CardDescription>
                {running ? 'Carrega na equipa quando terminar.' : started ? 'Em pausa.' : 'Inicia o cronómetro para marcar tempos.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {config.teams.map((team, i) => {
                  const lap = lapByTeam.get(team)
                  return (
                    <div key={team} className="relative">
                      <button
                        type="button"
                        onClick={() => markTeam(team)}
                        disabled={!running || !!lap}
                        className={`flex min-h-16 w-full flex-col items-start justify-center rounded-2xl px-3 py-2 text-left transition-colors ${
                          lap
                            ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-200'
                            : running
                              ? 'bg-orange-500 text-white shadow-md active:scale-[0.98]'
                              : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${lap ? 'text-emerald-600' : 'opacity-70'}`}>
                          {i < 9 ? `Tecla ${i + 1}` : ' '}
                        </span>
                        <span className={`w-full truncate font-black ${lap ? 'text-gray-900' : ''}`}>{team}</span>
                        {lap && (
                          <span className="text-sm font-bold tabular-nums text-emerald-700">
                            {formatTimer(lap.ms, { countsDown: false, tenths: true })}
                          </span>
                        )}
                      </button>
                      {lap && (
                        <button
                          type="button"
                          onClick={() => undoLap(team)}
                          className="absolute right-1.5 top-1.5 rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-red-600"
                          title="Anular o tempo desta equipa"
                        >
                          <Undo2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Definições */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-5 w-5 text-orange-600" /> Definições
            </CardTitle>
            <CardDescription>{MODES.find((m) => m.id === config.mode)?.hint}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 sm:grid-cols-4">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`rounded-lg px-2 py-2 text-sm font-bold transition-colors ${
                    config.mode === m.id ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {MODE_LABELS[m.id]}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="timer-title" className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Título no ecrã (opcional)
              </label>
              <input
                id="timer-title"
                value={config.title}
                onChange={(e) => updateConfig({ title: e.target.value.slice(0, 60) })}
                placeholder="Ex.: Montar a tenda"
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
              />
            </div>

            {locked && config.mode !== 'stopwatch' && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                O cronómetro já começou: reinicia para mudar o tempo, as rondas ou as equipas.
              </p>
            )}

            {config.mode === 'countdown' && (
              <DurationField
                label="Tempo"
                valueMs={config.durationMs}
                onChange={(durationMs) => updateConfig({ durationMs })}
                disabled={locked}
              />
            )}

            {config.mode === 'rounds' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Número de rondas</p>
                  <Stepper
                    value={config.rounds.count}
                    min={1}
                    max={MAX_ROUNDS}
                    disabled={locked}
                    onChange={(count) => updateConfig({ rounds: { ...config.rounds, count } })}
                  />
                </div>
                <DurationField
                  label="Cada ronda"
                  valueMs={config.rounds.workMs}
                  onChange={(workMs) => updateConfig({ rounds: { ...config.rounds, workMs } })}
                  disabled={locked}
                />
                <DurationField
                  label="Pausa entre rondas"
                  valueMs={config.rounds.restMs}
                  onChange={(restMs) => updateConfig({ rounds: { ...config.rounds, restMs } })}
                  disabled={locked}
                  allowZero
                />
                <p className="text-xs text-gray-500">
                  Total: <b>{formatTimer(total ?? 0, { countsDown: true })}</b>
                </p>
              </div>
            )}

            {config.mode === 'laps' && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Equipas</p>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    addTeam()
                  }}
                >
                  <input
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder={`Equipa ${config.teams.length + 1}`}
                    maxLength={30}
                    disabled={locked}
                    className="h-10 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm disabled:bg-gray-50"
                  />
                  <button
                    type="submit"
                    disabled={!teamName.trim() || locked}
                    className="flex h-10 flex-shrink-0 items-center gap-1.5 rounded-xl bg-blue-900 px-3 text-sm font-bold text-white disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" /> Adicionar
                  </button>
                </form>
                {config.teams.length === 0 ? (
                  <p className="text-xs text-gray-500">Sem equipas, funciona como um cronómetro normal.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {config.teams.map((t, i) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white py-1 pl-3 pr-1.5 text-sm font-bold text-gray-800"
                      >
                        <span className="text-[10px] text-gray-400">{i + 1}</span> {t}
                        <button
                          type="button"
                          onClick={() => removeTeam(t)}
                          disabled={locked}
                          className="rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-30"
                          title="Remover equipa"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Barra de controlo */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            type="button"
            onClick={reset}
            disabled={!started}
            className="flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-2xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
            title="Reiniciar (R)"
          >
            <RotateCcw className="h-5 w-5" />
            <span className="text-[10px] font-bold">Reiniciar</span>
          </button>
          <button
            type="button"
            onClick={toggle}
            className={`flex h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl text-lg font-black text-white shadow-lg transition-transform active:scale-[0.98] ${
              running ? 'bg-gradient-to-r from-slate-700 to-slate-900' : 'bg-gradient-to-r from-orange-500 to-red-600'
            }`}
          >
            {running ? (
              <>
                <Pause className="h-5 w-5" /> Pausar
              </>
            ) : (
              <>
                <Play className="h-5 w-5" /> {started && !finished && !allTeamsDone ? 'Continuar' : 'Iniciar'}
              </>
            )}
          </button>
          {!localProjector && (
            <button
              type="button"
              onClick={() => setSound((s) => !s)}
              className="flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-2xl border border-gray-200 text-gray-600 hover:bg-gray-50"
              title="Som neste dispositivo"
            >
              {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
              <span className="text-[10px] font-bold">Som</span>
            </button>
          )}
        </div>
      </div>
    </>
  )
}

function Stepper({
  value,
  min,
  max,
  onChange,
  disabled,
  format = String,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  disabled?: boolean
  format?: (v: number) => string
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-600 disabled:opacity-30"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-12 text-center text-xl font-black tabular-nums text-gray-900">{format(value)}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-600 disabled:opacity-30"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}

const SEC_STEP = 5
const MAX_MIN = 180

/** Minutos e segundos (os segundos andam de 5 em 5). */
function DurationField({
  label,
  valueMs,
  onChange,
  disabled,
  allowZero,
}: {
  label: string
  valueMs: number
  onChange: (ms: number) => void
  disabled?: boolean
  allowZero?: boolean
}) {
  const totalSec = Math.round(valueMs / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  const set = (m: number, s: number) => {
    const next = Math.max(allowZero ? 0 : SEC_STEP, Math.min(MAX_MIN * 60, m * 60 + s))
    onChange(next * 1000)
  }
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <Stepper value={min} min={0} max={MAX_MIN} disabled={disabled} onChange={(m) => set(m, sec)} />
          <span className="text-sm font-bold text-gray-500">min</span>
        </div>
        <div className="flex items-center gap-2">
          <Stepper
            value={sec / SEC_STEP}
            min={0}
            max={60 / SEC_STEP - 1}
            disabled={disabled}
            format={(v) => String(v * SEC_STEP).padStart(2, '0')}
            onChange={(v) => set(min, v * SEC_STEP)}
          />
          <span className="text-sm font-bold text-gray-500">seg</span>
        </div>
      </div>
    </div>
  )
}
