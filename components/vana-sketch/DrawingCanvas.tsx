'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Undo2, Trash2, Paintbrush } from 'lucide-react'
import { BRUSH_COLORS, BRUSH_SIZES } from '@/utils/vana-sketch'
import { renderBoard, fitCanvas } from './board'
import { useSketchSync } from './useSketchSync'
import { VS } from './theme'

const SEND_INTERVAL_MS = 45 // ~22 lotes/segundo

interface DrawingCanvasProps {
  sessionId: string
  roundNumber: number
  canvasVersion: number
  disabled?: boolean
}

/**
 * Canvas do desenhador: pointer events → traço local imediato + broadcast
 * em lotes; no fim do traço persiste na BD (via useSketchSync).
 */
export function DrawingCanvas({ sessionId, roundNumber, canvasVersion, disabled }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { strokesRef, revision, sendSeg, commitStroke, undoLast, clearBoard } =
    useSketchSync(sessionId, roundNumber, canvasVersion)

  const [color, setColor] = useState(BRUSH_COLORS[0])
  const [size, setSize] = useState(BRUSH_SIZES[1])
  const [confirmClear, setConfirmClear] = useState(false)

  // Traço em curso
  const activeRef = useRef<{
    strokeId: string
    pointerId: number
    pending: [number, number][]
    lastSent: number
  } | null>(null)

  // Redesenhar quando o quadro muda
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let raf = requestAnimationFrame(() => {
      fitCanvas(canvas)
      renderBoard(canvas, strokesRef.current.values())
    })
    return () => cancelAnimationFrame(raf)
  }, [revision, strokesRef])

  // Redesenhar em resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      if (fitCanvas(canvas)) renderBoard(canvas, strokesRef.current.values())
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [strokesRef])

  const toNorm = useCallback((e: React.PointerEvent): [number, number] | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))]
  }, [])

  const flush = useCallback((force = false) => {
    const active = activeRef.current
    if (!active || !active.pending.length) return
    const now = Date.now()
    if (!force && now - active.lastSent < SEND_INTERVAL_MS) return
    sendSeg(active.strokeId, color, size, active.pending)
    active.pending = []
    active.lastSent = now
  }, [sendSeg, color, size])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled || activeRef.current) return
    const pt = toNorm(e)
    if (!pt) return
    e.currentTarget.setPointerCapture(e.pointerId)
    activeRef.current = {
      strokeId: crypto.randomUUID(),
      pointerId: e.pointerId,
      pending: [pt],
      lastSent: 0,
    }
    flush(true)
  }, [disabled, toNorm, flush])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const active = activeRef.current
    if (!active || e.pointerId !== active.pointerId) return
    const pt = toNorm(e)
    if (!pt) return
    active.pending.push(pt)
    flush()
  }, [toNorm, flush])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const active = activeRef.current
    if (!active || e.pointerId !== active.pointerId) return
    flush(true)
    commitStroke(active.strokeId)
    activeRef.current = null
  }, [flush, commitStroke])

  return (
    <div className="space-y-3">
      {/* Quadro 4:3 */}
      <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl border-4 border-white/20" style={{ aspectRatio: '4 / 3' }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ touchAction: 'none', cursor: disabled ? 'default' : 'crosshair' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      {/* Ferramentas */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border p-3" style={{ background: VS.panel, borderColor: VS.pline }}>
        <div className="flex flex-wrap gap-1.5">
          {BRUSH_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Cor ${c}`}
              className="h-8 w-8 rounded-full border-2 transition-transform active:scale-90"
              style={{
                background: c,
                borderColor: color === c ? VS.pink : 'rgba(255,255,255,.25)',
                transform: color === c ? 'scale(1.15)' : undefined,
              }}
            />
          ))}
        </div>

        <div className="mx-1 h-8 w-px bg-white/10" />

        <div className="flex items-center gap-1.5">
          {BRUSH_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              aria-label={`Pincel ${s}px`}
              className="flex h-8 w-8 items-center justify-center rounded-full border transition-colors"
              style={{ borderColor: size === s ? VS.pink : 'rgba(255,255,255,.15)', background: size === s ? 'rgba(255,93,162,.15)' : 'transparent' }}
            >
              <span className="rounded-full" style={{ width: Math.max(4, s / 1.6), height: Math.max(4, s / 1.6), background: '#fff' }} />
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => undoLast()}
            disabled={disabled}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-white/15 px-3 text-sm font-semibold text-white/80 hover:bg-white/10 disabled:opacity-40"
          >
            <Undo2 className="h-4 w-4" /> Anular
          </button>
          {confirmClear ? (
            <button
              type="button"
              onClick={() => { clearBoard(); setConfirmClear(false) }}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-red-500/90 px-3 text-sm font-bold text-white"
            >
              <Trash2 className="h-4 w-4" /> Confirmar?
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 2500) }}
              disabled={disabled}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-red-400/40 px-3 text-sm font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" /> Limpar
            </button>
          )}
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs" style={{ color: VS.mut }}>
        <Paintbrush className="h-3.5 w-3.5" /> Desenha com o dedo — sem letras nem números!
      </p>
    </div>
  )
}
