'use client'

import { useEffect, useRef, useState } from 'react'
import type { VanaSketchSession, VanaSketchPlayer } from '@/types/vana-sketch'
import { SketchAvatar } from './ui'
import { VS, vsHand } from './theme'

/** Duração do mini sorteio do próximo desenhador no projetor. */
export const RAFFLE_MS = 3600
/** Os telemóveis revelam um pouco depois, para o projetor ser sempre o primeiro. */
export const RAFFLE_PHONE_EXTRA_MS = 700

/**
 * true enquanto o sorteio do desenhador está a rodar. O servidor já escolheu
 * (drawer_player_id vem logo na sessão) — isto só segura a revelação nos ecrãs.
 *
 * Só roda quando o ecrã VÊ a ronda a abrir; quem abre ou recarrega a página a
 * meio da fase 'calling' vê logo o resultado. O estado é ajustado durante o
 * render (e não num efeito) para o nome nunca piscar um frame antes do sorteio.
 */
export function useDrawerRaffle(session: VanaSketchSession, extraMs = 0): boolean {
  const key = session.status === 'playing' && session.phase === 'calling' ? session.round_number : null
  const [seenKey, setSeenKey] = useState(key)
  const [rollingKey, setRollingKey] = useState<number | null>(null)
  if (key !== seenKey) {
    setSeenKey(key)
    setRollingKey(key)
  }

  useEffect(() => {
    if (rollingKey === null) return
    const t = setTimeout(() => setRollingKey(null), RAFFLE_MS + extraMs)
    return () => clearTimeout(t)
  }, [rollingKey, extraMs])

  return key !== null && rollingKey === key
}

/** Roleta de nomes do projetor: passa pelos jogadores cada vez mais devagar. */
export function DrawerRaffleReel({ candidates }: { candidates: VanaSketchPlayer[] }) {
  const [shown, setShown] = useState<VanaSketchPlayer | null>(null)
  // Os jogadores re-renderizam a cada pontuação — a roleta não pode recomeçar
  const candidatesRef = useRef(candidates)
  useEffect(() => { candidatesRef.current = candidates })

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let delay = 70
    let elapsed = 0
    let last = -1
    const step = () => {
      const list = candidatesRef.current
      if (list.length > 0) {
        let i = Math.floor(Math.random() * list.length)
        if (list.length > 1 && i === last) i = (i + 1) % list.length
        last = i
        setShown(list[i])
      }
      elapsed += delay
      delay = Math.min(420, delay * 1.13)
      if (elapsed + delay < RAFFLE_MS) timer = setTimeout(step, delay)
    }
    step()
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <p className="text-lg font-bold uppercase tracking-[0.3em]" style={{ color: VS.mut }}>
        🎲 A sortear o próximo artista…
      </p>
      <div
        className="flex min-w-[min(80vw,560px)] flex-col items-center gap-4 rounded-3xl border-2 px-10 py-8"
        style={{ borderColor: 'rgba(255,179,71,.45)', background: 'rgba(255,179,71,.08)' }}
      >
        <SketchAvatar name={shown?.display_name ?? '?'} avatarUrl={shown?.avatar_url} size={140} />
        <p className={`${vsHand.className} text-7xl font-bold leading-none`} style={{ color: VS.amber }}>
          {(shown?.display_name ?? '…').split(' ')[0]}
        </p>
      </div>
    </div>
  )
}
