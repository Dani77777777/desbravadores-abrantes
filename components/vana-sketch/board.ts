// Renderização do quadro de desenho.
// Todos os pontos são normalizados 0..1 num quadro 4:3 — assim o desenho
// fica igual no telemóvel do desenhador, nos palpiteiros e no projetor.

import { CANVAS_BG } from '@/utils/vana-sketch'

export const BOARD_ASPECT = 4 / 3

export interface LiveStroke {
  id: string
  color: string
  size: number
  points: [number, number][]
  done: boolean
}

// Desenha um traço como polilinha suavizada (curvas pelos pontos médios)
function drawStroke(ctx: CanvasRenderingContext2D, s: LiveStroke, w: number, h: number) {
  const pts = s.points
  if (!pts.length) return
  ctx.strokeStyle = s.color
  // O tamanho do pincel é relativo à largura do quadro (px num quadro de 800)
  ctx.lineWidth = (s.size / 800) * w
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const x0 = pts[0][0] * w
  const y0 = pts[0][1] * h
  if (pts.length === 1) {
    // Um toque = ponto
    ctx.fillStyle = s.color
    ctx.arc(x0, y0, ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  ctx.moveTo(x0, y0)
  for (let i = 1; i < pts.length - 1; i++) {
    const [x1, y1] = [pts[i][0] * w, pts[i][1] * h]
    const [x2, y2] = [pts[i + 1][0] * w, pts[i + 1][1] * h]
    ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2)
  }
  const last = pts[pts.length - 1]
  ctx.lineTo(last[0] * w, last[1] * h)
  ctx.stroke()
}

// Redesenha o quadro inteiro (limpa + todos os traços por ordem)
export function renderBoard(canvas: HTMLCanvasElement, strokes: Iterable<LiveStroke>) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.fillStyle = CANVAS_BG
  ctx.fillRect(0, 0, w, h)
  for (const s of strokes) drawStroke(ctx, s, w, h)
}

// Ajusta a resolução interna do canvas ao tamanho CSS × devicePixelRatio
export function fitCanvas(canvas: HTMLCanvasElement): boolean {
  const rect = canvas.getBoundingClientRect()
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.max(1, Math.round(rect.width * dpr))
  const h = Math.max(1, Math.round(rect.height * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
    return true
  }
  return false
}
