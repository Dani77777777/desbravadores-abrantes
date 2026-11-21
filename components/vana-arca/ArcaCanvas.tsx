'use client'

import { useEffect, useRef } from 'react'
import {
  ARCA_COLS,
  ARCA_ROWS,
  ARCA_SPECIES,
  CAPSIZE_CENTIDEG,
  MAX_RUN_TICKS,
  POS_SCALE,
  TICKS_PER_SECOND,
  createArcaGame,
  stepArca,
  type ArcaGame,
} from '@/utils/vana-arca'

export interface ArcaHud {
  pares: number
  filas: number
  score: number
  lives: number
  started: boolean
}

interface Props {
  seed: number
  /** Chamado uma vez, quando o motor acaba a partida (depois da animação final). */
  onEnd: (taps: number[], ticks: number, game: ArcaGame) => void
  onHud: (hud: ArcaHud) => void
  /** true enquanto o aviso de sair está aberto: o tempo para e os toques não contam. */
  paused?: boolean
}

// Área lógica do desenho (escalada para o tamanho real do ecrã).
const W = 360
const H = 520
const CELL = 30
const GRID_W = CELL * ARCA_COLS
const GRID_H = CELL * ARCA_ROWS
const GRID_X = (W - GRID_W) / 2
const WATER_Y = 400
const GRID_BOTTOM = WATER_Y - 14
const PIVOT_X = W / 2
const PIVOT_Y = GRID_BOTTOM + 10
const PIECE_Y = GRID_BOTTOM - GRID_H - CELL * 1.6

// Do claro (leve) ao escuro (pesado), para se perceber o peso de relance.
const WEIGHT_FILL = ['#fef3c7', '#fde68a', '#fbbf24', '#d97706', '#a16207', '#713f12']
const WEIGHT_TEXT = ['#78350f', '#78350f', '#451a03', '#fff7ed', '#fff7ed', '#fff7ed']

const STEP_MS = 1000 / TICKS_PER_SECOND

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxSize: number) {
  let size = maxSize
  ctx.font = `800 ${size}px system-ui, sans-serif`
  while (size > 6 && ctx.measureText(text).width > maxWidth) {
    size -= 0.5
    ctx.font = `800 ${size}px system-ui, sans-serif`
  }
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  speciesIndex: number,
  x: number,
  y: number,
  width: number,
  showCount: boolean,
) {
  const sp = ARCA_SPECIES[speciesIndex]
  const w = width * CELL - 2
  ctx.fillStyle = WEIGHT_FILL[sp.weight - 1]
  ctx.strokeStyle = 'rgba(69, 26, 3, 0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(x + 1, y + 1, w, CELL - 2, 5)
  ctx.fill()
  ctx.stroke()
  const label = showCount ? `2 ${sp.name}` : sp.name
  ctx.fillStyle = WEIGHT_TEXT[sp.weight - 1]
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fitText(ctx, label, w - 4, 11)
  ctx.fillText(label, x + 1 + w / 2, y + CELL / 2 + 0.5)
}

