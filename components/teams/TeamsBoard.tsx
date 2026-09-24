'use client'

import { useEffect, useMemo, useState } from 'react'
import confetti from 'canvas-confetti'
import { revealOrder, type TeamsScreenTeam } from '@/utils/teams'
import { playTick, playWin } from '@/utils/raffle-sound'

/** Colunas da grelha conforme o nº de equipas (cabe num ecrã 16:9). */
function columnsFor(n: number) {
  if (n <= 4) return n
  if (n <= 6) return 3
  if (n <= 8) return 4
  return 6
}

/**
 * Quadro das equipas. Com `revealId` novo (e sem `instant`), os nomes vão caindo um a um
 * (1.º de cada equipa, depois o 2.º…) com som; no fim toca a fanfarra.
 */
export function TeamsBoard({
  teams,
  revealId,
  instant,
  sound,
}: {
  teams: TeamsScreenTeam[]
  revealId: string
  instant: boolean
  sound: boolean
}) {
  const order = useMemo(() => revealOrder(teams), [teams])
  const total = order.length
  // Nº de nomes já revelados (guardado com o id para recomeçar quando muda). Depois de acabar,
  // mostra sempre tudo, mesmo que alguém mude de equipa ou entre mais gente.
  const [progress, setProgress] = useState<{ id: string; shown: number; finished: boolean }>({
    id: revealId,
    shown: 0,
    finished: instant,
  })
  const current = progress.id === revealId ? progress : { id: revealId, shown: 0, finished: instant }
  const done = current.finished || current.shown >= total

  useEffect(() => {
    if (instant) return
    // ~6 s no total, entre 0,12 s e 0,6 s por nome
    const step = Math.max(120, Math.min(600, 6000 / Math.max(1, total)))
    let n = 0
    const t = setInterval(() => {
      n++
      setProgress({ id: revealId, shown: n, finished: n >= total })
      if (sound) playTick(1 + (n % 4) * 0.08)
      if (n >= total) {
        clearInterval(t)
        if (sound) playWin()
        confetti({ particleCount: 140, spread: 90, origin: { y: 0.7 } })
      }
    }, step)
    return () => clearInterval(t)
    // A revelação só recomeça quando o id muda (editar uma equipa depois não repete a animação)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealId, instant])

  const revealed = useMemo(() => {
    const s = new Set<string>()
    order.slice(0, done ? order.length : current.shown).forEach(([i, j]) => s.add(`${i}:${j}`))
    return s
  }, [order, done, current.shown])

  const cols = columnsFor(teams.length)
  const rows = Math.ceil(teams.length / Math.max(1, cols))
  const maxMembers = Math.max(1, ...teams.map((t) => t.members.length))
  // Letra dos nomes (vh): cabe a equipa maior em cada linha da grelha
  const nameVh = Math.max(1.6, Math.min(4.2, 66 / (rows * (maxMembers + 1.8))))

  return (
    <div className="grid h-full w-full gap-[1.5vh]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {teams.map((t, i) => (
        <section
          key={t.id}
          className="flex min-h-0 flex-col overflow-hidden rounded-[2vh] bg-white/[0.06] ring-1 ring-white/10"
          style={{ boxShadow: done ? `0 0 0 0.35vh ${t.color}` : undefined }}
        >
          <header
            className="flex items-center gap-[1vh] px-[1.6vh] py-[1vh] font-black text-white"
            style={{ backgroundColor: t.color, fontSize: `${Math.min(4.6, nameVh * 1.25)}vh` }}
          >
            <span>{t.emoji}</span>
            <span className="min-w-0 flex-1 truncate">{t.name}</span>
            <span className="rounded-full bg-black/25 px-[1vh] text-[0.7em] tabular-nums">
              {t.members.filter((_, j) => revealed.has(`${i}:${j}`)).length}
            </span>
          </header>
          <ul className="flex min-h-0 flex-1 flex-col gap-[0.5vh] p-[1.2vh]">
            {t.members.map((m, j) =>
              revealed.has(`${i}:${j}`) ? (
                <li
                  key={m.id}
                  className="truncate rounded-[1vh] bg-white/10 px-[1.2vh] py-[0.4vh] font-bold text-white"
                  style={{ fontSize: `${nameVh}vh`, animation: instant ? undefined : 'vw-popReveal .45s ease-out both' }}
                >
                  {m.name}
                </li>
              ) : (
                <li
                  key={m.id}
                  className="rounded-[1vh] border border-dashed border-white/10 px-[1.2vh] py-[0.4vh] text-transparent"
                  style={{ fontSize: `${nameVh}vh` }}
                >
                  ·
                </li>
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  )
}
