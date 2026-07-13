'use client'

import { useEffect, useRef } from 'react'
import { renderBoard, fitCanvas } from './board'
import { useSketchSync } from './useSketchSync'

interface CanvasViewerProps {
  sessionId: string
  roundNumber: number
  canvasVersion: number
  className?: string
}

/** Quadro só de leitura — projetor e telemóveis dos palpiteiros. */
export function CanvasViewer({ sessionId, roundNumber, canvasVersion, className = '' }: CanvasViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { strokesRef, revision } = useSketchSync(sessionId, roundNumber, canvasVersion)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const raf = requestAnimationFrame(() => {
      fitCanvas(canvas)
      renderBoard(canvas, strokesRef.current.values())
    })
    return () => cancelAnimationFrame(raf)
  }, [revision, strokesRef])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      if (fitCanvas(canvas)) renderBoard(canvas, strokesRef.current.values())
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [strokesRef])

  return (
    <div className={`relative w-full overflow-hidden ${className}`} style={{ aspectRatio: '4 / 3' }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  )
}
