'use client'

import Link from 'next/link'
import { Tv } from 'lucide-react'

interface Props {
  sessionId: string
}

/**
 * Botão flutuante no canto superior esquerdo que abre a apresentação
 * (projetor / TV) num separador novo. Visível em todas as vistas do Narrador.
 */
export function OpenPresentButton({ sessionId }: Props) {
  return (
    <Link
      href={`/jogos/vana-camp/${sessionId}/present`}
      target="_blank"
      className="fixed top-4 right-4 z-40 bg-stone-800/80 hover:bg-stone-700 border border-amber-700/40 text-amber-100 rounded-full px-4 py-2 flex items-center gap-2 text-sm font-semibold shadow-lg backdrop-blur transition"
      title="Abrir apresentação para projetor"
    >
      <Tv className="w-4 h-4" />
      Apresentação
    </Link>
  )
}