function draw(
  ctx: CanvasRenderingContext2D,
  game: ArcaGame,
  started: boolean,
  frameTime: number,
  endAnim: number, // 0..1 depois do fim
) {
  const t = frameTime / 1000

  // Céu
  const sky = ctx.createLinearGradient(0, 0, 0, WATER_Y)
  sky.addColorStop(0, '#1e293b')
  sky.addColorStop(1, '#475569')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  // Chuva (só visual: não mexe no motor)
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < 46; i++) {
    const x = ((i * 79 + t * 40) % (W + 40)) - 20
    const y = ((i * 131 + t * 520) % (WATER_Y + 40)) - 40
    ctx.moveTo(x, y)
    ctx.lineTo(x - 4, y + 14)
  }
  ctx.stroke()

  // Arca (roda com a inclinação; ao virar continua a rodar até cair)
  let angleDeg = game.tilt / 100
  if (game.over && game.endReason === 'capsized') angleDeg += Math.sign(angleDeg || 1) * 70 * Math.min(1, endAnim)
  const sink = game.over && game.endReason === 'capsized' ? 60 * Math.min(1, endAnim) : 0

  ctx.save()
  ctx.translate(PIVOT_X, PIVOT_Y + sink)
  ctx.rotate((angleDeg * Math.PI) / 180)
  ctx.translate(-PIVOT_X, -PIVOT_Y)

  // Casco
  ctx.fillStyle = '#7c4a21'
  ctx.strokeStyle = '#3f2410'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(GRID_X - 14, GRID_BOTTOM - GRID_H - 4)
  ctx.lineTo(GRID_X - 14, GRID_BOTTOM + 4)
  ctx.quadraticCurveTo(GRID_X + 10, GRID_BOTTOM + 40, PIVOT_X, GRID_BOTTOM + 42)
  ctx.quadraticCurveTo(GRID_X + GRID_W - 10, GRID_BOTTOM + 40, GRID_X + GRID_W + 14, GRID_BOTTOM + 4)
  ctx.lineTo(GRID_X + GRID_W + 14, GRID_BOTTOM - GRID_H - 4)
  ctx.lineTo(GRID_X + GRID_W, GRID_BOTTOM - GRID_H - 4)
  ctx.lineTo(GRID_X + GRID_W, GRID_BOTTOM)
  ctx.lineTo(GRID_X, GRID_BOTTOM)
  ctx.lineTo(GRID_X, GRID_BOTTOM - GRID_H - 4)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Interior
  ctx.fillStyle = '#f5e6c8'
  ctx.fillRect(GRID_X, GRID_BOTTOM - GRID_H, GRID_W, GRID_H)
  ctx.strokeStyle = 'rgba(120, 72, 33, 0.18)'
  ctx.lineWidth = 1
  for (let c = 1; c < ARCA_COLS; c++) {
    ctx.beginPath()
    ctx.moveTo(GRID_X + c * CELL, GRID_BOTTOM - GRID_H)
    ctx.lineTo(GRID_X + c * CELL, GRID_BOTTOM)
    ctx.stroke()
  }
  // Andares (2 filas cada)
  ctx.strokeStyle = '#7c4a21'
  ctx.lineWidth = 2.5
  for (let f = 1; f < 3; f++) {
    const y = GRID_BOTTOM - f * 2 * CELL
    ctx.beginPath()
    ctx.moveTo(GRID_X, y)
    ctx.lineTo(GRID_X + GRID_W, y)
    ctx.stroke()
  }

  // Pares a bordo (o último cai suavemente até ao lugar)
  for (const p of game.placed) {
    const age = game.tick - p.tick
    const fallFrom = PIECE_Y
    const target = GRID_BOTTOM - (p.row + 1) * CELL
    const k = Math.min(1, age / 10)
    const y = fallFrom + (target - fallFrom) * (k * k)
    drawBlock(ctx, p.species, GRID_X + p.col * CELL, y, p.width, false)
  }

  // Par a passar por cima
  if (!game.over) {
    const x = GRID_X + (game.piece.x / POS_SCALE) * CELL
    drawBlock(ctx, game.piece.species, x, PIECE_Y, game.piece.width, true)
    // Peso, por cima
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = '700 10px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`peso ${game.piece.weight}`, x + (game.piece.width * CELL) / 2, PIECE_Y - 8)
  }
  ctx.restore()

  // Par que caiu à água
  if (game.lastDrop?.kind === 'lost') {
    const age = game.tick - game.lastDrop.tick
    if (age < 40) {
      const x = GRID_X + game.lastDrop.col * CELL
      const y = PIECE_Y + age * age * 0.5
      ctx.globalAlpha = Math.max(0, 1 - age / 40)
      drawBlock(ctx, game.lastDrop.species, x, Math.min(y, WATER_Y), game.lastDrop.width, true)
      ctx.globalAlpha = 1
    }
  }

  // Mar
  const sea = ctx.createLinearGradient(0, WATER_Y - 10, 0, H)
  sea.addColorStop(0, '#0e7490')
  sea.addColorStop(1, '#083344')
  ctx.fillStyle = sea
  ctx.beginPath()
  ctx.moveTo(0, H)
  const swell = 3 + Math.min(game.tick / TICKS_PER_SECOND / 20, 5) * 2
  for (let x = 0; x <= W; x += 8) {
    ctx.lineTo(x, WATER_Y + Math.sin(x / 26 + t * 1.6) * swell + Math.sin(x / 11 - t * 2.3) * 1.5)
  }
  ctx.lineTo(W, H)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(165, 243, 252, 0.25)'
  ctx.fillRect(0, WATER_Y + 18, W, 2)

  // Medidor de inclinação
  drawTiltMeter(ctx, game.tilt)

  if (!started) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '900 24px system-ui, sans-serif'
    ctx.fillText('Toca para começar', W / 2, H / 2 - 14)
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillText('Toca (ou espaço) para largar cada par', W / 2, H / 2 + 16)
  }
}

