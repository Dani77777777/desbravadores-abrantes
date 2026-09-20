'use client'

import Link from 'next/link'
import { HelpCircle, ExternalLink } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { HowToPlaySteps, RewardsNotes, RewardsTable, SpecialTilesList } from './how-to-play-content'

interface Props {
  variant?: 'button' | 'icon'
}

export default function VanaTrilhaHowToPlay({ variant = 'button' }: Props) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {variant === 'button' ? (
          <button
            type="button"
            className="flex min-h-11 items-center gap-2 rounded-full border border-amber-200 bg-white px-4 py-2 font-bold text-slate-700 shadow-sm transition-colors hover:bg-amber-50"
          >
            <HelpCircle size={20} />
            Como Jogar
          </button>
        ) : (
          <button
            type="button"
            className="rounded-full bg-amber-100 p-2 text-amber-700 transition-colors hover:bg-amber-200"
            title="Como Jogar"
            aria-label="Como Jogar"
          >
            <HelpCircle size={20} />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-black text-slate-800">Como Jogar o VanaTrilha</DialogTitle>
          <DialogDescription className="text-center">
            Responde a perguntas da Bíblia e leva o teu peão do Egito até à Terra Prometida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <HowToPlaySteps compact />

          <section className="space-y-2">
            <h3 className="font-black text-slate-800">As casas especiais</h3>
            <SpecialTilesList compact />
          </section>

          <section className="space-y-2">
            <h3 className="font-black text-slate-800">O que ganhas</h3>
            <RewardsTable />
            <RewardsNotes />
          </section>

          <Link
            href="/jogos/vana-trilha/como-jogar"
            className="flex items-center justify-center gap-2 text-sm font-bold text-amber-700 hover:underline"
          >
            Ver a explicação completa <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  )
}
