'use client'

import { useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

interface Flake {
  x: number
  y: number
  r: number
  speed: number
  drift: number
  phase: number
  alpha: number
}

/**
 * Neve a cair num <canvas> por trás do conteúdo. Leve para telemóveis fracos:
 * poucos flocos, resolução limitada (maxDpr), pára quando o separador está
 * escondido e não existe com "reduzir movimento" ligado.
 */
export function Snowfall({ flakes = 80, maxDpr = 1.5 }: { flakes?: number; maxDpr?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (reduced) return
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let width = 0
    let height = 0
    let list: Flake[] = []

    const makeFlake = (y?: number): Flake => {
      const r = 1 + Math.random() * 2.6
      return {
        x: Math.random() * width,
        y: y ?? Math.random() * height,
        r,
        speed: 18 + r * 14 + Math.random() * 12, // px/s — os maiores caem mais depressa
        drift: 8 + Math.random() * 18,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.35 + Math.random() * 0.5,
      }
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (list.length === 0) list = Array.from({ length: flakes }, () => makeFlake())
    }
    resize()

    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = '#ffffff'
      for (const f of list) {
        f.y += f.speed * dt
        f.phase += dt * 0.8
        const x = f.x + Math.sin(f.phase) * f.drift
        if (f.y - f.r > height) Object.assign(f, makeFlake(-f.r * 2))
        ctx.globalAlpha = f.alpha
        ctx.beginPath()
        ctx.arc(x, f.y, f.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(tick)
    }

    const start = () => {
      cancelAnimationFrame(raf)
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf)
      else start()
    }

    start()
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reduced, flakes, maxDpr])

  if (reduced) return null
  return <canvas ref={ref} aria-hidden className="vq-fx-layer" />
}
