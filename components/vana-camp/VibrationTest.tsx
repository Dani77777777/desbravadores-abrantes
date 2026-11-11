'use client'

import { useState } from 'react'
import { Vibrate, Check, X, Smartphone } from 'lucide-react'
import { isVibrationSupported, vibrate } from '@/utils/vibrate'

type Step = 'idle' | 'asked' | 'ok' | 'failed' | 'unsupported'

/**
 * "Testar vibração" no lobby do jogador: cada um confirma antes do jogo que o
 * telemóvel vibra quando for a sua vez.
 *
 * O `navigator.vibrate()` devolve true mesmo quando o Android a ignora (ex.:
 * telemóvel em silêncio), por isso não dá para detetar sozinho: perguntamos ao
 * jogador se sentiu e, se não, mostramos o que mudar.
 */
export function VibrationTest() {
  const [step, setStep] = useState<Step>('idle')

  function test() {
    if (!isVibrationSupported()) {
      setStep('unsupported')
      return
    }
    vibrate('night_call')
    setStep('asked')
  }

  return (
    <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-200 font-semibold text-sm uppercase tracking-wide">
        <Smartphone className="w-4 h-4" /> O teu telemóvel vibra?
      </div>
      <p className="text-stone-300 text-sm">
        À noite o telemóvel vibra para te acordar quando for a tua vez. Testa já para não perderes a tua vez.
      </p>

      <button
        type="button"
        onClick={test}
        className="w-full bg-amber-700 hover:bg-amber-600 active:scale-[0.98] text-white font-bold py-2.5 rounded transition flex items-center justify-center gap-2"
      >
        <Vibrate className="w-5 h-5" /> {step === 'idle' || step === 'unsupported' ? 'Testar vibração' : 'Testar outra vez'}
      </button>

      {step === 'asked' && (
        <div className="space-y-2">
          <p className="text-amber-100 text-sm text-center font-semibold">Sentiste o telemóvel a vibrar?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setStep('ok')}
              className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold py-2 rounded flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Sim
            </button>
            <button
              type="button"
              onClick={() => setStep('failed')}
              className="bg-stone-700 hover:bg-stone-600 text-stone-100 font-semibold py-2 rounded flex items-center justify-center gap-1.5"
            >
              <X className="w-4 h-4" /> Não
            </button>
          </div>
        </div>
      )}

      {step === 'ok' && (
        <p className="bg-emerald-950/50 border border-emerald-700/50 text-emerald-200 rounded p-3 text-sm">
          Tudo pronto! Durante o jogo deixa esta página aberta e o ecrã ligado. Com o ecrã bloqueado ou noutra app, o telemóvel não vibra.
        </p>
      )}

      {step === 'failed' && (
        <div className="bg-amber-950/50 border border-amber-700/50 text-amber-100 rounded p-3 text-sm space-y-1.5">
          <p className="font-semibold">Experimenta isto e volta a testar:</p>
          <ul className="list-disc pl-5 space-y-1 text-amber-100/90">
            <li>Tira o telemóvel do <strong>silêncio</strong>: põe com som ou em modo vibrar. Em silêncio, o browser não pode vibrar.</li>
            <li>Desliga o <strong>Não incomodar</strong>.</li>
            <li>Nas definições, em <strong>Sons e vibração</strong>, confirma que a vibração não está no mínimo.</li>
          </ul>
          <p className="text-amber-300/80 text-xs pt-1">
            Se mesmo assim não vibrar, não faz mal: quando for a tua vez também aparece um aviso no ecrã.
          </p>
        </div>
      )}

      {step === 'unsupported' && (
        <p className="bg-stone-900/60 border border-stone-700 text-stone-300 rounded p-3 text-sm">
          Este telemóvel não deixa os sites vibrarem (acontece nos iPhones). Não faz mal: quando for a tua vez aparece um aviso no ecrã, por isso deixa esta página aberta e o ecrã ligado.
        </p>
      )}
    </section>
  )
}
