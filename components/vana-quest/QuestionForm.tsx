'use client'

import { useId, useState } from 'react'
import { Check, Clock, Lightbulb, Zap } from 'lucide-react'

export const OPTION_COLORS: Record<string, string> = {
  A: 'bg-red-500', B: 'bg-blue-500', C: 'bg-yellow-400', D: 'bg-green-500',
}
export const OPTION_LABELS: Record<string, string> = { A: '▲', B: '●', C: '◆', D: '■' }

const OPTIONS = ['A', 'B', 'C', 'D'] as const
const TIMES = [5, 10, 20, 30, 60]
const MULTIPLIERS = [
  { value: 1, label: 'Normal' },
  { value: 2, label: 'Duplo' },
  { value: 3, label: 'Triplo' },
]

export interface QuestionFormValues {
  id?: string
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_option: string
  explanation: string | null
  time_seconds: number
  points_multiplier: number
}

interface Props {
  /** Pergunta a editar. Sem isto, o formulário começa vazio. */
  initial?: QuestionFormValues
  /** Tempo e pontos com que uma pergunta nova começa. */
  defaultTime?: number
  defaultMultiplier?: number
  submitLabel: string
  pending?: boolean
  textareaRef?: React.Ref<HTMLTextAreaElement>
  onSubmit: (formData: FormData, settings: { time: number; multiplier: number }) => void
  onCancel?: () => void
}

/**
 * Formulário de uma pergunta. A resposta certa marca-se a tocar no visto da
 * própria opção; tempo e pontos são botões (sem listas pendentes).
 * Envia os mesmos campos que as server actions addQuestion/updateQuestion.
 */
export function QuestionForm({
  initial,
  defaultTime = 20,
  defaultMultiplier = 1,
  submitLabel,
  pending,
  textareaRef,
  onSubmit,
  onCancel,
}: Props) {
  const id = useId()
  const [correct, setCorrect] = useState(initial?.correct_option ?? '')
  const [time, setTime] = useState(initial?.time_seconds ?? defaultTime)
  const [multiplier, setMultiplier] = useState(initial?.points_multiplier ?? defaultMultiplier)
  const [missingCorrect, setMissingCorrect] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return
    if (!correct) {
      setMissingCorrect(true)
      return
    }
    onSubmit(new FormData(e.currentTarget), { time, multiplier })
  }

  const labelClass = 'text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-1.5'
  const fieldClass =
    'w-full border rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none'
  const chip = (active: boolean) =>
    `min-h-11 px-1 rounded-xl border text-sm font-semibold transition-colors ${
      active
        ? 'bg-blue-900 border-blue-900 text-white'
        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
    }`

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="correct_option" value={correct} />
      <input type="hidden" name="time_seconds" value={time} />
      <input type="hidden" name="points_multiplier" value={multiplier} />

      <div>
        <label htmlFor={`${id}-text`} className={labelClass}>Pergunta</label>
        <textarea
          id={`${id}-text`}
          ref={textareaRef}
          name="question_text"
          required
          defaultValue={initial?.question_text ?? ''}
          placeholder="Escreve a pergunta"
          rows={2}
          className={fieldClass}
        />
      </div>

      <fieldset>
        <legend className={labelClass}>Respostas</legend>
        <p className={`text-xs mb-2 ${missingCorrect && !correct ? 'text-red-600 font-semibold' : 'text-gray-500'}`} role={missingCorrect && !correct ? 'alert' : undefined}>
          {missingCorrect && !correct
            ? 'Falta marcar a resposta certa: toca no visto ao lado dela.'
            : 'Toca no visto para marcar a resposta certa.'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {OPTIONS.map((opt) => {
            const isCorrect = correct === opt
            const key = `option_${opt.toLowerCase()}` as 'option_a' | 'option_b' | 'option_c' | 'option_d'
            return (
              <div
                key={opt}
                className={`flex items-center gap-1 rounded-xl border p-1.5 transition-colors focus-within:ring-2 focus-within:ring-blue-500 ${
                  isCorrect ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'
                }`}
              >
                <span
                  aria-hidden
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-black flex-shrink-0 ${OPTION_COLORS[opt]}`}
                >
                  {OPTION_LABELS[opt]}
                </span>
                <input
                  name={key}
                  required
                  defaultValue={initial?.[key] ?? ''}
                  placeholder={`Opção ${opt}`}
                  aria-label={`Opção ${opt}`}
                  className="flex-1 min-w-0 bg-transparent px-2 py-2 text-base sm:text-sm focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setCorrect(opt)}
                  aria-pressed={isCorrect}
                  aria-label={isCorrect ? `Opção ${opt} é a resposta certa` : `Marcar a opção ${opt} como certa`}
                  title={isCorrect ? 'Resposta certa' : 'Marcar como certa'}
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                    isCorrect
                      ? 'bg-green-600 border-green-600 text-white'
                      : 'border-gray-300 text-gray-400 hover:border-green-500 hover:text-green-600'
                  }`}
                >
                  <Check className="w-5 h-5" strokeWidth={3} />
                </button>
              </div>
            )
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <fieldset>
          <legend className={labelClass}><Clock className="w-3 h-3" /> Tempo para responder</legend>
          <div className="grid grid-cols-5 gap-1.5">
            {TIMES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTime(t)}
                aria-pressed={time === t}
                aria-label={`${t} segundos`}
                className={chip(time === t)}
              >
                {t}s
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className={labelClass}><Zap className="w-3 h-3" /> Pontos</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {MULTIPLIERS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMultiplier(m.value)}
                aria-pressed={multiplier === m.value}
                className={chip(multiplier === m.value)}
              >
                {m.label} <span className="opacity-70 font-medium">×{m.value}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div>
        <label htmlFor={`${id}-explanation`} className={labelClass}>
          <Lightbulb className="w-3 h-3 text-amber-500" /> Explicação
          <span className="text-gray-400 normal-case font-medium">(opcional)</span>
        </label>
        <textarea
          id={`${id}-explanation`}
          name="explanation"
          defaultValue={initial?.explanation ?? ''}
          placeholder="Porque é esta a resposta certa? Aparece no ecrã depois de todos responderem."
          rows={2}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-3 rounded-xl border font-semibold text-gray-600 hover:bg-gray-50 transition-colors text-sm"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="flex-1 bg-blue-900 text-white py-3 rounded-xl font-bold hover:bg-blue-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" /> {pending ? 'A guardar...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
