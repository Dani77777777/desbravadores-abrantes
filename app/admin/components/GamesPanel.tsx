'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Check, ChevronRight, ExternalLink, EyeOff, Gamepad2, Info, Lock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { updateGameSetting } from '@/lib/actions/games'
import { GamePointsMultiplier } from './GamePointsMultiplier'
import {
  GAMES,
  GAME_ROLES,
  GAME_ROLE_LABELS,
  gameAvailabilitySummary,
  isOpenToEveryone,
  type GameAvailabilityTone,
  type GameRole,
  type GameSetting,
} from '@/utils/games'

const TONE_CLASSES: Record<GameAvailabilityTone, string> = {
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-700',
}

export function GamesPanel({
  initialSettings,
  canEdit,
  isCoordenador,
}: {
  initialSettings: Record<string, GameSetting>
  /** Só a coordenação altera a disponibilidade. */
  canEdit: boolean
  /** Algumas páginas de gestão são exclusivas da coordenação. */
  isCoordenador: boolean
}) {
  const [settings, setSettings] = useState(initialSettings)
  const [saving, setSaving] = useState<string | null>(null)

  const games = GAMES.filter((g) => !g.adminCoordOnly || isCoordenador)

  const save = async (gameId: string, next: GameSetting) => {
    const previous = settings[gameId]
    setSettings((s) => ({ ...s, [gameId]: next }))
    setSaving(gameId)
    try {
      const res = await updateGameSetting(gameId, {
        enabled: next.enabled,
        allowed_roles: next.allowed_roles,
        hidden: next.hidden,
      })
      if (res.error || !res.setting) {
        setSettings((s) => ({ ...s, [gameId]: previous }))
        toast.error(res.error || 'Não foi possível guardar.')
        return
      }
      setSettings((s) => ({ ...s, [gameId]: res.setting! }))
      const title = GAMES.find((g) => g.id === gameId)?.title ?? gameId
      const summary = gameAvailabilitySummary(res.setting)
      toast.success(`${title}: ${summary.label}${summary.hidden ? ' (escondido)' : ''}`)
    } catch {
      setSettings((s) => ({ ...s, [gameId]: previous }))
      toast.error('Não foi possível guardar.')
    } finally {
      setSaving(null)
    }
  }

  const toggleRole = (gameId: string, role: GameRole) => {
    const current = settings[gameId]
    const has = current.allowed_roles.includes(role)
    const allowed_roles = has ? current.allowed_roles.filter((r) => r !== role) : [...current.allowed_roles, role]
    if (allowed_roles.length === 0) {
      toast.error('Tem de ficar pelo menos um grupo. Para bloquear todos, desativa o jogo.')
      return
    }
    save(gameId, { ...current, allowed_roles })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-blue-700" /> Jogos
          </CardTitle>
          <CardDescription>
            Gere cada jogo e escolhe quem pode jogar. Quem não pode jogar vê o jogo marcado como
            &quot;Indisponível&quot; no Centro de Jogos e na página inicial — ou nem o vê, se o esconderes (ideal para
            preparar surpresas).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="flex items-start gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              Visitantes sem conta seguem a regra dos desbravadores e os ajudantes contam como o cargo que ajudam. As
              páginas de gestão continuam sempre acessíveis.
            </span>
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {games.map((game) => {
          const setting = settings[game.id]
          const summary = gameAvailabilitySummary(setting)
          const isSaving = saving === game.id

          return (
            <div key={game.id} className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center gap-4 p-5">
                <div
                  className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${game.color} ${
                    setting.enabled ? '' : 'grayscale'
                  }`}
                >
                  <div className="rounded-xl bg-white p-1.5 shadow">
                    <img src={game.image} alt="" className="h-9 w-9 object-contain" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold text-gray-900">{game.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TONE_CLASSES[summary.tone]}`}>
                      {summary.label}
                    </span>
                    {summary.hidden && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                        <EyeOff className="h-3 w-3" /> Escondido
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-sm text-gray-500">{game.description}</p>
                </div>
              </div>

              <div className="space-y-3 border-t border-gray-100 bg-gray-50/60 px-5 py-4">
                {canEdit ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor={`game-enabled-${game.id}`} className="text-sm font-bold text-gray-800">
                        {setting.enabled ? 'Jogo ativo' : 'Jogo desativado para todos'}
                      </label>
                      <Switch
                        id={`game-enabled-${game.id}`}
                        checked={setting.enabled}
                        disabled={isSaving}
                        onCheckedChange={(enabled) => save(game.id, { ...setting, enabled })}
                      />
                    </div>

                    <div className={setting.enabled ? '' : 'pointer-events-none opacity-40'}>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Quem pode jogar</p>
                      <div className="flex flex-wrap gap-2">
                        {GAME_ROLES.map((role) => {
                          const active = setting.allowed_roles.includes(role)
                          return (
                            <button
                              key={role}
                              type="button"
                              aria-pressed={active}
                              disabled={isSaving || !setting.enabled}
                              onClick={() => toggleRole(game.id, role)}
                              className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold transition-colors disabled:cursor-not-allowed ${
                                active
                                  ? 'border-blue-700 bg-blue-900 text-white'
                                  : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-600'
                              }`}
                            >
                              {active && <Check className="h-3.5 w-3.5" />}
                              {GAME_ROLE_LABELS[role]}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-gray-200/70 pt-3">
                      <label htmlFor={`game-hidden-${game.id}`} className={`min-w-0 ${isOpenToEveryone(setting) ? 'opacity-40' : ''}`}>
                        <span className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
                          <EyeOff className="h-4 w-4" /> Esconder de quem não pode jogar
                        </span>
                        <span className="block text-xs text-gray-500">
                          {isOpenToEveryone(setting)
                            ? 'Só faz sentido quando o jogo não está aberto a todos.'
                            : setting.hidden
                              ? 'Não aparece nos jogos nem na página inicial; o link direto dá página não encontrada.'
                              : 'Em vez de aparecer como "Indisponível", o jogo desaparece.'}
                        </span>
                      </label>
                      <Switch
                        id={`game-hidden-${game.id}`}
                        checked={setting.hidden && !isOpenToEveryone(setting)}
                        disabled={isSaving || isOpenToEveryone(setting)}
                        onCheckedChange={(hidden) => save(game.id, { ...setting, hidden })}
                      />
                    </div>
                  </>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-gray-500">
                    <Lock className="h-4 w-4" /> Só a coordenação altera a disponibilidade.
                  </p>
                )}

                {/* Nos jogos ao vivo quem paga é o anfitrião, no fim da sessão. */}
                {game.singlePlayer && (
                  <GamePointsMultiplier
                    game={game}
                    setting={setting}
                    canEdit={canEdit}
                    onSaved={(next) => setSettings((s) => ({ ...s, [game.id]: next }))}
                  />
                )}
              </div>

              <div className="mt-auto flex gap-2 border-t border-gray-100 p-3">
                {/* Jogos sem nada a gerir (ex.: VanaCódigo) não têm página de gestão. */}
                {game.adminHref && (
                  <Link
                    href={game.adminHref}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-800"
                  >
                    Gerir {game.title} <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
                <Link
                  href={game.href}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-50 ${
                    game.adminHref ? '' : 'flex-1'
                  }`}
                >
                  Abrir <ExternalLink className="h-4 w-4" />
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
