'use client'

import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Download, ImageIcon, Loader2, Share2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RunShareCard, shareChallenge } from './RunShareCard'
import { formatDuration } from '@/utils/vana-trilha'
import {
  VANATRILHA_DAILY_LENGTH,
  VANATRILHA_DAILY_LIVES,
  type VanaTrilhaDailyRun,
  type VanaTrilhaHistoryEntry,
  type VanaTrilhaRewards,
  type VanaTrilhaStation,
} from '@/types/vana-trilha'

interface Props {
  run: VanaTrilhaDailyRun
  station: VanaTrilhaStation
  rewards: VanaTrilhaRewards | null
  playerName: string | null
}

function historySymbol(h: VanaTrilhaHistoryEntry): string {
  if (h.kind === 'bonus') return h.correct ? '📜' : '⬜'
  if (h.correct) return '🟩'
  return h.protected ? '🟨' : '🟥'
}

/** Texto que acompanha a imagem (ou que se copia, se a imagem não der). */
function buildShareText(run: VanaTrilhaDailyRun, station: VanaTrilhaStation, origin: string): string {
  const [y, m, d] = run.run_date.split('-')
  const completed = run.status === 'completed'
  const durationMs = run.finished_at ? new Date(run.finished_at).getTime() - new Date(run.started_at).getTime() : null
  const { challenge } = shareChallenge(run)
  return [
    `🗺️ VanaTrilha — ${d}/${m}/${y}`,
    `Etapa ${station.id} · ${station.name}`,
    run.history.map(historySymbol).join(''),
    `${completed ? `🏁 ${VANATRILHA_DAILY_LENGTH}/${VANATRILHA_DAILY_LENGTH}` : `🚩 ${run.position}/${VANATRILHA_DAILY_LENGTH}`} · ${'❤️'.repeat(run.lives)}${'🤍'.repeat(Math.max(0, VANATRILHA_DAILY_LIVES - run.lives))}${durationMs !== null ? ` · ⏱️ ${formatDuration(durationMs)}` : ''}`,
    '',
    challenge,
    `Joga a etapa de hoje: ${origin}/jogos/vana-trilha`,
    `Como se joga: ${origin}/jogos/vana-trilha/como-jogar`,
  ].join('\n')
}

export default function ShareResultDialog({ run, station, rewards, playerName }: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [image, setImage] = useState<{ dataUrl: string; file: File } | null>(null)
  const [imageKey, setImageKey] = useState<string | null>(null)
  // Só no browser (evita diferenças de hidratação): o cartão monta ao abrir.
  const [host, setHost] = useState<string | null>(null)
  // A imagem só muda se o resultado mudar.
  const resultKey = `${run.id}:${run.turn}:${run.status}:${rewards?.gold ?? 0}`

  const generate = useCallback(async () => {
    const node = cardRef.current
    if (!node) return
    setGenerating(true)
    try {
      const { toPng } = await import('html-to-image')

      const imgs = node.querySelectorAll<HTMLImageElement>('img')
      await Promise.allSettled(
        Array.from(imgs).map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) return resolve()
              img.onload = () => resolve()
              img.onerror = () => resolve()
            }),
        ),
      )

      // A primeira captura às vezes sai sem fontes/imagens: tenta até 3 vezes.
      let dataUrl: string | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          dataUrl = await toPng(node, { pixelRatio: 1, cacheBust: true, backgroundColor: '#1E3A5F' })
          break
        } catch (err) {
          if (attempt === 2) throw err
          await new Promise((r) => setTimeout(r, 400))
        }
      }
      if (!dataUrl) throw new Error('Falha ao gerar a imagem')

      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], `vanatrilha-${run.run_date}.png`, { type: 'image/png' })
      setImage({ dataUrl, file })
      setImageKey(resultKey)
    } catch (err) {
      console.error('[VanaTrilha] partilha', err)
      toast.error('Não foi possível criar a imagem. Podes copiar o texto.')
    } finally {
      setGenerating(false)
    }
  }, [run.run_date, resultKey])

  function handleOpen() {
    setHost(window.location.host)
    setOpen(true)
    if (imageKey !== resultKey) {
      setImage(null)
      setGenerating(true)
      // Espera o cartão estar montado fora do ecrã antes de o capturar.
      setTimeout(generate, 60)
    }
  }

  async function shareImage() {
    if (!image) return
    const text = buildShareText(run, station, window.location.origin)
    try {
      if (navigator.canShare?.({ files: [image.file] })) {
        await navigator.share({ files: [image.file], text, title: 'VanaTrilha' })
        return
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
    }
    // Sem partilha de ficheiros (ex.: computador): descarrega e copia o texto.
    downloadImage()
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Imagem descarregada e texto copiado! Agora é só colar no grupo.')
    } catch {
      toast.success('Imagem descarregada! Agora é só enviar para o grupo.')
    }
  }

  function downloadImage() {
    if (!image) return
    const link = document.createElement('a')
    link.href = image.dataUrl
    link.download = image.file.name
    link.click()
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(buildShareText(run, station, window.location.origin))
      toast.success('Texto copiado! Cola no grupo do clube.')
    } catch {
      toast.error('Não foi possível copiar o texto.')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-600 to-yellow-500 px-4 py-3 font-black text-white shadow-lg shadow-orange-500/25 transition-all hover:brightness-105 active:scale-[0.98]"
      >
        <Share2 className="h-5 w-5" /> Desafiar os outros desbravadores
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-black">Partilhar no grupo</DialogTitle>
            <DialogDescription className="text-center">
              Mostra como correu a tua etapa e desafia os outros a fazer melhor!
            </DialogDescription>
          </DialogHeader>

          <div className="relative mx-auto aspect-[4/5] w-full max-w-xs overflow-hidden rounded-2xl border border-amber-100 bg-amber-50 shadow-inner">
            {image ? (
              <img src={image.dataUrl} alt="Imagem do resultado do VanaTrilha" className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm font-semibold text-amber-800">
                {generating ? <Loader2 className="h-8 w-8 animate-spin" /> : <ImageIcon className="h-8 w-8" />}
                {generating ? 'A preparar a imagem…' : 'Imagem indisponível'}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={shareImage}
              disabled={!image}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#1E3A5F] px-4 py-3 font-bold text-white transition-all hover:bg-[#16304f] active:scale-[0.98] disabled:opacity-50"
            >
              <Share2 className="h-5 w-5" /> Partilhar imagem
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={downloadImage}
                disabled={!image}
                className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border-2 border-amber-200 bg-white px-3 py-2 text-sm font-bold text-amber-800 transition-all hover:bg-amber-50 disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> Guardar
              </button>
              <button
                type="button"
                onClick={copyText}
                className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border-2 border-amber-200 bg-white px-3 py-2 text-sm font-bold text-amber-800 transition-all hover:bg-amber-50"
              >
                <Copy className="h-4 w-4" /> Copiar texto
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cartão fora do ecrã, só para a captura */}
      {host && (
        <div style={{ position: 'fixed', left: '-99999px', top: 0, pointerEvents: 'none' }} aria-hidden="true">
          <RunShareCard ref={cardRef} run={run} station={station} rewards={rewards} playerName={playerName} siteHost={host} />
        </div>
      )}
    </>
  )
}
