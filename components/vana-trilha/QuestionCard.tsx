'use client'

import { Check, Loader2, X } from 'lucide-react'
import { CATEGORY_EMOJI, CATEGORY_LABEL, DIFFICULTY_BADGE_CLASS, DIFFICULTY_LABEL } from '@/utils/vana-trilha-labels'
import type { VanaTrilhaStep } from '@/types/vana-trilha'
import './VanaTrilha.css'

interface Props {
  step: VanaTrilhaStep
  /** Ex.: "Casa 3 de 8". */
  label: string
  onAnswer: (index: number) => void
  /** Índice escolhido enquanto se espera pelo servidor ou já revelado. */
  chosen: number | null
  submitting: boolean
  /** Depois de responder: qual era a opção certa (na ordem mostrada). */
  revealedCorrect: number | null
  shakeKey?: number
}

const LETTERS = ['A', 'B', 'C', 'D']

export default function QuestionCard({ step, label, onAnswer, chosen, submitting, revealedCorrect, shakeKey }: Props) {
  const revealed = revealedCorrect !== null
  const locked = submitting || revealed

  const isBonus = step.kind === 'bonus'
  const prompt = isBonus ? step.bonus.prompt : step.question.prompt
  const category = isBonus ? step.bonus.category : step.question.category
  const options = isBonus ? ['Verdadeiro', 'Falso'] : step.question.options

  function optionClass(i: number) {
    if (revealed) {
      if (i === revealedCorrect) return 'border-emerald-500 bg-emerald-50 text-emerald-900'
      if (i === chosen) return 'border-rose-500 bg-rose-50 text-rose-900'
      return 'border-slate-200 bg-white text-slate-400 opacity-70'
    }
    if (i === chosen) return 'border-amber-500 bg-amber-50 text-amber-900'
    return 'border-slate-200 bg-white text-slate-800 hover:border-amber-400 hover:bg-amber-50/60 active:scale-[0.98]'
  }

  return (
    <div
      key={shakeKey}
      className={`rounded-3xl border bg-white p-4 shadow-sm sm:p-6 ${shakeKey ? 'vt-shake' : ''} ${
        isBonus ? 'border-violet-200 ring-2 ring-violet-100' : 'border-amber-100'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold">
        {isBonus ? (
          <span className="rounded-full bg-violet-100 px-2.5 py-1 text-violet-700">📜 Pergunta bónus · Tábuas da Lei</span>
        ) : (
          <>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{label}</span>
            <span className={`rounded-full px-2.5 py-1 ${DIFFICULTY_BADGE_CLASS[step.question.difficulty]}`}>
              {DIFFICULTY_LABEL[step.question.difficulty]}
            </span>
          </>
        )}
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
          {CATEGORY_EMOJI[category]} {CATEGORY_LABEL[category]}
        </span>
      </div>

      <h2 className="text-lg font-black leading-snug text-slate-900 sm:text-xl">{prompt}</h2>

      {isBonus && (
        <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50 p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-violet-600">Resposta proposta</p>
          <p className="text-base font-bold text-violet-900">{step.bonus.proposed_answer}</p>
          <p className="mt-1 text-sm text-violet-700">Esta resposta está certa?</p>
        </div>
      )}

      <div className={`mt-4 grid gap-2.5 ${isBonus ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {options.map((text, i) => (
          <button
            key={`${i}-${text}`}
            type="button"
            disabled={locked}
            onClick={() => onAnswer(i)}
            className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left text-base font-semibold transition-all disabled:cursor-default ${optionClass(i)}`}
            aria-pressed={chosen === i}
          >
            <span
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-sm font-black ${
                revealed && i === revealedCorrect
                  ? 'bg-emerald-500 text-white'
                  : revealed && i === chosen
                    ? 'bg-rose-500 text-white'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {revealed && i === revealedCorrect ? (
                <Check className="h-4 w-4" />
              ) : revealed && i === chosen ? (
                <X className="h-4 w-4" />
              ) : submitting && i === chosen ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isBonus ? (
                i === 0 ? 'V' : 'F'
              ) : (
                LETTERS[i]
              )}
            </span>
            <span className="min-w-0 flex-1">{text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
