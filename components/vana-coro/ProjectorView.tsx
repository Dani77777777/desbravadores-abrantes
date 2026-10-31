'use client'

import { useSyncExternalStore } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Crown, Maximize, Volume2, Zap } from 'lucide-react'
import { enterFullscreen, isWindowFullscreen } from '@/utils/fullscreen'
import { CORO_BG, CoroBoard, StrikeMarks, StrikeOverlay, TEAM_STYLE } from './BoardUI'
import { faceoffMessage, teamName, useCoroBoard, useCoroPlayers, useCoroSession } from './useCoroLive'
import { useCoroAudio } from './useCoroAudio'
import { TeamPodium } from './TeamPodium'
import type { VanaCoroPlayer, VanaCoroSession, VanaCoroTeam } from '@/types/vana-coro'

interface Props {
  session: VanaCoroSession
  initialPlayers: VanaCoroPlayer[]
}

/** Ecrã do projetor: lobby com QR, quadro da ronda, ❌ gigantes e pódio das equipas. */
export function ProjectorView({ session: initial, initialPlayers }: Props) {
  const session = useCoroSession(initial)
  const players = useCoroPlayers(session.id, initialPlayers)
  const round = useCoroBoard(session)
  const { unlocked, unlock } = useCoroAudio(session, round)
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => '',
  )
  const fullscreen = useSyncExternalStore(subscribeFullscreen, isWindowFullscreen, () => true)

  return (
    <div className={`relative min-h-screen overflow-hidden text-white ${CORO_BG}`}>
      {/* Como no VanaQuest: o ecrã todo pede o primeiro clique (áudio + ecrã inteiro) */}
      {!unlocked && (
        <button
          type="button"
          onClick={unlock}
          className="fixed inset-0 z-[100] flex cursor-pointer items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-300"
        >
          <span className="mx-4 max-w-md rounded-3xl border-2 border-amber-400/40 bg-purple-950/80 px-10 py-8 text-center shadow-2xl">
            <Volume2 className="mx-auto mb-4 h-14 w-14 text-amber-300 drop-shadow-[0_0_20px_rgba(252,211,77,0.5)]" />
            <span className="block text-2xl font-black text-amber-100">Clica para ativar o áudio e o ecrã inteiro</span>
            <span className="mt-2 block text-sm text-amber-300/70">Os browsers exigem uma interação antes de tocar música</span>
          </span>
        </button>
      )}

      {/* O ecrã inteiro caiu (Esc mantido, mudar de separador…): um clique em qualquer lado repõe-no */}
      {unlocked && !fullscreen && (
        <button
          type="button"
          onClick={() => enterFullscreen({ lockEscape: true })}
          className="fixed inset-0 z-[90] flex cursor-pointer items-end justify-center pb-10"
        >
          <span className="flex items-center gap-2 rounded-full bg-black/70 px-6 py-3 text-lg font-bold text-amber-200 shadow-2xl backdrop-blur">
            <Maximize className="h-5 w-5" /> Clica para voltar ao ecrã inteiro
          </span>
        </button>
      )}

      {session.status === 'lobby' && <Lobby session={session} players={players} joinUrl={origin ? `${origin}/j/${session.code}` : ''} />}

      {session.status === 'playing' && (
        <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-5 px-6 py-8 lg:py-10">
          <header className="flex items-center justify-between gap-4">
            <span className="rounded-full bg-white/10 px-4 py-1.5 text-lg font-bold">
              Ronda {session.current_round} de {session.total_rounds}
            </span>
            {round?.multiplier === 2 && (
              <span className="animate-pulse rounded-full bg-amber-400 px-5 py-1.5 text-2xl font-black text-purple-950">×2 PONTOS A DOBRAR</span>
            )}
            <span className="font-black tracking-tight text-white/60">VanaCoro</span>
          </header>

          {session.phase === 'intro' && session.current_round === 1 && (
            <p className="text-center text-2xl font-semibold text-amber-200">Lembram-se da Pergunta da Semana?…</p>
          )}
          <h1 className="text-center text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">{round?.prompt ?? ' '}</h1>

          <div className="mx-auto w-full max-w-4xl flex-1">{round && <CoroBoard slots={round.slots} />}</div>

          <Banner session={session} />

          <footer className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <TeamScore session={session} team="a" />
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-white/50">Pote</p>
              <p className="text-5xl font-black tabular-nums text-amber-300">{session.round_pot}</p>
              {session.phase === 'playing' && (
                <div className="mt-2 flex justify-center">
                  <StrikeMarks strikes={session.strikes} />
                </div>
              )}
            </div>
            <TeamScore session={session} team="b" />
          </footer>
          <StrikeOverlay strikeSeq={session.strike_seq} count={session.phase === 'steal' || session.phase === 'playing' ? session.strikes : 1} />
        </main>
      )}

      {session.status === 'finished' && (
        <TeamPodium session={session} players={players} />
      )}
    </div>
  )
}

