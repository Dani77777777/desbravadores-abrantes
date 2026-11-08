'use client'

import { useMemo } from 'react'
import { Gift, MessageCircleQuestion, RotateCcw, UserMinus, Users } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  MAX_PRIZE_NAME,
  MAX_PRIZE_POINTS,
  isHelperFor,
  isLeaderFor,
  type RaffleMember,
  type RafflePrize,
  type RaffleQuestion,
} from '@/utils/raffle'
import { PersonRow, QuickButton } from './RaffleParts'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function toPoints(value: string) {
  return Math.min(MAX_PRIZE_POINTS, Math.max(0, Math.floor(Number(value) || 0)))
}

/** Sorteio entre quem respondeu à Pergunta da Semana: pergunta, prémio e quem entra. */
export function QuestionRaffleCard({
  questions,
  question,
  members,
  out,
  userId,
  prize,
  refreshing,
  onSelectQuestion,
  onPrizeChange,
  onSetOut,
  onRefresh,
}: {
  questions: RaffleQuestion[]
  question: RaffleQuestion | null
  /** Todos os membros que a pessoa pode sortear. */
  members: RaffleMember[]
  /** Quem respondeu mas está desmarcado. */
  out: Set<string>
  userId: string
  prize: RafflePrize
  refreshing: boolean
  onSelectQuestion: (id: string) => void
  onPrizeChange: (prize: RafflePrize) => void
  onSetOut: (ids: string[], isOut: boolean) => void
  onRefresh: () => void
}) {
  const respondents = useMemo(() => {
    const ids = new Set(question?.respondentIds)
    return members.filter((m) => ids.has(m.id))
  }, [members, question])
  const prizeOf = useMemo(() => new Map(question?.winners.map((w) => [w.id, w.prize])), [question])

  const inPlay = respondents.filter((m) => !out.has(m.id) && !prizeOf.has(m.id))
  const leaders = inPlay.filter((m) => isLeaderFor(m, null))
  const helpers = inPlay.filter((m) => isHelperFor(m, null))
  const unticked = respondents.filter((m) => out.has(m.id) && !prizeOf.has(m.id))

  const field = 'h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm'

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircleQuestion className="h-5 w-5 text-blue-700" /> Pergunta da Semana
          </CardTitle>
          <CardDescription>Entram os membros que responderam à pergunta escolhida. Os convidados não entram, porque não têm nome.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {question ? (
            <>
              <div className="flex gap-2">
                <select
                  value={question.id}
                  onChange={(e) => onSelectQuestion(e.target.value)}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800"
                >
                  {questions.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.open ? 'Aberta · ' : ''}
                      {q.prompt}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={refreshing}
                  title="Atualizar quem respondeu"
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RotateCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <p className="text-xs text-gray-500">
                {question.open
                  ? `Ainda está aberta até ${formatDate(question.closes_at)}: quem responder depois do sorteio já não entra nele.`
                  : `Fechou ${formatDate(question.closes_at)}.`}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">Ainda não abriu nenhuma pergunta.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="h-5 w-5 text-blue-700" /> Prémio
          </CardTitle>
          <CardDescription>Cada pessoa sorteada recebe este prémio depois de confirmares no fim do sorteio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
            {(
              [
                ['points', 'XP e Gold'],
                ['physical', 'Prémio físico'],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => onPrizeChange({ ...prize, kind })}
                className={`rounded-lg px-2 py-2 text-sm font-bold transition-colors ${
                  prize.kind === kind ? 'bg-white text-blue-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {prize.kind === 'points' ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs font-bold text-gray-600">
                XP
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_PRIZE_POINTS}
                  value={prize.xp || ''}
                  onChange={(e) => onPrizeChange({ ...prize, xp: toPoints(e.target.value) })}
                  placeholder="0"
                  className={field}
                />
              </label>
              <label className="space-y-1 text-xs font-bold text-gray-600">
                Gold
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_PRIZE_POINTS}
                  value={prize.gold || ''}
                  onChange={(e) => onPrizeChange({ ...prize, gold: toPoints(e.target.value) })}
                  placeholder="0"
                  className={field}
                />
              </label>
            </div>
          ) : (
            <label className="block space-y-1 text-xs font-bold text-gray-600">
              Qual é o prémio?
              <input
                value={prize.name}
                onChange={(e) => onPrizeChange({ ...prize, name: e.target.value })}
                maxLength={MAX_PRIZE_NAME}
                placeholder="Ex.: Caixa de chocolates"
                className={field}
              />
            </label>
          )}
        </CardContent>
      </Card>

      {question && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-blue-700" /> Quem entra no sorteio
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-black text-blue-700">{inPlay.length}</span>
            </CardTitle>
            <CardDescription>Quem sai fica desmarcado, para não voltar a sair. Podes voltar a marcá-lo aqui.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {respondents.length === 0 ? (
              <p className="rounded-xl border border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
                Ainda ninguém respondeu a esta pergunta.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <QuickButton
                    disabled={leaders.length === 0}
                    onClick={() => onSetOut(leaders.map((m) => m.id), true)}
                    icon={<UserMinus className="h-4 w-4" />}
                  >
                    Tirar dirigentes{leaders.length > 0 && ` (${leaders.length})`}
                  </QuickButton>
                  <QuickButton
                    disabled={helpers.length === 0}
                    onClick={() => onSetOut(helpers.map((m) => m.id), true)}
                    icon={<UserMinus className="h-4 w-4" />}
                  >
                    Tirar ajudantes{helpers.length > 0 && ` (${helpers.length})`}
                  </QuickButton>
                  {unticked.length > 0 && (
                    <button
                      type="button"
                      className="px-1 text-sm font-bold text-blue-700 hover:underline"
                      onClick={() => onSetOut(unticked.map((m) => m.id), false)}
                    >
                      Marcar todos
                    </button>
                  )}
                </div>
                <ul className="max-h-[26rem] divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
                  {respondents.map((m) => {
                    const won = prizeOf.get(m.id)
                    return (
                      <PersonRow
                        key={m.id}
                        member={m}
                        on={!won && !out.has(m.id)}
                        isMe={m.id === userId}
                        note={won ? `Ganhou: ${won}` : undefined}
                        disabled={!!won}
                        onToggle={() => onSetOut([m.id], !out.has(m.id))}
                      />
                    )
                  })}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
