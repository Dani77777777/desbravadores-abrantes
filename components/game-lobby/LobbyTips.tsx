'use client'

import { useEffect, useState } from 'react'
import { lobbyTips, LOBBY_THEMES, type LobbyGame } from './content'

// ── "Sabias que…?" / dicas a rodar ────────────────────────────────
export function LobbyTips({ game, variant }: { game: LobbyGame; variant: 'projector' | 'phone' }) {
  const theme = LOBBY_THEMES[game]
  const [tips] = useState(() => lobbyTips(game))
  const [index, setIndex] = useState(0)

  useEffect(() => {
    // Começa num ponto aleatório (no cliente, para não dar erro de hidratação):
    // assim o telemóvel e o projetor não mostram a mesma coisa ao mesmo tempo.
    const start = setTimeout(() => setIndex(Math.floor(Math.random() * tips.length)), 0)
    const id = setInterval(() => setIndex((i) => (i + 1) % tips.length), variant === 'projector' ? 9000 : 7000)
    return () => {
      clearTimeout(start)
      clearInterval(id)
    }
  }, [tips.length, variant])

  const tip = tips[index]
  if (variant === 'phone') {
    return (
      <div className={`w-full rounded-2xl border px-4 py-3 text-left min-h-[5.5rem] ${theme.card}`}>
        <div key={index} className="flex gap-3 items-start animate-in fade-in slide-in-from-bottom-1 duration-500">
          <span className="text-2xl leading-none mt-0.5">{tip.icon}</span>
          <div className="min-w-0">
            <p className={`${theme.accent} text-[11px] font-black uppercase tracking-widest`}>{tip.title}</p>
            <p className="text-white/90 text-sm leading-snug mt-0.5">{tip.text}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`h-full rounded-3xl border backdrop-blur-sm px-6 py-4 flex items-center overflow-hidden ${theme.card}`}>
      <div key={index} className="flex gap-4 items-center animate-in fade-in slide-in-from-bottom-2 duration-700">
        <span className="text-5xl leading-none flex-shrink-0">{tip.icon}</span>
        <div className="min-w-0">
          <p className={`${theme.accent} text-xs font-black uppercase tracking-widest`}>{tip.title}</p>
          <p className="text-white text-xl font-semibold leading-snug mt-1">{tip.text}</p>
        </div>
      </div>
    </div>
  )
}