function subscribeFullscreen(cb: () => void) {
  document.addEventListener('fullscreenchange', cb)
  window.addEventListener('resize', cb)
  return () => {
    document.removeEventListener('fullscreenchange', cb)
    window.removeEventListener('resize', cb)
  }
}

function Lobby({ session, players, joinUrl }: { session: VanaCoroSession; players: VanaCoroPlayer[]; joinUrl: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-8 px-6 py-10">
      <div className="text-center">
        <img src="/images/VanaCoro.png" alt="" className="mx-auto h-28 w-28 rounded-3xl shadow-2xl lg:h-36 lg:w-36" />
        <h1 className="mt-4 text-6xl font-black tracking-tight lg:text-7xl">VanaCoro</h1>
        <p className="mt-1 text-2xl font-semibold text-amber-300">O que é que o JA disse?</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-8">
        {joinUrl && (
          <div className="rounded-3xl bg-white p-4 shadow-2xl">
            <QRCodeSVG value={joinUrl} size={220} level="M" />
          </div>
        )}
        <div className="text-center">
          <p className="text-lg text-white/70">Entra com o código</p>
          <p className="text-7xl font-black tracking-[0.2em] text-amber-300 lg:text-8xl">{session.code}</p>
          <p className="mt-1 text-white/60">{joinUrl.replace(/^https?:\/\//, '')}</p>
        </div>
      </div>
      <div className="grid w-full max-w-4xl grid-cols-2 gap-6">
        {(['a', 'b'] as VanaCoroTeam[]).map((t) => (
          <section key={t} className={`rounded-3xl p-5 ring-2 ${TEAM_STYLE[t].soft} ${TEAM_STYLE[t].ring}`}>
            <h2 className={`text-3xl font-black ${TEAM_STYLE[t].text}`}>{teamName(session, t)}</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {players
                .filter((p) => p.team === t)
                .map((p) => (
                  <li key={p.id} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-lg font-semibold">
                    {p.is_captain && <Crown className="h-4 w-4 text-amber-300" />}
                    {p.display_name}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  )
}

function TeamScore({ session, team }: { session: VanaCoroSession; team: VanaCoroTeam }) {
  const hasControl = session.control_team === team && (session.phase === 'playing' || session.phase === 'steal')
  const score = team === 'a' ? session.team_a_score : session.team_b_score
  return (
    <div
      className={`rounded-3xl p-4 text-center ring-4 transition-all ${TEAM_STYLE[team].soft} ${
        hasControl ? `${TEAM_STYLE[team].ring} scale-105` : 'ring-transparent'
      } ${team === 'b' ? 'justify-self-end' : ''}`}
    >
      <p className={`truncate text-2xl font-black ${TEAM_STYLE[team].text}`}>{teamName(session, team)}</p>
      <p className="text-6xl font-black tabular-nums">{score}</p>
      {hasControl && <p className="text-xs font-bold uppercase tracking-widest text-white/70">tem o controlo</p>}
    </div>
  )
}

function Banner({ session }: { session: VanaCoroSession }) {
  const name = (t: VanaCoroTeam | null) => teamName(session, t)
  let text: React.ReactNode = null
  if (session.phase === 'faceoff') {
    text = session.faceoff_turn ? (
      <>
        <Zap className="inline h-8 w-8 text-amber-300" /> {faceoffMessage(session)}
      </>
    ) : (
      faceoffMessage(session)
    )
  } else if (session.phase === 'steal' && session.control_team) {
    text = `Roubo! ${name(session.control_team === 'a' ? 'b' : 'a')} tem uma tentativa`
  } else if ((session.phase === 'reveal_rest' || session.phase === 'round_end') && session.round_winner) {
    text = `${name(session.round_winner)} ganha +${session.round_banked} pontos!`
  }
  if (!text) return null
  return <p className="text-center text-3xl font-black text-amber-200 lg:text-4xl">{text}</p>
}
