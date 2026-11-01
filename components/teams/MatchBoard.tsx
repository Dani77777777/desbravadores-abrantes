'use client'

import { useEffect, useState } from 'react'
import confetti from 'canvas-confetti'
import type { TeamsMatch, TeamsScreenTeam } from '@/utils/teams'
import { playTick, playWin } from '@/utils/raffle-sound'

/** Tempo até cada família sorteada parar (a 1.ª aos 1,8 s, a seguinte 1 s depois…). */
const landAt = (i: number) => 1800 + i * 1000

/**
 * Modo Famílias: as famílias que vão jogar. Com animação, os nomes de todas as famílias
 * passam como num sorteio até cada lugar parar na família sorteada; no fim, fanfarra.
 * As outras ficam em baixo, "a assistir".
 */
export function MatchBoard({
  teams,
  match,
  instant,
  sound,
}: {
  teams: TeamsScreenTeam[]
  match: TeamsMatch
  instant: boolean
  sound: boolean
}) {
  const picked = match.teamIds.map((id) => teams.find((t) => t.id === id)).filter(Boolean) as TeamsScreenTeam[]
  const watching = teams.filter((t) => !match.teamIds.includes(t.id))
  const [elapsed, setElapsed] = useState(instant ? Infinity : 0)

  useEffect(() => {
    if (instant) return
    const started = Date.now()
    const total = landAt(picked.length - 1)
    let ticks = 0
    const t = setInterval(() => {
      const ms = Date.now() - started
      setElapsed(ms)
      ticks++
      if (sound && ms < total && ticks % 2 === 0) playTick(1 + (ticks % 5) * 0.06)
      if (ms >= total) {
        clearInterval(t)
        if (sound) playWin()
        confetti({ particleCount: 160, spread: 100, origin: { y: 0.6 } })
      }
    }, 90)
    return () => clearInterval(t)
    // Só recomeça com um sorteio novo (o componente tem key = match.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shownTeam = (i: number): TeamsScreenTeam | null => {
    if (elapsed >= landAt(i)) return picked[i]
    if (teams.length === 0) return null
    return teams[Math.floor(elapsed / 90 + i * 3) % teams.length]
  }
  const done = elapsed >= landAt(picked.length - 1)

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-[3vh]">
      <p className="text-[4vh] font-black uppercase tracking-[0.3em] text-amber-300">{done ? 'Vão jogar!' : 'Quem vai jogar…'}</p>
      <div className="flex w-full items-stretch justify-center gap-[2vw]">
        {picked.map((_, i) => {
          const t = shownTeam(i)
          const landed = elapsed >= landAt(i)
          return (
            <div key={i} className="flex min-w-0 flex-1 items-stretch gap-[2vw]" style={{ maxWidth: picked.length === 2 ? '44vw' : undefined }}>
              {i > 0 && picked.length === 2 && (
                <span className="self-center text-[9vh] font-black italic text-white/80 drop-shadow-lg">VS</span>
              )}
              <section
                className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[3vh] bg-white/[0.07] ring-1 ring-white/10 transition-all duration-300"
                style={{
                  boxShadow: landed && t ? `0 0 0 0.5vh ${t.color}, 0 3vh 8vh -2vh ${t.color}` : undefined,
                  transform: landed ? 'scale(1)' : 'scale(.96)',
                }}
              >
                <header
                  className="flex flex-col items-center gap-[1vh] px-[2vh] py-[2.5vh] text-center font-black text-white"
                  style={{ backgroundColor: t?.color ?? '#334155' }}
                >
                  <span className="text-[9vh] leading-none">{t?.emoji}</span>
                  <span className="max-w-full truncate text-[4.4vh] leading-tight">{t?.name}</span>
                </header>
                <ul className="flex min-h-0 flex-1 flex-wrap content-start justify-center gap-[1vh] p-[2vh]">
                  {landed &&
                    t?.members.map((m, j) => (
                      <li
                        key={m.id}
                        className="rounded-[1vh] bg-white/10 px-[1.6vh] py-[0.6vh] text-[2.8vh] font-bold"
                        style={{ animation: instant ? undefined : `vw-popReveal .45s ease-out ${j * 60}ms both` }}
                      >
                        {m.name}
                      </li>
                    ))}
                </ul>
              </section>
            </div>
          )
        })}
      </div>
      {done && watching.length > 0 && (
        <p className="max-w-[80vw] text-center text-[2.6vh] font-bold text-blue-200">
          👀 A assistir: {watching.map((t) => `${t.emoji} ${t.name}`).join(' · ')}
        </p>
      )}
    </div>
  )
}
