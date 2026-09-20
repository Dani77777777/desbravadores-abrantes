'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Award, Clock, Crown, Heart, Sparkles, Target, Trophy, XCircle } from 'lucide-react'
import LivesIndicator from './LivesIndicator'
import ShareResultDialog from './ShareResultDialog'
import StationProgress from './StationProgress'
import { formatDuration, msUntilLisbonMidnight } from '@/utils/vana-trilha'
import {
  VANATRILHA_BADGE_NAME,
  type VanaTrilhaDailyRun,
  type VanaTrilhaHistoryEntry,
  type VanaTrilhaRewards,
  type VanaTrilhaStation,
} from '@/types/vana-trilha'
import './VanaTrilha.css'

interface Props {
  run: VanaTrilhaDailyRun
  station: VanaTrilhaStation
  rewards: VanaTrilhaRewards | null
  progress: { stations: number[]; badge_unlocked: boolean }
  /** A insígnia foi desbloqueada nesta etapa. */
  justUnlockedBadge?: boolean
  /** Esta estação foi completada pela primeira vez nesta etapa. */
  newStation?: boolean
  /** Primeiro nome do jogador, para a imagem de partilha. */
  playerName: string | null
}

function historySymbol(h: VanaTrilhaHistoryEntry): string {
  if (h.kind === 'bonus') return h.correct ? '📜' : '⬜'
  if (h.correct) return '🟩'
  return h.protected ? '🟨' : '🟥'
}

function NextStageCountdown() {
  const router = useRouter()
  const [ms, setMs] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => {
      const left = msUntilLisbonMidnight()
      setMs(left)
      if (left <= 1000) router.refresh()
    }
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [router])

  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl bg-[#1E3A5F] px-4 py-3 text-white">
      <Clock className="h-5 w-5 opacity-80" />
      <span className="text-sm font-semibold">Próxima etapa em</span>
      <span className="font-mono text-lg font-black tabular-nums">{ms === null ? '--:--:--' : formatClock(ms)}</span>
    </div>
  )
}

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

export default function RunSummary({ run, station, rewards, progress, justUnlockedBadge, newStation, playerName }: Props) {
  const completed = run.status === 'completed'
  const perfect = completed && run.mistakes === 0
  const durationMs =
    run.finished_at ? new Date(run.finished_at).getTime() - new Date(run.started_at).getTime() : null
  const symbols = run.history.map(historySymbol).join('')

  return (
    <div className="space-y-4">
      <div
        className={`vt-pop overflow-hidden rounded-3xl text-center shadow-lg ${
          completed ? 'bg-gradient-to-br from-amber-400 via-orange-500 to-yellow-500 text-white' : 'border border-slate-200 bg-white'
        }`}
      >
        <div className="px-5 pb-5 pt-6">
          <div
            className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl ${
              completed ? 'bg-white/25' : 'bg-slate-100'
            }`}
          >
            {perfect ? (
              <Crown className="h-9 w-9" />
            ) : completed ? (
              <Trophy className="h-9 w-9" />
            ) : (
              <XCircle className="h-9 w-9 text-slate-400" />
            )}
          </div>

          <h2 className={`text-2xl font-black sm:text-3xl ${completed ? '' : 'text-slate-900'}`}>
            {perfect ? 'Jornada Perfeita!' : completed ? 'Etapa completa!' : 'Ficaste sem vidas'}
          </h2>
          <p className={`mt-1 text-sm font-medium ${completed ? 'text-white/90' : 'text-slate-600'}`}>
            {completed
              ? `Chegaste ao fim da etapa ${station.name}${perfect ? ' sem nenhum erro' : ''}.`
              : 'A etapa de hoje ficou por completar. Amanhã há uma etapa nova — e agora já sabes mais respostas!'}
          </p>

          {symbols && (
            <p className="mt-3 break-all text-xl leading-relaxed tracking-wider" aria-label="Resumo das respostas">
              {symbols}
            </p>
          )}
        </div>

        {completed && rewards && (
          <div className="grid grid-cols-2 gap-px bg-white/20">
            <div className="bg-black/10 px-3 py-3">
              <p className="text-3xl font-black">+{rewards.xp}</p>
              <p className="text-xs font-bold uppercase tracking-wider opacity-90">XP</p>
            </div>
            <div className="bg-black/10 px-3 py-3">
              <p className="text-3xl font-black">+{rewards.gold}</p>
              <p className="text-xs font-bold uppercase tracking-wider opacity-90">
                Gold{rewards.bonus_gold > 0 ? ` (${rewards.bonus_gold} do Milagre)` : ''}
              </p>
            </div>
          </div>
        )}
      </div>

      {completed && !run.rewards_awarded && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800">
          A registar os teus prémios… Se não aparecerem no perfil, recarrega a página.
        </p>
      )}

      {(justUnlockedBadge || newStation) && (
        <div className="vt-pop flex items-center gap-3 rounded-3xl border-2 border-yellow-300 bg-yellow-50 p-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-300 to-amber-500 text-amber-950">
            {justUnlockedBadge ? <Award className="h-7 w-7" /> : <Sparkles className="h-6 w-6" />}
          </div>
          <div>
            <p className="font-black text-slate-900">
              {justUnlockedBadge ? `Insígnia desbloqueada: ${VANATRILHA_BADGE_NAME}!` : 'Nova estação na tua viagem!'}
            </p>
            <p className="text-sm text-slate-600">
              {justUnlockedBadge
                ? 'Completaste as 7 estações, do Egito à Terra Prometida.'
                : `${station.name} ficou marcada no teu mapa.`}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-sm">
          <Target className="mx-auto h-5 w-5 text-emerald-600" />
          <p className="mt-1 text-lg font-black text-slate-900">{run.correct_count}</p>
          <p className="text-[11px] font-semibold text-slate-500">certas</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-sm">
          <Heart className="mx-auto h-5 w-5 text-rose-500" />
          <div className="mt-1 flex justify-center">
            <LivesIndicator lives={run.lives} size="sm" />
          </div>
          <p className="text-[11px] font-semibold text-slate-500">vidas</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-sm">
          <Clock className="mx-auto h-5 w-5 text-sky-600" />
          <p className="mt-1 text-lg font-black tabular-nums text-slate-900">
            {durationMs !== null ? formatDuration(durationMs) : '—'}
          </p>
          <p className="text-[11px] font-semibold text-slate-500">tempo</p>
        </div>
      </div>

      <ShareResultDialog run={run} station={station} rewards={rewards} playerName={playerName} />

      <NextStageCountdown />

      <StationProgress completed={progress.stations} badgeUnlocked={progress.badge_unlocked} todayStation={station.id} />
    </div>
  )
}
