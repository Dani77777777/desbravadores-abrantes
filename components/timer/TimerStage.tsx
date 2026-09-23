'use client'

import { useEffect, useRef, useState } from 'react'
import { Flag, Medal } from 'lucide-react'
import { elapsedAt, formatTimer, lapRanking, timerView, type TimerScreenState } from '@/utils/timer'
import { playTimerAlarm, playTimerLap, playTimerPhase, playTimerTick } from '@/utils/timer-sound'

/** Tamanho dos números conforme o comprimento do texto (em % da largura do contentor). */
function digitSize(text: string, ringed: boolean) {
  const n = text.length
  const base = n <= 4 ? 30 : n <= 5 ? 26 : n <= 7 ? 20 : 16
  return `${ringed ? base * 0.82 : base}cqw`
}

/** Tempo decorrido "ao vivo", recalculado a cada frame a partir do estado recebido. */
function useLiveElapsed(state: TimerScreenState, anchor: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    // Parado: o tempo não depende de "agora"
    if (!state.running) return
    let raf = 0
    const loop = () => {
      setNow(Date.now())
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [state.running, state.runId, anchor])
  return elapsedAt(state, anchor, now)
}

/**
 * Ecrã do cronómetro: usado no projetor (ecrã inteiro) e na pré-visualização do controlo.
 * Toca os sons só quando `sound` está ligado (na janela do projetor, se estiver aberta).
 */
export function TimerStage({
  state,
  anchor,
  variant,
  sound,
}: {
  state: TimerScreenState
  /** Hora local em que `state.elapsedMs` era verdade. */
  anchor: number
  variant: 'projector' | 'preview'
  sound: boolean
}) {
  const { config } = state
  const elapsed = useLiveElapsed(state, anchor)
  const view = timerView(config, elapsed)
  const projector = variant === 'projector'

  // ── Sons: comparam com o frame anterior do mesmo "run" (nunca tocam ao abrir a meio) ──
  const prevRef = useRef<{ runId: string; sec: number; phaseKey: string; done: boolean; laps: number } | null>(null)
  useEffect(() => {
    const sec = Math.ceil(view.displayMs / 1000)
    const prev = prevRef.current
    prevRef.current = { runId: state.runId, sec, phaseKey: view.phaseKey, done: view.done, laps: state.laps.length }
    if (!sound || !prev || prev.runId !== state.runId || !state.running && !view.done) return
    if (view.done && !prev.done) {
      playTimerAlarm()
      return
    }
    if (view.phaseKey !== prev.phaseKey && view.phaseKind) playTimerPhase(view.phaseKind)
    else if (view.warn && sec !== prev.sec && sec > 0) playTimerTick(sec === 1)
    if (state.laps.length > prev.laps) playTimerLap()
  }, [sound, state.runId, state.running, state.laps.length, view.displayMs, view.phaseKey, view.phaseKind, view.done, view.warn])

  const text = formatTimer(view.displayMs, { countsDown: view.countsDown, tenths: config.mode === 'laps' })
  const ringed = view.progress !== null
  const showRanking = config.mode === 'laps' && config.teams.length > 0
  const ranking = showRanking ? lapRanking(config.teams, state.laps) : []

  const rest = view.phaseKind === 'rest'
  const bg = view.done
    ? 'timer-flash'
    : rest
      ? 'bg-gradient-to-br from-teal-900 via-emerald-950 to-slate-950'
      : 'bg-gradient-to-br from-blue-950 via-indigo-950 to-slate-950'
  const digitColor = view.done ? 'text-white' : view.warn ? 'text-orange-400' : 'text-white'
  const ringColor = view.done ? '#fff' : view.warn ? '#fb923c' : rest ? '#5eead4' : '#fcd34d'

  const R = 46
  const C = 2 * Math.PI * R

  const clock = (
    <div
      className="@container relative aspect-square"
      style={{
        width: projector
          ? showRanking
            ? 'min(62vh, 48vw)'
            : 'min(74vh, 86vw)'
          : showRanking
            ? 'min(15rem, 70vw)'
            : 'min(17rem, 78vw)',
      }}
    >
      {ringed && (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="4" />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - (view.progress ?? 0))}
          />
        </svg>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {view.phaseLabel && (
          <p
            className={`font-black uppercase tracking-widest ${rest ? 'text-teal-200' : 'text-amber-200'}`}
            style={{ fontSize: '6.5cqw' }}
          >
            {view.phaseLabel}
          </p>
        )}
        <p
          className={`font-black leading-none tabular-nums tracking-tight ${digitColor} ${view.warn && !view.done ? 'scale-105' : ''} transition-transform`}
          style={{ fontSize: digitSize(text, ringed) }}
        >
          {text}
        </p>
        {view.done && (
          <p className="mt-[3cqw] font-black uppercase tracking-widest text-white" style={{ fontSize: '7cqw' }}>
            Tempo!
          </p>
        )}
        {!state.running && !view.done && elapsed > 0 && (
          <p className="mt-[3cqw] font-bold uppercase tracking-widest text-white/50" style={{ fontSize: '5cqw' }}>
            Em pausa
          </p>
        )}
      </div>
    </div>
  )

  return (
    <div className={`relative flex h-full w-full flex-col overflow-hidden text-white ${bg}`}>
      {config.title && (
        <p
          className={`truncate px-6 text-center font-black text-white/90 ${projector ? 'pt-[4vh] text-[6vh] leading-tight' : 'pt-4 text-lg'}`}
        >
          {config.title}
        </p>
      )}
      <div
        className={`flex flex-1 items-center justify-center ${projector ? 'gap-[5vw] px-[4vw] py-[3vh]' : 'gap-4 p-4'} ${
          showRanking ? (projector ? 'flex-row' : 'flex-col') : ''
        }`}
      >
        {clock}
        {showRanking && (
          <ol className={`flex min-w-0 flex-col ${projector ? 'w-[38vw] gap-[1.2vh]' : 'w-full max-w-sm gap-1.5'}`}>
            {ranking.map((r) => (
              <li
                key={r.team}
                className={`flex items-center gap-3 rounded-2xl ${projector ? 'px-[1.6vw] py-[1.2vh] text-[3.6vh]' : 'px-3 py-1.5 text-sm'} ${
                  r.place === 1
                    ? 'bg-amber-400 text-slate-900'
                    : r.place
                      ? 'bg-white/15 text-white'
                      : 'bg-white/5 text-white/60 ring-1 ring-inset ring-white/10'
                }`}
              >
                <span className={`flex flex-shrink-0 items-center justify-center font-black ${projector ? 'w-[4vh]' : 'w-6'}`}>
                  {r.place === 1 ? (
                    <Medal className={projector ? 'h-[4vh] w-[4vh]' : 'h-4 w-4'} />
                  ) : r.place ? (
                    `${r.place}.º`
                  ) : (
                    <Flag className={`opacity-50 ${projector ? 'h-[3vh] w-[3vh]' : 'h-3.5 w-3.5'}`} />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate font-bold">{r.team}</span>
                <span className="flex-shrink-0 font-black tabular-nums">
                  {r.ms !== null ? formatTimer(r.ms, { countsDown: false, tenths: true }) : '…'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
