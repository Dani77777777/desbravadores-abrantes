'use client'

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Carta } from '@/utils/vana-sentinela/types'
import { TEMPO_CARTA_MS } from '@/utils/vana-sentinela/game'

export type Lado = 'verdade' | 'distorcao'
/** Para onde a carta saiu: um dos lados, ou 'tempo' (cai quando o tempo acaba). */
export type Saida = Lado | 'tempo' | null

const DIFICULDADE = { 1: 'Fácil', 2: 'Média', 3: 'Difícil' } as const

/** Fração da largura da carta a partir da qual o arrasto decide. */
const LIMIAR = 0.3
/** px/ms — um "lançamento" rápido também decide, mesmo curto. */
const VELOCIDADE_LANCAMENTO = 0.5

/**
 * Carta arrastável (pointer events: toque e rato). Direita = VERDADE, esquerda = DISTORÇÃO.
 * A carta inclina com o arrasto e mostra a etiqueta do lado, com opacidade proporcional.
 * Abaixo do limiar volta ao centro com mola.
 */
export default function SwipeCard({
  carta,
  numero,
  total,
  ativa,
  saida,
  reducedMotion,
  onDecidir,
}: {
  carta: Carta
  numero: number
  total: number
  /** Aceita respostas e o tempo está a correr. */
  ativa: boolean
  saida: Saida
  reducedMotion: boolean
  onDecidir: (lado: Lado) => void
}) {
  const drag = useRef<{ x0: number; amostras: { x: number; t: number }[] } | null>(null)
  const [dx, setDx] = useState(0)
  const [aArrastar, setAArrastar] = useState(false)
  // Medida no início de cada arrasto (não se lê o DOM durante o render).
  const [largura, setLargura] = useState(320)

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!ativa || saida) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setLargura(e.currentTarget.offsetWidth || 320)
    drag.current = { x0: e.clientX, amostras: [{ x: e.clientX, t: e.timeStamp }] }
    setAArrastar(true)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d) return
    d.amostras.push({ x: e.clientX, t: e.timeStamp })
    if (d.amostras.length > 6) d.amostras.shift()
    setDx(e.clientX - d.x0)
  }

  function terminar(e: ReactPointerEvent<HTMLDivElement>, cancelado = false) {
    const d = drag.current
    if (!d) return
    drag.current = null
    setAArrastar(false)
    const desloc = e.clientX - d.x0
    const primeira = d.amostras[0]
    const dt = e.timeStamp - primeira.t
    const velocidade = dt > 0 ? (e.clientX - primeira.x) / dt : 0

    const passouLimiar = Math.abs(desloc) > LIMIAR * largura
    const lancou = Math.abs(velocidade) > VELOCIDADE_LANCAMENTO && Math.sign(velocidade) === Math.sign(desloc) && Math.abs(desloc) > 24
    if (!cancelado && ativa && (passouLimiar || lancou)) {
      onDecidir(desloc > 0 ? 'verdade' : 'distorcao')
    } else {
      setDx(0)
    }
  }

  // Posição da carta
  let transform = `translateX(${dx}px) rotate(${dx * 0.06}deg)`
  let opacity = 1
  let transition = aArrastar ? 'none' : reducedMotion ? 'none' : 'transform 420ms cubic-bezier(.34,1.56,.64,1)'
  if (saida) {
    if (reducedMotion) {
      transform = `translateX(${dx}px)`
      transition = 'opacity 200ms ease-out'
    } else if (saida === 'tempo') {
      transform = 'translateY(60px) scale(.9)'
      transition = 'transform 350ms ease-in, opacity 350ms ease-in'
    } else {
      const sinal = saida === 'verdade' ? 1 : -1
      transform = `translateX(${sinal * 160}%) rotate(${sinal * 28}deg)`
      transition = 'transform 380ms ease-in, opacity 380ms ease-in'
    }
    opacity = 0
  }

  // Etiquetas por cima da carta, conforme o lado para onde vai
  const fracao = Math.min(1, Math.abs(dx) / (LIMIAR * largura))
  const lado: Lado | null = saida === 'verdade' || saida === 'distorcao' ? saida : dx > 8 ? 'verdade' : dx < -8 ? 'distorcao' : null
  const opacidadeEtiqueta = saida ? 1 : fracao

  return (
    <div
      role="group"
      aria-roledescription="carta"
      aria-label={`Carta ${numero} de ${total}: ${carta.afirmacao}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => terminar(e)}
      onPointerCancel={(e) => terminar(e, true)}
      className={`relative flex h-full w-full select-none flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-black/40 ${
        ativa && !saida ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      style={{ transform, opacity, transition, touchAction: 'none' }}
    >
      {/* Barra do tempo */}
      <div className="h-2.5 w-full bg-slate-200">
        {ativa && !saida && (
          <div
            key={carta.id}
            className="vs-timer h-full w-full"
            style={{ ['--vs-time' as string]: `${TEMPO_CARTA_MS}ms` }}
          />
        )}
      </div>

      <div className="flex items-center justify-between px-5 pt-4 text-xs font-extrabold uppercase tracking-wider text-slate-500">
        <span>
          Carta {numero}/{total}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 ${
            carta.dificuldade === 3 ? 'bg-rose-100 text-rose-800' : carta.dificuldade === 2 ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'
          }`}
        >
          {DIFICULDADE[carta.dificuldade]}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-6 sm:px-8">
        <p className="text-center text-[1.35rem] font-extrabold leading-snug text-slate-900 sm:text-2xl">{carta.afirmacao}</p>
      </div>

      <p className="pb-4 text-center text-xs font-semibold text-slate-400" aria-hidden>
        ← arrasta →
      </p>

      {/* Etiquetas do arrasto: nunca só cor (texto + ícone) */}
      {lado && (
        <div
          aria-hidden
          className={`pointer-events-none absolute top-14 rounded-2xl border-4 px-4 py-2 text-2xl font-black uppercase tracking-wider shadow-lg ${
            lado === 'verdade'
              ? 'left-5 -rotate-12 border-emerald-600 bg-emerald-50/95 text-emerald-700'
              : 'right-5 rotate-12 border-orange-600 bg-orange-50/95 text-orange-700'
          }`}
          style={{ opacity: opacidadeEtiqueta }}
        >
          {lado === 'verdade' ? '✓ Verdade' : '✗ Distorção'}
        </div>
      )}
    </div>
  )
}
