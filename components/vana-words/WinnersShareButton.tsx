'use client'

import { useRef, useState } from 'react'
import { WinnersShareCard } from './WinnersShareCard'
import { Share2, Download, ImageOff } from 'lucide-react'
import { TEAM_LABELS } from '@/types/vana-words'
import { shortDisplayNames } from '@/utils/vana-words'
import type { VanaWordsPlayer, TeamId } from '@/types/vana-words'

interface Props {
  winners: VanaWordsPlayer[]
  allPlayers: VanaWordsPlayer[]
  team: TeamId
  winReason?: string | null
}

/**
 * Botão de partilha da imagem de vitória — pode ser usado tanto no HostControl
 * (durante o jogo) como na página de detalhe de sessão (gestão/admin).
 * Encapsula o WinnersShareCard off-screen e toda a lógica de captura.
 */
export function WinnersShareButton({ winners, allPlayers, team, winReason }: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [sharing, setSharing] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  async function handleShare() {
    if (sharing) return
    setSharing(true)
    setToast(null)
    try {
      const { toPng } = await import('html-to-image')
      const node = cardRef.current
      if (!node) throw new Error('Card não pronto')

      // Pré-carregar imagens para evitar falhas CORS
      const imgs = node.querySelectorAll<HTMLImageElement>('img')
      await Promise.allSettled(
        Array.from(imgs).map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) { resolve(); return }
              img.onload = () => resolve()
              img.onerror = () => resolve()
            })
        )
      )

      // Captura com retry (pode falhar na primeira tentativa com fontes web)
      let dataUrl: string | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          dataUrl = await toPng(node, {
            pixelRatio: 2,
            cacheBust: true,
            backgroundColor: '#0a1022',
            fetchRequestInit: { cache: 'no-store' },
          })
          break
        } catch (err) {
          if (attempt === 2) throw err
          await new Promise((r) => setTimeout(r, 400))
        }
      }

      if (!dataUrl) throw new Error('Falha ao gerar imagem')

      const label = TEAM_LABELS[team]
      const emoji = team === 'a' ? '🦁' : '🦅'
      const arauto = winners.find((p) => p.is_arauto)
      const shortNames = shortDisplayNames(allPlayers)
      const today = new Date().toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })
      const names = winners.map((p) => shortNames.get(p.id) ?? p.display_name)
      const namesText =
        names.length > 1
          ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
          : names[0] ?? ''
      const reason =
        winReason === 'black_hit'
          ? 'A equipa adversária revelou a palavra preta 💀'
          : 'Encontraram todas as palavras da equipa!'
      const text = `🔠 VanaWords — ${today}\n\n${emoji} A Equipa ${label} venceu! 🏆\n${reason}\n${arauto ? `👑 Arauto: ${shortNames.get(arauto.id) ?? arauto.display_name}\n` : ''}🎉 Parabéns a ${namesText}!\n\nNão jogaste? Junta-te ao próximo VanaWords e ajuda a tua equipa a brilhar! 🌟`
      const fileName = `vanawords-equipa-${label.toLowerCase()}-${Date.now()}.png`

      // Tentar Web Share API (mobile / desktop moderno)
      try {
        const res = await fetch(dataUrl)
        const blob = await res.blob()
        const file = new File([blob], fileName, { type: 'image/png' })
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `🏆 VanaWords — Equipa ${label} venceu!`, text })
          setToast({ msg: 'Partilhado!', ok: true })
          return
        }
      } catch {
        // ignora, faz download
      }

      // Fallback: download direto
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = fileName
      link.click()
      setToast({ msg: 'Imagem transferida!', ok: true })
    } catch (err) {
      console.error('[WinnersShareButton]', err)
      setToast({ msg: 'Erro ao gerar imagem. Tenta novamente.', ok: false })
    } finally {
      setSharing(false)
      setTimeout(() => setToast(null), 4000)
    }
  }

  return (
    <>
      <button
        onClick={handleShare}
        disabled={sharing}
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold text-sm shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-all"
      >
        {sharing ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            A gerar imagem…
          </span>
        ) : (
          <>
            <Share2 className="w-4 h-4" />
            Partilhar vitória
          </>
        )}
      </button>

      {toast && (
        <span
          className={`inline-flex items-center gap-1.5 text-sm font-medium rounded-lg px-3 py-1 ${
            toast.ok ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'
          }`}
        >
          {toast.ok ? <Download className="w-3.5 h-3.5" /> : <ImageOff className="w-3.5 h-3.5" />}
          {toast.msg}
        </span>
      )}

      {/* Card off-screen para captura */}
      <div
        style={{ position: 'fixed', left: '-99999px', top: 0, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <WinnersShareCard
          ref={cardRef}
          winners={winners}
          allPlayers={allPlayers}
          team={team}
          winReason={winReason}
        />
      </div>
    </>
  )
}