function drawTiltMeter(ctx: CanvasRenderingContext2D, tilt: number) {
  const cx = W / 2
  const cy = 64
  const r = 44
  const limit = CAPSIZE_CENTIDEG / 100 // 14°
  const span = 30 // o arco mostra ±30°
  const toAngle = (deg: number) => -Math.PI / 2 + ((deg / span) * Math.PI) / 2.2

  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.beginPath()
  ctx.arc(cx, cy, r, toAngle(-span), toAngle(span))
  ctx.stroke()
  ctx.strokeStyle = '#ef4444'
  ctx.beginPath()
  ctx.arc(cx, cy, r, toAngle(limit), toAngle(span))
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, r, toAngle(-span), toAngle(-limit))
  ctx.stroke()
  ctx.lineCap = 'butt'

  const deg = Math.max(-span, Math.min(span, tilt / 100))
  const a = toAngle(deg)
  const danger = Math.abs(tilt) > CAPSIZE_CENTIDEG * 0.75
  ctx.strokeStyle = danger ? '#fca5a5' : '#fff'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2))
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(cx, cy, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = '800 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(`${(Math.abs(tilt) / 100).toFixed(1).replace('.', ',')}° / ${limit}°`, cx, cy + 20)
}

/**
 * Corre o motor a 60 ticks por segundo (passo fixo) e desenha no canvas.
 * Os toques ficam registados pelo número do tick em que a peça foi largada; o
 * servidor repete a partida com eles. Com o separador em segundo plano o jogo
 * pausa (o browser deixa de chamar requestAnimationFrame e o atraso não é recuperado).
 */
export default function ArcaCanvas({ seed, onEnd, onHud, paused = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const onEndRef = useRef(onEnd)
  const onHudRef = useRef(onHud)
  const pausedRef = useRef(paused)
  useEffect(() => {
    onEndRef.current = onEnd
    onHudRef.current = onHud
    pausedRef.current = paused
  }, [onEnd, onHud, paused])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const game = createArcaGame(seed)
    const taps: number[] = []
    let started = false
    let pendingTap = false
    let acc = 0
    let last = performance.now()
    let raf = 0
    let endedAt: number | null = null
    let reported = false
    let hudKey = ''

    const resize = () => {
      const width = wrap.clientWidth
      const height = wrap.clientHeight
      const scale = Math.min(width / W, height / H)
      const dpr = window.devicePixelRatio || 1
      canvas.style.width = `${W * scale}px`
      canvas.style.height = `${H * scale}px`
      canvas.width = Math.round(W * scale * dpr)
      canvas.height = Math.round(H * scale * dpr)
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const pushHud = () => {
      const key = `${game.pares}|${game.filas}|${game.score}|${game.lives}|${started}`
      if (key === hudKey) return
      hudKey = key
      onHudRef.current({ pares: game.pares, filas: game.filas, score: game.score, lives: game.lives, started })
    }
    pushHud()

    const tap = () => {
      if (game.over || pausedRef.current) return
      if (!started) {
        // "Toca para começar": não é um toque de largar e não fica registado.
        started = true
        last = performance.now()
        acc = 0
        pushHud()
        return
      }
      pendingTap = true
    }

    const onPointer = (e: PointerEvent) => {
      if (e.button !== undefined && e.button > 0) return
      e.preventDefault()
      tap()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return
      e.preventDefault()
      if (!e.repeat) tap()
    }
    const onVisibility = () => {
      last = performance.now()
      acc = 0
    }

    wrap.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisibility)

    const frame = (now: number) => {
      // No máximo 250 ms de atraso por frame: um separador parado não "salta" para a frente.
      acc += Math.min(now - last, 250)
      last = now
      if (started && !game.over && !pausedRef.current) {
        while (acc >= STEP_MS && !game.over) {
          const doTap = pendingTap
          pendingTap = false
          if (doTap) taps.push(game.tick)
          stepArca(game, doTap)
          acc -= STEP_MS
          if (game.tick >= MAX_RUN_TICKS && !game.over) break
        }
        pushHud()
      } else {
        acc = 0
      }
      if (game.over && endedAt === null) {
        endedAt = now
        pushHud()
      }
      const endAnim = endedAt === null ? 0 : (now - endedAt) / 1100
      draw(ctx, game, started, now, endAnim)
      if (endedAt !== null && endAnim >= 1 && !reported) {
        reported = true
        onEndRef.current([...taps], game.tick, game)
        return
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      wrap.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [seed])

  return (
    <div
      ref={wrapRef}
      className="flex h-full w-full select-none items-center justify-center"
      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', WebkitUserSelect: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="rounded-2xl shadow-2xl"
        style={{ touchAction: 'manipulation' }}
        aria-label="Arca de Noé: toca para largar cada par de animais"
        role="img"
      />
    </div>
  )
}
