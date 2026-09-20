'use client'

import { useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'

interface Props {
  /** Timestamp do último sinal — passa o `flash` retornado por useVibrationSignal. */
  flash: number
  /** Banner discreto a pedir interação caso o tab não tenha user-gesture ainda. */
  needsGesture: boolean
}

/**
 * Overlay visual que pulsa quando chega um sinal de vibração.
 * Serve como confirmação para o jogador (e como fallback em dispositivos sem
 * motor de vibração, ex: desktop ou iOS).
 */
export function VibrationFlash({ flash, needsGesture }: Props) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!flash) return
    setActive(true)
    const t = setTimeout(() => setActive(false), 700)
    return () => clearTimeout(t)
  }, [flash])

  return (
    <>
      {/* Flash anelar à volta do viewport */}
      <div
        className={`fixed inset-0 pointer-events-none z-[100] transition-opacity duration-500 ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          boxShadow: 'inset 0 0 0 8px rgba(252, 211, 77, 0.85), inset 0 0 60px 12px rgba(252, 211, 77, 0.3)',
        }}
        aria-hidden
      />

      {/* Banner discreto: "toca para ativar vibração" */}
      {needsGesture && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[90] bg-amber-900/90 border border-amber-500 text-amber-100 rounded-full px-4 py-1.5 text-xs flex items-center gap-2 shadow-lg backdrop-blur animate-in fade-in slide-in-from-bottom duration-300">
          <Smartphone className="w-3.5 h-3.5" />
          Toca no ecrã para ativares a vibração
        </div>
      )}
    </>
  )
}
