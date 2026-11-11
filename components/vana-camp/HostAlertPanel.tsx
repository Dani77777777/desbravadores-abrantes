'use client'

import { useEffect, useState } from 'react'
import { Vibrate, Users, VenetianMask, Eye, Shield, ChevronUp, ChevronDown, Smartphone } from 'lucide-react'
import { triggerVibration } from '@/lib/actions/vana-camp'
import { isVibrationSupported } from '@/utils/vibrate'
import type { VanaCampRole } from '@/types/vana-camp'

interface Props {
  sessionId: string
  /** Lista opcional de jogadores para os botões "vibrar individualmente". */
  players?: { id: string; display_name: string; is_alive: boolean }[]
}

/**
 * Painel do Narrador para alertar jogadores via vibração.
 * Aparece em todas as fases de jogo (não no lobby).
 *
 * Suporte de vibração: Android (Chrome/Firefox/Edge/Samsung). iOS não suporta.
 */
export function HostAlertPanel({ sessionId, players }: Props) {
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [hostHasVibe, setHostHasVibe] = useState(true)

  useEffect(() => {
    setHostHasVibe(isVibrationSupported())
  }, [])

  async function fire(label: string, fn: () => Promise<{ error?: string }>) {
    setBusy(true)
    setFeedback(null)
    const r = await fn()
    setBusy(false)
    setFeedback(r.error ?? `✓ ${label}`)
    setTimeout(() => setFeedback(null), 2500)
  }

  return (
    // Por cima do chat na coluna da esquerda (e do debug, em sessões de teste).
    <div className="fixed bottom-[86px] group-data-[test=true]/host:bottom-[142px] left-6 z-40 max-w-xs">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="bg-amber-700 hover:bg-amber-600 text-white rounded-full p-3 shadow-lg"
          title="Abrir painel de alerta"
        >
          <Vibrate className="w-5 h-5" />
        </button>
      ) : (
        <div className="bg-stone-950/95 border border-amber-700 rounded-lg shadow-2xl text-sm overflow-hidden backdrop-blur w-72">
          <div className="bg-amber-900/40 px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-100 font-semibold text-xs uppercase tracking-wide">
              <Smartphone className="w-4 h-4" /> Alertar jogadores
            </div>
            <button onClick={() => setOpen(false)} className="text-amber-300 hover:text-white">
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => fire('Todos vibram', () => triggerVibration(sessionId, { kind: 'all' }, 'alert'))}
                disabled={busy}
                className="bg-stone-800 hover:bg-amber-800 disabled:opacity-50 text-stone-100 text-xs px-2 py-2 rounded flex items-center justify-center gap-1.5"
              >
                <Users className="w-3.5 h-3.5" /> Todos
              </button>
              <button
                onClick={() => fire('Vivos vibram', () => triggerVibration(sessionId, { kind: 'alive' }, 'alert'))}
                disabled={busy}
                className="bg-stone-800 hover:bg-amber-800 disabled:opacity-50 text-stone-100 text-xs px-2 py-2 rounded flex items-center justify-center gap-1.5"
              >
                <Users className="w-3.5 h-3.5" /> Vivos
              </button>
            </div>

            <div className="text-stone-500 text-[10px] uppercase tracking-wider pt-1">Por papel</div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => fire('Infiltrados', () => triggerVibration(sessionId, { kind: 'role', role: 'infiltrator' }, 'night_call'))}
                disabled={busy}
                className="bg-stone-800 hover:bg-red-900 disabled:opacity-50 text-red-300 text-xs px-2 py-2 rounded flex items-center justify-center gap-1"
                title="Vibrar infiltrados"
              >
                <VenetianMask className="w-3.5 h-3.5" /> Inf
              </button>
              <button
                onClick={() => fire('Profeta', () => triggerVibration(sessionId, { kind: 'role', role: 'seer' }, 'night_call'))}
                disabled={busy}
                className="bg-stone-800 hover:bg-purple-900 disabled:opacity-50 text-purple-300 text-xs px-2 py-2 rounded flex items-center justify-center gap-1"
                title="Vibrar Profeta"
              >
                <Eye className="w-3.5 h-3.5" /> Pro
              </button>
              <button
                onClick={() => fire('Conselheiro', () => triggerVibration(sessionId, { kind: 'role', role: 'guardian' }, 'night_call'))}
                disabled={busy}
                className="bg-stone-800 hover:bg-sky-900 disabled:opacity-50 text-sky-300 text-xs px-2 py-2 rounded flex items-center justify-center gap-1"
                title="Vibrar Conselheiro"
              >
                <Shield className="w-3.5 h-3.5" /> Con
              </button>
            </div>

            {players && players.length > 0 && (
              <>
                <div className="text-stone-500 text-[10px] uppercase tracking-wider pt-1">
                  Individual
                </div>
                <div className="max-h-32 overflow-y-auto space-y-0.5 pr-1">
                  {players.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => fire(`Vibrar ${p.display_name}`, () =>
                        triggerVibration(sessionId, { kind: 'players', player_ids: [p.id] }, 'urgent')
                      )}
                      disabled={busy || !p.is_alive}
                      className="w-full text-left bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-stone-200 text-xs px-2 py-1 rounded flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{p.display_name}</span>
                      <Vibrate className="w-3 h-3 shrink-0" />
                    </button>
                  ))}
                </div>
              </>
            )}

            {feedback && (
              <div className="text-amber-300 text-xs pt-1 italic">{feedback}</div>
            )}

            {!hostHasVibe && (
              <div className="text-stone-500 text-[10px] pt-1 border-t border-stone-800">
                ⚠ iOS não suporta vibração — jogadores Android vão sentir.
              </div>
            )}
          </div>

          <button
            onClick={() => setOpen(false)}
            className="w-full bg-stone-900 hover:bg-stone-800 text-stone-500 text-[10px] py-1 flex items-center justify-center gap-1"
          >
            <ChevronUp className="w-3 h-3" /> minimizar
          </button>
        </div>
      )}
    </div>
  )
}
