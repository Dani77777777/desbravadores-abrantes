'use client'

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Share2, Download, ImageOff, Sparkles } from 'lucide-react'
import { getVanaSketchDrawings, type SketchDrawing } from '@/lib/actions/vana-sketch'
import type { VanaSketchPlayer } from '@/types/vana-sketch'
import { renderBoard } from './board'
import { VS, VS_SCREEN_STYLE, vsHand, vsSans } from './theme'

interface Props {
  sessionId: string
  players: VanaSketchPlayer[]
  /** Quando o jogo acabou (ISO) — por omissão, hoje */
  gameDate?: string | null
}

// Desenha os traços num canvas fora do ecrã e devolve a imagem (4:3)
function drawingToDataUrl(drawing: SketchDrawing): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 900
  renderBoard(canvas, drawing.strokes.map((s, i) => ({ ...s, id: String(i), done: true })))
  return canvas.toDataURL('image/png')
}

/**
 * "O desenho da sessão": no fim do jogo, o host vê o melhor desenho (a ronda
 * em que mais gente acertou), pode trocar por outro com ‹ › e partilhá-lo
 * como imagem 1080×1080 a promover o VanaSketch — o mesmo padrão do
 * WinnersShareButton do VanaWords e do pódio do VanaQuest.
 */
export function BestDrawingShare({ sessionId, players, gameDate }: Props) {
  const [drawings, setDrawings] = useState<SketchDrawing[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [sharing, setSharing] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    getVanaSketchDrawings(sessionId).then((res) => {
      if (cancelled) return
      if (res.error) setLoadError(res.error)
      else setDrawings(res.drawings ?? [])
    })
    return () => { cancelled = true }
  }, [sessionId])

  const drawing = drawings?.[index] ?? null
  const imageUrl = useMemo(() => (drawing ? drawingToDataUrl(drawing) : null), [drawing])
  const winner = useMemo(() => [...players].sort((a, b) => b.score - a.score)[0], [players])

  async function handleShare() {
    if (sharing || !drawing) return
    setSharing(true)
    setToast(null)
    try {
      const { toPng } = await import('html-to-image')
      const node = cardRef.current
      if (!node) throw new Error('Card não pronto')

      // Captura com retry (pode falhar na primeira tentativa com fontes web)
      let dataUrl: string | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true, backgroundColor: '#0d0a22' })
          break
        } catch (err) {
          if (attempt === 2) throw err
          await new Promise((r) => setTimeout(r, 400))
        }
      }
      if (!dataUrl) throw new Error('Falha ao gerar imagem')

      const date = (gameDate ? new Date(gameDate) : new Date())
        .toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })
      const text = [
        `🎨 VanaSketch — ${date}`,
        '',
        `O desenho da sessão: «${drawing.word}», desenhado por ${drawing.drawerName}` +
          (drawing.correctCount > 0 ? ` — ${drawing.correctCount} de ${drawing.guesserCount} acertaram! 👏` : '!'),
        winner ? `🏆 Vencedor: ${winner.display_name.split(' ')[0]} com ${winner.score} pontos` : '',
        '',
        'Não jogaste? Junta-te ao próximo VanaSketch e mostra o artista que há em ti! 🖍️',
      ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n')
      const fileName = `vanasketch-${drawing.word.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}-${Date.now()}.png`

      // Web Share API (telemóvel / desktop moderno)
      try {
        const blob = await (await fetch(dataUrl)).blob()
        const file = new File([blob], fileName, { type: 'image/png' })
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: '🎨 O desenho da sessão — VanaSketch', text })
          setToast({ msg: 'Partilhado!', ok: true })
          return
        }
      } catch {
        // ignora, faz download
      }

      const link = document.createElement('a')
      link.href = dataUrl
      link.download = fileName
      link.click()
      setToast({ msg: 'Imagem transferida!', ok: true })
    } catch (err) {
      console.error('[BestDrawingShare]', err)
      setToast({ msg: 'Erro ao gerar imagem. Tenta novamente.', ok: false })
    } finally {
      setSharing(false)
      setTimeout(() => setToast(null), 4000)
    }
  }

  if (loadError) return null
  if (drawings && drawings.length === 0) return null

  return (
    <section className="space-y-3 rounded-2xl border p-4" style={{ background: VS.panel, borderColor: VS.pline }}>
      <p className="flex items-center gap-2 text-lg font-black">
        <Sparkles className="h-5 w-5" style={{ color: VS.pink }} /> O desenho da sessão
      </p>

      {!drawing || !imageUrl ? (
        <p className="text-sm" style={{ color: VS.mut }}>A carregar os desenhos…</p>
      ) : (
        <>
          <div className="relative">
            <img src={imageUrl} alt={`Desenho de «${drawing.word}»`} className="w-full rounded-xl border-4 border-white/20" />
            {drawings!.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setIndex((i) => (i - 1 + drawings!.length) % drawings!.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
                  title="Desenho anterior"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIndex((i) => (i + 1) % drawings!.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
                  title="Desenho seguinte"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
          <p className="text-sm" style={{ color: VS.mut }}>
            {index === 0 && <span className="mr-1.5 rounded-full px-2 py-0.5 text-[11px] font-black uppercase" style={{ background: 'rgba(255,93,162,.2)', color: VS.pink }}>Melhor</span>}
            Ronda {drawing.roundNumber} · <span className="font-bold text-white">«{drawing.word}»</span> por {drawing.drawerName} ·{' '}
            {drawing.correctCount} de {drawing.guesserCount} acertaram
            {drawings!.length > 1 && ` · ${index + 1}/${drawings!.length}`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              disabled={sharing}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(160deg,#ff8fc0,#ff5da2)' }}
            >
              <Share2 className="h-4 w-4" /> {sharing ? 'A gerar imagem…' : 'Partilhar desenho'}
            </button>
            {toast && (
              <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${toast.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                {toast.ok ? <Download className="h-3.5 w-3.5" /> : <ImageOff className="h-3.5 w-3.5" />}
                {toast.msg}
              </span>
            )}
          </div>

          {/* Card fora do ecrã para captura */}
          <div style={{ position: 'fixed', left: '-99999px', top: 0, pointerEvents: 'none' }} aria-hidden="true">
            <SketchShareCard ref={cardRef} drawing={drawing} imageUrl={imageUrl} winner={winner} gameDate={gameDate} />
          </div>
        </>
      )}
    </section>
  )
}

interface CardProps {
  drawing: SketchDrawing
  imageUrl: string
  winner?: VanaSketchPlayer
  gameDate?: string | null
}

/** Imagem 1080×1080 para partilhar — mesmo formato dos cards do VanaWords e do VanaQuest. */
const SketchShareCard = forwardRef<HTMLDivElement, CardProps>(({ drawing, imageUrl, winner, gameDate }, ref) => {
  const date = (gameDate ? new Date(gameDate) : new Date())
    .toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })
  const tape = { position: 'absolute' as const, width: '150px', height: '38px', background: 'rgba(255,214,140,.75)', boxShadow: '0 2px 6px rgba(0,0,0,.25)' }

  return (
    <div
      ref={ref}
      className={`${vsSans.className} relative flex flex-col items-center overflow-hidden`}
      style={{ ...VS_SCREEN_STYLE, width: '1080px', height: '1080px', padding: '44px 56px' }}
    >
      {/* Cabeçalho */}
      <div className="flex items-center gap-5">
        <img src="/images/VanaSketch.png" alt="" style={{ height: '92px', width: 'auto', objectFit: 'contain' }} crossOrigin="anonymous" />
        <div>
          <p className="font-black uppercase" style={{ color: VS.mut, letterSpacing: '0.3em', fontSize: '15px' }}>VanaSketch · {date}</p>
          <p className={`${vsHand.className} font-bold leading-none`} style={{ fontSize: '72px', color: VS.ink }}>
            O desenho da sessão 🎨
          </p>
        </div>
      </div>

      {/* O desenho, como uma folha colada com fita */}
      <div className="relative" style={{ marginTop: '34px', transform: 'rotate(-1.5deg)' }}>
        <span style={{ ...tape, top: '-16px', left: '40px', transform: 'rotate(-6deg)' }} />
        <span style={{ ...tape, top: '-16px', right: '40px', transform: 'rotate(5deg)' }} />
        <img
          src={imageUrl}
          alt=""
          style={{ width: '680px', height: '510px', borderRadius: '18px', border: '10px solid #fff', boxShadow: '0 30px 60px -18px rgba(0,0,0,.7)' }}
        />
      </div>

      {/* Palavra e autor */}
      <div className="text-center" style={{ marginTop: '30px' }}>
        <p style={{ color: VS.mut, fontSize: '22px', fontWeight: 700 }}>A palavra era</p>
        <p className={`${vsHand.className} font-bold leading-none`} style={{ fontSize: '76px', color: VS.pink }}>{drawing.word}</p>
        <p style={{ color: VS.ink, fontSize: '24px', fontWeight: 700, marginTop: '6px' }}>
          desenhado por {drawing.drawerName}
          {drawing.correctCount > 0 && <span style={{ color: VS.teal }}> · {drawing.correctCount} de {drawing.guesserCount} acertaram</span>}
        </p>
      </div>

      {/* Rodapé: vencedor + convite */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-between"
        style={{ padding: '22px 56px', background: 'rgba(255,255,255,.06)', borderTop: `1px solid ${VS.pline}` }}
      >
        <p style={{ color: VS.amber, fontSize: '24px', fontWeight: 800 }}>
          {winner ? `🏆 ${winner.display_name.split(' ')[0]} · ${winner.score} pts` : '🏆 VanaSketch'}
        </p>
        <p style={{ color: VS.ink, fontSize: '22px', fontWeight: 700 }}>Junta-te ao próximo jogo! 🖍️</p>
      </div>
    </div>
  )
})
SketchShareCard.displayName = 'SketchShareCard'
