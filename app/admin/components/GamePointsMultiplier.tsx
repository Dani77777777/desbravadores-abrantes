'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Clock, Zap } from 'lucide-react'
import { updateGamePointsMultiplier } from '@/lib/actions/games'
import {
  POINTS_MULTIPLIERS,
  formatMultiplier,
  multiplierStatus,
  type GameDefinition,
  type GameSetting,
} from '@/utils/games'

const DATE_FMT = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/** Valor para <input type="datetime-local">, na hora do próprio browser. */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const QUICK_WINDOWS = [
  { label: '24 horas', hours: 24 },
  { label: '3 dias', hours: 72 },
  { label: '1 semana', hours: 168 },
]

/**
 * Campanha de pontos a dobrar de um jogo de um jogador.
 * Arranca assim que é aplicada e acaba sozinha na hora marcada — ninguém
 * tem de se lembrar de a desligar.
 */
export function GamePointsMultiplier({
  game,
  setting,
  canEdit,
  onSaved,
}: {
  game: GameDefinition
  setting: GameSetting
  /** Só a coordenação altera; os restantes veem o estado. */
  canEdit: boolean
  onSaved: (next: GameSetting) => void
}) {
  const status = multiplierStatus(setting)
  const [multiplier, setMultiplier] = useState(status.state === 'active' ? status.configured : 1)
  const [endsAt, setEndsAt] = useState(() =>
    toLocalInputValue(
      status.state === 'active' && status.endsAt
        ? status.endsAt
        : new Date(Date.now() + 24 * 3600_000),
    ),
  )
  const [saving, setSaving] = useState(false)

  const save = async (nextMultiplier: number, nextEndsAt: string | null) => {
    setSaving(true)
    try {
      const res = await updateGamePointsMultiplier(game.id, {
        multiplier: nextMultiplier,
        endsAt: nextEndsAt ? new Date(nextEndsAt).toISOString() : null,
      })
      if (res.error || !res.setting) {
        toast.error(res.error || 'Não foi possível guardar.')
        return
      }
      onSaved(res.setting)
      const saved = multiplierStatus(res.setting)
      toast.success(
        saved.state === 'active' && saved.endsAt
          ? `${game.title}: pontos ×${formatMultiplier(saved.multiplier)} até ${DATE_FMT.format(saved.endsAt)}`
          : `${game.title}: pontuação normal`,
      )
    } catch {
      toast.error('Não foi possível guardar.')
    } finally {
      setSaving(false)
    }
  }

  const runningLabel =
    status.state === 'active' && status.endsAt
      ? `×${formatMultiplier(status.multiplier)} até ${DATE_FMT.format(status.endsAt)}`
      : null

  if (!canEdit) {
    return (
      <div className="border-t border-gray-200/70 pt-3">
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Zap className="h-4 w-4" />
          {runningLabel ? `Pontos ${runningLabel}` : 'Sem campanha de pontos a decorrer.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 border-t border-gray-200/70 pt-3">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
          <Zap className="h-4 w-4" /> Multiplicador de pontos
        </p>
        <p className="text-xs text-gray-500">
          Enquanto durar, cada partida deste jogo vale mais XP e Gold. Acaba sozinha na hora marcada.
        </p>
      </div>

      {runningLabel && (
        <p className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
          <Clock className="h-4 w-4 flex-shrink-0" /> A decorrer: {runningLabel}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {POINTS_MULTIPLIERS.map((value) => {
          const active = multiplier === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              disabled={saving}
              onClick={() => setMultiplier(value)}
              className={`inline-flex min-h-9 items-center rounded-xl border px-3 py-1.5 text-sm font-bold transition-colors disabled:cursor-not-allowed ${
                active
                  ? 'border-amber-500 bg-amber-500 text-white'
                  : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-600'
              }`}
            >
              {value === 1 ? 'Normal' : `×${formatMultiplier(value)}`}
            </button>
          )
        })}
      </div>

      {multiplier > 1 && (
        <div className="space-y-2">
          <label
            className="block text-xs font-bold uppercase tracking-wider text-gray-500"
            htmlFor={`mult-end-${game.id}`}
          >
            Até quando
          </label>
          <input
            id={`mult-end-${game.id}`}
            type="datetime-local"
            value={endsAt}
            disabled={saving}
            onChange={(e) => setEndsAt(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-800"
          />
          <div className="flex flex-wrap gap-2">
            {QUICK_WINDOWS.map((w) => (
              <button
                key={w.hours}
                type="button"
                disabled={saving}
                onClick={() => setEndsAt(toLocalInputValue(new Date(Date.now() + w.hours * 3600_000)))}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-bold text-gray-500 hover:border-gray-300 hover:text-gray-700"
              >
                + {w.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => save(multiplier, multiplier > 1 ? endsAt : null)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-blue-900 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-800 disabled:opacity-50"
        >
          {multiplier > 1 ? 'Aplicar campanha' : 'Voltar ao normal'}
        </button>
        {status.state === 'active' && (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setMultiplier(1)
              save(1, null)
            }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-white disabled:opacity-50"
          >
            Terminar agora
          </button>
        )}
      </div>
    </div>
  )
}
