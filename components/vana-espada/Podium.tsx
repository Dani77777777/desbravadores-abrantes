'use client'

import { CinematicPodium } from '@/components/game-podium/CinematicPodium'
import type { EspadaPlayer } from '@/types/vana-espada'

/**
 * Pódio final — o mesmo do VanaQuest (componente partilhado em
 * components/game-podium): 3.º → 2.º → 1.º com suspense, destaque do vencedor
 * em ecrã inteiro e, no fim, o resto da classificação num painel lateral.
 */
export function Podium({ players }: { players: EspadaPlayer[] }) {
  const podium = [...players].sort((a, b) => b.totalPoints - a.totalPoints)
  return (
    <CinematicPodium
      entries={podium.map((p) => ({ id: p.id, name: p.displayName, avatarUrl: p.avatarUrl, points: p.totalPoints }))}
      backgroundClassName="bg-gradient-to-b from-slate-950 via-sky-950 to-slate-900"
      ringOffsetClassName="ring-offset-slate-950"
    />
  )
}
