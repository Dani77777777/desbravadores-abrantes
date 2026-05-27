'use client'

import { MonitorPlay } from 'lucide-react'

interface Props {
  sessionId: string
}

/**
 * Botão "Abrir apresentação" — só visível em desktop (sm+), igual ao padrão
 * do VanaQuest. Em mobile o Narrador usa o painel sem a apresentação separada.
 */
export function OpenPresentButton({ sessionId }: Props) {
  return (
    <a
      href={`/jogos/vana-camp/${sessionId}/present`}
      target="_blank"
      rel="noopener"
      className="fixed top-4 right-4 z-40 hidden sm:flex items-center gap-1.5 bg-stone-800/80 hover:bg-stone-700 border border-amber-700/40 text-amber-100 rounded-xl px-3 py-2 text-xs font-bold shadow-lg backdrop-blur transition-colors"
      title="Abrir apresentação para projetor"
    >
      <MonitorPlay className="w-3.5 h-3.5" />
      Abrir apresentação
    </a>
  )
}
