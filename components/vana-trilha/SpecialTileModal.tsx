'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VANATRILHA_MILAGRE_GOLD, type VanaTrilhaTile } from '@/types/vana-trilha'
import BibleReference from './BibleReference'

interface Props {
  tile: VanaTrilhaTile | null
  onClose: () => void
}

const CONTENT: Record<Exclude<VanaTrilhaTile, 'normal'>, {
  emoji: string
  title: string
  text: string
  verse: string
  reference: string
  className: string
  button: string
}> = {
  milagre: {
    emoji: '✨',
    title: 'Milagre!',
    text: `Ganhaste +${VANATRILHA_MILAGRE_GOLD} Gold extra. Completa a etapa para os levares contigo!`,
    verse: 'Tu és o Deus que fazes maravilhas.',
    reference: 'Salmo 77:14',
    className: 'from-yellow-300 to-amber-500',
    button: 'Boa!',
  },
  tabuas: {
    emoji: '📜',
    title: 'Tábuas da Lei',
    text: 'Vem aí uma pergunta bónus de Verdadeiro ou Falso. Se acertares, avanças mais uma casa. Se errares, não perdes nada.',
    verse: 'Duas tábuas do Testemunho, tábuas de pedra, escritas pelo dedo de Deus.',
    reference: 'Êxodo 31:18',
    className: 'from-violet-400 to-indigo-600',
    button: 'Vamos a isso',
  },
  elim: {
    emoji: '🌴',
    title: 'Fonte de Elim',
    text: 'Casa de descanso! Se errares a próxima pergunta, não perdes vida.',
    verse: 'Então vieram a Elim, e havia ali doze fontes de água e setenta palmeiras.',
    reference: 'Êxodo 15:27',
    className: 'from-teal-400 to-emerald-600',
    button: 'Continuar a viagem',
  },
}

export default function SpecialTileModal({ tile, onClose }: Props) {
  const content = tile && tile !== 'normal' ? CONTENT[tile] : null

  return (
    <Dialog open={!!content} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="overflow-hidden rounded-3xl p-0 sm:max-w-sm" showCloseButton={false}>
        {content && (
          <>
            <div className={`flex flex-col items-center bg-gradient-to-br ${content.className} px-6 pb-5 pt-7 text-white`}>
              <span className="vt-pop text-6xl drop-shadow" aria-hidden>
                {content.emoji}
              </span>
              <DialogHeader className="mt-2 items-center text-center">
                <DialogTitle className="text-2xl font-black text-white">{content.title}</DialogTitle>
              </DialogHeader>
            </div>
            <div className="space-y-4 px-6 pb-6">
              <DialogDescription className="text-center text-base font-medium text-slate-700">{content.text}</DialogDescription>
              <blockquote className="rounded-2xl bg-slate-50 px-4 py-3 text-center text-sm italic text-slate-600">
                «{content.verse}»
                <BibleReference
                  reference={content.reference}
                  className="mx-auto mt-1 block w-fit text-xs font-bold not-italic text-slate-500"
                />
              </blockquote>
              <button
                type="button"
                onClick={onClose}
                className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#1E3A5F] px-4 py-3 font-bold text-white transition-all hover:bg-[#16304f] active:scale-[0.98]"
              >
                {content.button}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
