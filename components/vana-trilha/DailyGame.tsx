'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { toast } from 'sonner'
import { Clock, Footprints, Heart, Loader2, Play, Sparkles } from 'lucide-react'
import { answerDailyQuestion, startDailyRun, type VanaTrilhaDailyState } from '@/lib/actions/vana-trilha'
import { dailySpecialOf, formatDuration } from '@/utils/vana-trilha'
import { TILE_EMOJI, TILE_LABEL } from '@/utils/vana-trilha-labels'
import {
  VANATRILHA_DAILY_LENGTH,
  VANATRILHA_DAILY_LIVES,
  VANATRILHA_STATIONS,
  getStation,
  type VanaTrilhaAnswerResult,
  type VanaTrilhaDailyRun,
  type VanaTrilhaRewards,
  type VanaTrilhaStep,
  type VanaTrilhaTile,
} from '@/types/vana-trilha'
import AnswerFeedback from './AnswerFeedback'
import LivesIndicator from './LivesIndicator'
import QuestionCard from './QuestionCard'
import RunSummary from './RunSummary'
import SpecialTileModal from './SpecialTileModal'
import StationHeader from './StationHeader'
import StationProgress from './StationProgress'
import TrailBoard from './TrailBoard'
import VanaTrilhaHowToPlay from './VanaTrilhaHowToPlay'

interface Props {
  initialState: VanaTrilhaDailyState
  initialProgress: { stations: number[]; badge_unlocked: boolean }
  playerName: string | null
}

/** Cronómetro suave: só informativo, sem penalização. */
function useElapsed(startedAt: string | null, finishedAt: string | null) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    if (!startedAt || finishedAt) return
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [startedAt, finishedAt])
  if (!startedAt) return null
  const end = finishedAt ? new Date(finishedAt).getTime() : now
  if (end === null) return null
  return end - new Date(startedAt).getTime()
}

function celebrate(perfect: boolean) {
  const colors = ['#F59E0B', '#EA580C', '#EAB308', '#FDE68A', '#1E3A5F']
  confetti({ particleCount: perfect ? 160 : 110, spread: 75, origin: { y: 0.65 }, colors, disableForReducedMotion: true })
  setTimeout(() => {
    confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors, disableForReducedMotion: true })
    confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors, disableForReducedMotion: true })
  }, 250)
}

