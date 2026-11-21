'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Anchor, Heart, Loader2, Play, RotateCcw, Sparkles, Trophy, Waves, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import BibleReference from '@/components/vana-trilha/BibleReference'
import { useWakeLock } from '@/components/vana-camp/useWakeLock'
import { finishRun, getWeeklyBoards, startRun } from '@/lib/actions/vana-arca'
import { ARCA_LIVES, referenceFor } from '@/utils/vana-arca'
import type { VanaArcaBoards, VanaArcaFinishResponse, VanaArcaSettings, VanaArcaStatus } from '@/types/vana-arca'
import ArcaCanvas, { type ArcaHud } from './ArcaCanvas'
import ArcaBoards from './ArcaBoards'

type Screen = 'home' | 'starting' | 'playing' | 'finishing' | 'ended'

type Tiers = Pick<VanaArcaSettings, 'reward_low' | 'reward_mid' | 'reward_high' | 'mid_from' | 'high_from'>

interface Props {
  initialStatus: VanaArcaStatus
  initialBoards: VanaArcaBoards | null
  tiers: Tiers
  playerName: string | null
}

const LEAVE_WARNING = 'Sair agora conta como uma das tuas partidas de hoje.'

function formatMultiplier(m: number) {
  return `×${String(m).replace('.', ',')}`
}

/** "Partidas com prémio hoje: X de 3" (X = as que já usaste). */
function PaidRunsLine({ status, className = '' }: { status: VanaArcaStatus; className?: string }) {
  const used = Math.min(status.runs_today, status.paid_runs_per_day)
  return (
    <p className={`text-sm font-bold ${className}`}>
      Partidas com prémio hoje: {used} de {status.paid_runs_per_day}
      <span className="block text-xs font-medium opacity-75">
        {status.paid_runs_left > 0
          ? `Ainda tens ${status.paid_runs_left} com prémio. Depois podes continuar a jogar para o recorde e os rankings.`
          : 'Já usaste as partidas com prémio de hoje: as próximas contam para o recorde e os rankings.'}
      </span>
    </p>
  )
}

/** Wake lock só enquanto este componente está montado (durante a partida). */
function KeepAwake() {
  useWakeLock()
  return null
}

