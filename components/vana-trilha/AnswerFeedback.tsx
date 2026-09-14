'use client'

import { useEffect, useRef } from 'react'
import { ArrowRight, BookOpen, HeartCrack, PartyPopper, ShieldCheck, Sparkles } from 'lucide-react'
import type { VanaTrilhaAnswerResult } from '@/types/vana-trilha'
import './VanaTrilha.css'

interface Props {
  result: VanaTrilhaAnswerResult
  onContinue: () => void
}

export default function AnswerFeedback({ result, onContinue }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Em telemóvel a explicação fica abaixo das opções: traz para o ecrã.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    buttonRef.current?.focus({ preventScroll: true })
  }, [])

  const finished = result.run.status !== 'playing'
  const isBonus = result.kind === 'bonus'

  let title: string
  let subtitle: React.ReactNode
  let tone: 'good' | 'bad' | 'neutral'

  if (result.correct) {
    tone = 'good'
    title = isBonus ? 'Muito bem! Era mesmo assim.' : 'Certo!'
    subtitle =
      result.run.status === 'completed'
        ? 'Chegaste ao fim da trilha de hoje!'
        : isBonus
          ? 'As Tábuas da Lei dão-te mais uma casa.'
          : 'O teu peão avançou uma casa.'
  } else if (isBonus) {
    tone = 'neutral'
    title = `Era ${result.correct_index === 0 ? 'Verdadeiro' : 'Falso'}.`
    subtitle = 'Não faz mal: na pergunta bónus não perdes nada.'
  } else {
    tone = 'bad'
    title = 'Não foi desta…'
    subtitle =
      result.run.status === 'failed'
        ? 'Ficaste sem vidas.'
        : result.protected_by_elim
          ? 'A Fonte de Elim protegeu-te: não perdeste vida. Vem aí outra pergunta.'
          : 'Perdeste uma vida. Vem aí outra pergunta.'
  }

  const toneClass = {
    good: 'border-emerald-200 bg-emerald-50',
    bad: 'border-rose-200 bg-rose-50',
    neutral: 'border-violet-200 bg-violet-50',
  }[tone]

  const Icon = tone === 'good' ? (result.run.status === 'completed' ? PartyPopper : Sparkles) : result.protected_by_elim ? ShieldCheck : HeartCrack
  const iconClass = tone === 'good' ? 'bg-emerald-500' : tone === 'bad' ? (result.protected_by_elim ? 'bg-teal-500' : 'bg-rose-500') : 'bg-violet-500'

  return (
    <div ref={ref} className={`vt-pop scroll-mt-24 rounded-3xl border-2 p-4 sm:p-5 ${toneClass}`} aria-live="polite">
      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-white ${iconClass}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-lg font-black text-slate-900">{title}</p>
          <p className="text-sm font-medium text-slate-700">{subtitle}</p>
        </div>
      </div>

      {(!result.correct || isBonus) && (
        <p className="mt-3 rounded-2xl bg-white/80 px-3 py-2 text-sm text-slate-700">
          {isBonus ? 'Resposta certa à pergunta: ' : 'A resposta certa era: '}
          <strong className="text-slate-900">{result.correct_answer}</strong>
        </p>
      )}

      <div className="mt-3 rounded-2xl bg-white p-3">
        <p className="text-sm leading-relaxed text-slate-700">{result.explanation}</p>
        {result.reference && (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-amber-700">
            <BookOpen className="h-3.5 w-3.5" /> {result.reference}
          </p>
        )}
      </div>

      <button
        ref={buttonRef}
        type="button"
        onClick={onContinue}
        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#1E3A5F] px-4 py-3 text-base font-bold text-white shadow-lg transition-all hover:bg-[#16304f] active:scale-[0.98]"
      >
        {finished ? 'Ver resultado' : 'Continuar'} <ArrowRight className="h-5 w-5" />
      </button>
    </div>
  )
}