export default function DailyGame({ initialState, initialProgress, playerName }: Props) {
  const [run, setRun] = useState<VanaTrilhaDailyRun | null>(initialState.run)
  const [step, setStep] = useState<VanaTrilhaStep | null>(initialState.current_step)
  const [rewards, setRewards] = useState<VanaTrilhaRewards | null>(initialState.rewards)
  const [progress, setProgress] = useState(initialProgress)
  const [result, setResult] = useState<VanaTrilhaAnswerResult | null>(null)
  const [chosen, setChosen] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [starting, setStarting] = useState(false)
  const [pendingTile, setPendingTile] = useState<VanaTrilhaTile | null>(null)
  const [moveKey, setMoveKey] = useState(0)
  const [shakeKey, setShakeKey] = useState(0)
  const [milestone, setMilestone] = useState<{ newStation: boolean; badge: boolean }>({ newStation: false, badge: false })
  const topRef = useRef<HTMLDivElement>(null)

  const station = run ? getStation(run.station) : initialState.station
  const elapsed = useElapsed(run?.started_at ?? null, run?.finished_at ?? null)

  useEffect(() => {
    if (initialState.error) toast.error(initialState.error)
  }, [initialState.error])

  const handleStart = useCallback(async () => {
    setStarting(true)
    const res = await startDailyRun()
    setStarting(false)
    if (res.error || !res.run) {
      toast.error(res.error ?? 'Não foi possível começar a etapa.')
      return
    }
    setRun(res.run)
    setStep(res.current_step ?? null)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleAnswer = useCallback(
    async (index: number) => {
      if (!run || !step || submitting || result) return
      setChosen(index)
      setSubmitting(true)
      const res = await answerDailyQuestion(run.id, run.turn, index)
      setSubmitting(false)

      if ('error' in res) {
        toast.error(res.error)
        setChosen(null)
        // Ressincroniza com o servidor (ex.: outro dispositivo avançou a corrida).
        if (res.run) {
          setRun(res.run)
          setStep(res.next_step ?? null)
        }
        return
      }

      setResult(res)
      if (res.run.position !== run.position) setMoveKey((k) => k + 1)
      if (!res.correct && res.kind === 'question') setShakeKey((k) => k + 1)
      setRun(res.run)
      if (res.rewards) setRewards(res.rewards)

      if (res.run.status === 'completed') {
        celebrate(res.run.mistakes === 0)
        const isNew = !progress.stations.includes(res.run.station)
        const stations = isNew ? [...progress.stations, res.run.station].sort((a, b) => a - b) : progress.stations
        const badge = stations.length >= VANATRILHA_STATIONS.length
        setMilestone({ newStation: isNew, badge: badge && !progress.badge_unlocked })
        setProgress({ stations, badge_unlocked: badge })
      }
    },
    [run, step, submitting, result, progress],
  )

  const advance = useCallback((from: VanaTrilhaAnswerResult) => {
    setStep(from.next_step)
    setResult(null)
    setChosen(null)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleContinue = useCallback(() => {
    if (!result) return
    if (result.tile_triggered && result.tile !== 'normal') {
      setPendingTile(result.tile)
      return
    }
    advance(result)
  }, [result, advance])

  const handleTileClosed = useCallback(() => {
    setPendingTile(null)
    if (result) advance(result)
  }, [result, advance])

  // ── Ecrã inicial: ainda não jogou hoje ─────────────────────────────
  if (!run) {
    const special = dailySpecialOf(station.id)
    return (
      <div ref={topRef} className="mx-auto max-w-2xl space-y-5 scroll-mt-20">
        <div className="space-y-3 text-center">
          <img
            src="/images/VanaTrilha.png"
            alt="VanaTrilha"
            className="mx-auto h-24 w-24 object-contain drop-shadow-lg sm:h-28 sm:w-28"
          />
          <div>
            <h1 className="text-4xl font-black tracking-tight text-[#1E3A5F] sm:text-5xl">VanaTrilha</h1>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-700">A Rota da Promessa</p>
          </div>
          <p className="mx-auto max-w-md text-slate-600">
            Responde a perguntas da Bíblia e leva o teu peão do Egito até à Terra Prometida. Uma etapa nova todos os dias!
          </p>
          <div className="flex justify-center">
            <VanaTrilhaHowToPlay variant="button" />
          </div>
        </div>

        <StationHeader station={station} />

        <TrailBoard station={station.id} position={0} status="idle" />

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl border border-amber-100 bg-white p-3 shadow-sm">
            <Footprints className="mx-auto h-5 w-5 text-amber-600" />
            <p className="mt-1 text-sm font-black text-slate-900">{VANATRILHA_DAILY_LENGTH} casas</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-white p-3 shadow-sm">
            <Heart className="mx-auto h-5 w-5 fill-rose-500 text-rose-500" />
            <p className="mt-1 text-sm font-black text-slate-900">{VANATRILHA_DAILY_LIVES} vidas</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-white p-3 shadow-sm">
            <Sparkles className="mx-auto h-5 w-5 text-yellow-500" />
            <p className="mt-1 text-sm font-black text-slate-900">Até 3 XP</p>
          </div>
        </div>

        {special && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">
            Hoje há uma casa especial: <strong>{TILE_EMOJI[special.tile]} {TILE_LABEL[special.tile]}</strong> na casa{' '}
            {special.pos}.
          </p>
        )}

        <button
          type="button"
          onClick={handleStart}
          disabled={starting}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-600 to-yellow-500 px-6 py-4 text-lg font-black text-white shadow-xl shadow-orange-500/25 transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-70"
        >
          {starting ? <Loader2 className="h-6 w-6 animate-spin" /> : <Play className="h-6 w-6 fill-white" />}
          Começar Etapa
        </button>

        <StationProgress completed={progress.stations} badgeUnlocked={progress.badge_unlocked} todayStation={station.id} />
      </div>
    )
  }

  // ── Resultado final ───────────────────────────────────────────────
  if (run.status !== 'playing' && !result) {
    return (
      <div ref={topRef} className="mx-auto max-w-2xl space-y-4 scroll-mt-20">
        <StationHeader station={station} showVerse={false} />
        <TrailBoard station={station.id} position={run.position} status={run.status} />
        <RunSummary
          run={run}
          station={station}
          rewards={rewards}
          progress={progress}
          newStation={milestone.newStation}
          justUnlockedBadge={milestone.badge}
          playerName={playerName}
        />
        <div className="flex justify-center">
          <VanaTrilhaHowToPlay variant="button" />
        </div>
      </div>
    )
  }

  // ── A jogar ─────────────────────────────────────────────────────────
  const displayedPosition = run.position
  const revealedCorrect = result ? result.correct_index : null
  const stepLabel = `Casa ${Math.min(run.current_index + 1, VANATRILHA_DAILY_LENGTH)} de ${VANATRILHA_DAILY_LENGTH}`

  return (
    <div ref={topRef} className="mx-auto max-w-2xl space-y-3 scroll-mt-20">
      <div className="flex items-center justify-between gap-2 rounded-3xl border border-amber-100 bg-white px-3 py-2 shadow-sm">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-900">
            Etapa {station.id} · {station.name}
          </p>
          <p className="flex items-center gap-1 text-xs font-semibold tabular-nums text-slate-500">
            <Clock className="h-3.5 w-3.5" /> {elapsed === null ? '0:00' : formatDuration(elapsed)}
            <span className="mx-1">·</span>
            {displayedPosition}/{VANATRILHA_DAILY_LENGTH} casas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LivesIndicator lives={run.lives} shielded={run.immune_next_error && run.status === 'playing'} size="sm" />
          <VanaTrilhaHowToPlay variant="icon" />
        </div>
      </div>

      <TrailBoard station={station.id} position={displayedPosition} status={run.status} moveKey={moveKey || undefined} />

      {step ? (
        <QuestionCard
          key={step.kind === 'bonus' ? `bonus-${step.bonus.id}` : `q-${step.question.id}-${run.turn - (result ? 1 : 0)}`}
          step={step}
          label={stepLabel}
          onAnswer={handleAnswer}
          chosen={chosen}
          submitting={submitting}
          revealedCorrect={revealedCorrect}
          shakeKey={result && !result.correct && result.kind === 'question' ? shakeKey : undefined}
        />
      ) : (
        !result && (
          <div className="rounded-3xl border border-amber-100 bg-white p-6 text-center text-slate-600">
            <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-amber-600" />
            A carregar a pergunta… Se demorar, recarrega a página.
          </div>
        )
      )}

      {result && <AnswerFeedback key={run.turn} result={result} onContinue={handleContinue} />}

      <SpecialTileModal tile={pendingTile} onClose={handleTileClosed} />
    </div>
  )
}