export default function VanaArcaGame({ initialStatus, initialBoards, tiers, playerName }: Props) {
  const [screen, setScreen] = useState<Screen>('home')
  const [status, setStatus] = useState(initialStatus)
  const [boards, setBoards] = useState(initialBoards)
  const [run, setRun] = useState<{ runId: string; seed: number } | null>(null)
  const [hud, setHud] = useState<ArcaHud>({ pares: 0, filas: 0, score: 0, lives: ARCA_LIVES, started: false })
  const [result, setResult] = useState<VanaArcaFinishResponse | null>(null)
  const [pending, setPending] = useState<{ taps: number[]; ticks: number } | null>(null)
  const [finishError, setFinishError] = useState<string | null>(null)
  const [confirmExit, setConfirmExit] = useState(false)
  const screenRef = useRef(screen)
  useEffect(() => {
    screenRef.current = screen
  }, [screen])

  const inGame = screen === 'playing' || screen === 'finishing'

  // Aviso antes de sair (recarregar / fechar o separador) durante a partida.
  useEffect(() => {
    if (!inGame) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = LEAVE_WARNING
      return LEAVE_WARNING
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [inGame])

  // A página por trás não faz scroll enquanto se joga (os toques são para largar pares).
  useEffect(() => {
    if (!inGame) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [inGame])

  // Botão "voltar" do telemóvel: em vez de sair, pergunta.
  useEffect(() => {
    const onPop = () => {
      if (screenRef.current !== 'playing') return
      window.history.pushState({ vanaArca: true }, '')
      setConfirmExit(true)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const leaveHistoryEntry = () => {
    if (window.history.state?.vanaArca) window.history.back()
  }

  const refreshBoards = useCallback(async () => {
    const res = await getWeeklyBoards()
    if (res.boards) setBoards(res.boards)
  }, [])

  const play = async () => {
    setScreen('starting')
    setResult(null)
    setFinishError(null)
    setPending(null)
    const res = await startRun()
    if (res.error || !res.runId || res.seed === undefined) {
      toast.error(res.error ?? 'Não foi possível começar a partida.')
      setScreen('home')
      return
    }
    if (res.status) setStatus(res.status)
    setHud({ pares: 0, filas: 0, score: 0, lives: ARCA_LIVES, started: false })
    setRun({ runId: res.runId, seed: res.seed })
    window.history.pushState({ vanaArca: true }, '')
    setScreen('playing')
  }

  const submit = useCallback(
    async (runId: string, taps: number[], ticks: number) => {
      setScreen('finishing')
      setFinishError(null)
      setPending({ taps, ticks })
      const res = await finishRun(runId, taps, ticks)
      if (res.status) setStatus(res.status)
      if (!res.ok && !res.invalid) {
        setFinishError(res.error ?? 'Não foi possível gravar a partida.')
        return
      }
      setResult(res)
      setPending(null)
      leaveHistoryEntry()
      setScreen('ended')
      refreshBoards()
    },
    [refreshBoards],
  )

  const onEnd = useCallback(
    (taps: number[], ticks: number) => {
      if (run) submit(run.runId, taps, ticks)
    },
    [run, submit],
  )

  const exitGame = () => {
    setConfirmExit(false)
    setRun(null)
    leaveHistoryEntry()
    setScreen('home')
  }

  // ─── Partida ───────────────────────────────────────────────────────────────
  if ((screen === 'playing' || screen === 'finishing') && run) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-white">
        <KeepAwake />
        <div className="flex items-center gap-3 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={() => setConfirmExit(true)}
            disabled={screen === 'finishing'}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40"
            aria-label="Sair da partida"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex flex-1 items-center justify-around text-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-200">Pares</p>
              <p className="text-xl font-black tabular-nums">{hud.pares}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-200">Vidas</p>
              <p className="flex gap-0.5 pt-1" aria-label={`${hud.lives} de ${ARCA_LIVES} vidas`}>
                {Array.from({ length: ARCA_LIVES }, (_, i) => (
                  <Heart key={i} className={`h-5 w-5 ${i < hud.lives ? 'fill-rose-500 text-rose-500' : 'text-white/25'}`} />
                ))}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-200">Pontos</p>
              <p className="text-xl font-black tabular-nums">{hud.score}</p>
            </div>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <ArcaCanvas key={run.runId} seed={run.seed} onEnd={onEnd} onHud={setHud} paused={confirmExit} />
          {screen === 'finishing' && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 p-6">
              {finishError ? (
                <div className="max-w-xs space-y-3 rounded-2xl bg-white p-5 text-center text-slate-800">
                  <p className="font-bold">{finishError}</p>
                  <Button
                    onClick={() => pending && submit(run.runId, pending.taps, pending.ticks)}
                    className="w-full bg-sky-700 hover:bg-sky-800"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" /> Tentar outra vez
                  </Button>
                </div>
              ) : (
                <p className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold">
                  <Loader2 className="h-4 w-4 animate-spin" /> A conferir a partida…
                </p>
              )}
            </div>
          )}
        </div>

        {confirmExit && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/70 p-6"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="vanaarca-exit-title"
          >
            <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 text-slate-800 shadow-xl">
              <h2 id="vanaarca-exit-title" className="text-lg font-black">
                Sair da partida?
              </h2>
              <p className="text-sm">{LEAVE_WARNING} Não recebes pontos por esta partida.</p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={exitGame}>
                  Sair
                </Button>
                <Button autoFocus onClick={() => setConfirmExit(false)} className="bg-sky-700 hover:bg-sky-800">
                  Continuar a jogar
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── Início / fim ──────────────────────────────────────────────────────────
  const ended = screen === 'ended' && result
  const reference = run ? referenceFor(run.seed) : 'Génesis 6:19'

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {ended ? (
        <section className="overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 via-sky-900 to-sky-700 p-6 text-center text-white shadow-lg">
          {result.invalid || !result.result ? (
            <>
              <AlertTriangle className="mx-auto h-10 w-10 text-amber-300" />
              <h2 className="mt-2 text-2xl font-black">Não foi possível validar a partida</h2>
              <p className="mt-1 text-sm text-sky-100">Esta partida não dá pontos nem conta para os rankings.</p>
            </>
          ) : (
            <>
              {result.result.end_reason === 'capsized' ? (
                <Waves className="mx-auto h-10 w-10 text-sky-200" />
              ) : (
                <Anchor className="mx-auto h-10 w-10 text-amber-200" />
              )}
              <h2 className="mt-2 text-2xl font-black">
                {result.result.end_reason === 'capsized' ? 'A arca virou!' : 'O Senhor fechou a porta'}
              </h2>
              {result.result.end_reason === 'full' && (
                <p className="text-xs text-sky-100">
                  <BibleReference reference="Génesis 7:16" />
                </p>
              )}
              <div className="mt-5 grid grid-cols-3 gap-2">
                {[
                  ['Pares', result.result.pares],
                  ['Filas', result.result.filas],
                  ['Pontos', result.result.score],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-white/10 px-2 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-sky-200">{label}</p>
                    <p className="text-3xl font-black tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3">
                {result.no_reward_slot ? (
                  <p className="text-sm font-semibold text-sky-100">
                    Sem prémio: já usaste as {status.paid_runs_per_day} partidas de hoje.
                  </p>
                ) : !result.reward_xp ? (
                  <p className="text-sm font-semibold text-sky-100">Sem prémio nesta partida.</p>
                ) : (
                  <p className="flex items-center justify-center gap-2 text-lg font-black text-amber-200">
                    <Sparkles className="h-5 w-5" /> +{result.reward_xp} XP · +{result.reward_gold} Gold
                    {(result.multiplier ?? 1) > 1 && (
                      <span className="rounded-full bg-amber-300 px-2 py-0.5 text-xs text-amber-950">
                        {formatMultiplier(result.multiplier!)}
                      </span>
                    )}
                  </p>
                )}
              </div>
              {result.family_note && <p className="mt-3 text-sm font-bold text-white">{result.family_note}</p>}
            </>
          )}
          <p className="mt-4 text-xs text-sky-100">
            Lê a história em <BibleReference reference={reference} />
          </p>
          <PaidRunsLine status={status} className="mt-4 text-sky-50" />
          <Button onClick={play} size="lg" className="mt-5 w-full bg-amber-400 text-lg font-black text-amber-950 hover:bg-amber-300">
            <RotateCcw className="mr-2 h-5 w-5" /> Jogar outra vez
          </Button>
          <p className="mt-2 text-xs text-sky-100">{LEAVE_WARNING.replace('Sair agora', 'Sair a meio')}</p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 via-sky-900 to-sky-700 p-6 text-white shadow-lg">
          <div className="flex items-center gap-4">
            <img src="/images/VanaArca.jpeg" alt="" className="h-20 w-20 rounded-2xl object-cover ring-2 ring-white/20" />
            <div>
              <h1 className="text-3xl font-black tracking-tight">VanaArca</h1>
              <p className="text-sm text-sky-100">
                {playerName ? `${playerName}, carrega` : 'Carrega'} a arca dois a dois sem a deixar virar!
              </p>
              <p className="mt-1 text-xs text-sky-200">
                <BibleReference reference="Génesis 6:19" />
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-2xl bg-white/10 px-2 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-200">O teu recorde</p>
              <p className="text-3xl font-black tabular-nums">{status.personal_best ?? '—'}</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-2 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-200">Recorde da semana</p>
              <p className="text-3xl font-black tabular-nums">{status.week_best ?? '—'}</p>
            </div>
          </div>

          <PaidRunsLine status={status} className="mt-4 text-sky-50" />
          {status.multiplier > 1 && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-3 py-1 text-xs font-black text-amber-950">
              <Sparkles className="h-3.5 w-3.5" /> Campanha: prémios por partida {formatMultiplier(status.multiplier)}
            </p>
          )}

          <Button
            onClick={play}
            disabled={screen === 'starting'}
            size="lg"
            className="mt-5 w-full bg-amber-400 text-lg font-black text-amber-950 hover:bg-amber-300"
          >
            {screen === 'starting' ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
            Jogar
          </Button>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-sky-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Cada partida que começas conta como uma das partidas de hoje. Sair a meio também conta.
          </p>
        </section>
      )}

      {screen !== 'ended' && (
        <section className="rounded-3xl border border-sky-100 bg-white p-5 text-sm text-slate-700 shadow-sm">
          <h2 className="mb-2 flex items-center gap-2 font-black text-slate-900">
            <Trophy className="h-4 w-4 text-amber-500" /> Como se joga
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Os pares de animais passam por cima da arca. Toca no ecrã (ou carrega no espaço) para os largar.</li>
            <li>Cada par cai na coluna mais próxima e fica em cima do que lá estiver. Se já não couber, cai à água e perdes uma das 3 vidas.</li>
            <li>Os animais mais escuros pesam mais. Se a arca inclinar mais de 14°, vira!</li>
            <li>1 ponto por par a bordo e +3 por cada fila completa.</li>
            <li>
              Prémio por partida (só as {status.paid_runs_per_day} primeiras do dia): {tiers.reward_low} XP + Gold até{' '}
              {tiers.mid_from - 1} pares, {tiers.reward_mid} de {tiers.mid_from} a {tiers.high_from - 1} e{' '}
              {tiers.reward_high} com {tiers.high_from} ou mais.
            </li>
          </ul>
        </section>
      )}

      {boards && <ArcaBoards boards={boards} />}
    </div>
  )
}
