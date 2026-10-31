'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Check,
  Eye,
  EyeOff,
  Inbox,
  Loader2,
  Lock,
  Merge,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Unlock,
  Wand2,
  X,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  autoGroupQuestion,
  clusterNewAnswers,
  clusterQuestion,
  deleteAnswerAsAdmin,
  markReady,
  mergeGroups,
  moveAnswer,
  renameGroup,
  setAnswerHidden,
  setGroupHidden,
  unfreezeBoard,
  type ReviewResult,
} from '@/lib/actions/vana-coro-review'
import { checkBoard } from '@/utils/vana-coro/board'
import { questionStatus } from '@/utils/vana-coro/schedule'
import { GROUP_SOURCE_LABELS, QUESTION_STATUS_LABELS } from '@/utils/vana-coro-labels'
import type { VanaCoroGroup, VanaCoroReviewAnswer, VanaCoroReviewData } from '@/types/vana-coro'

type Run = (key: string, action: () => Promise<ReviewResult>, success?: string) => void

interface GroupRow extends VanaCoroGroup {
  answers: VanaCoroReviewAnswer[]
  votes: number
}

export function QuestionReview({ data }: { data: VanaCoroReviewData }) {
  const { question, groups, answers, board, aiEnabled } = data
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [dragging, setDragging] = useState<string | null>(null)

  const run: Run = (key, action, success) => {
    setBusy(key)
    startTransition(async () => {
      try {
        const r = await action()
        if (r.error) toast.error(r.error)
        else if (r.message || success) toast.success(r.message ?? success)
      } catch {
        toast.error('Algo correu mal. Tenta outra vez.')
      } finally {
        setBusy(null)
      }
    })
  }

  const status = questionStatus(question)
  const isReady = status === 'ready'
  const isPlayed = status === 'played'

  const { rows, ungrouped, respondents, preview } = useMemo(() => {
    const visible = answers.filter((a) => !a.hidden)
    const rows: GroupRow[] = groups
      .map((g) => {
        const own = answers.filter((a) => a.group_id === g.id)
        return { ...g, answers: own, votes: new Set(own.filter((a) => !a.hidden).map((a) => a.person)).size }
      })
      .sort((a, b) => Number(a.hidden) - Number(b.hidden) || b.votes - a.votes || a.label.localeCompare(b.label, 'pt-PT'))
    const groupIds = new Set(groups.map((g) => g.id))
    const respondents = new Set(visible.map((a) => a.person)).size
    const preview = checkBoard(
      groups.map((g) => ({
        id: g.id,
        label: g.label,
        emoji: g.emoji,
        hidden: g.hidden,
        respondentKeys: visible.filter((a) => a.group_id === g.id).map((a) => a.person),
      })),
      respondents,
    )
    return { rows, ungrouped: answers.filter((a) => !a.group_id || !groupIds.has(a.group_id)), respondents, preview }
  }, [answers, groups])

  const rankOf = new Map(preview.entries.map((e) => [e.groupId, e]))
  const freshCount = ungrouped.filter((a) => !a.hidden).length
  const statusLabel = QUESTION_STATUS_LABELS[status]
  const isBusy = (key: string) => pending && busy === key

  function regroup(withAi: boolean) {
    const msg = withAi
      ? 'Agrupar com a IA? Os grupos automáticos e da IA são substituídos; os que mexeste à mão ficam.'
      : 'Agrupar sem IA? Os grupos automáticos e da IA são substituídos; os que mexeste à mão ficam.'
    if (groups.some((g) => g.source !== 'manual') && !window.confirm(msg)) return
    run(withAi ? 'ai' : 'auto', () => (withAi ? clusterQuestion(question.id) : autoGroupQuestion(question.id)))
  }

  function merge() {
    // O grupo com mais votos fica com o nome; os outros juntam-se a ele.
    const ordered = rows.filter((r) => selected.includes(r.id)).map((r) => r.id)
    run('merge', async () => {
      const r = await mergeGroups(question.id, ordered)
      if (!r.error) setSelected([])
      return r
    }, 'Grupos juntos')
  }

  function drop(target: string) {
    const answerId = dragging
    setDragging(null)
    if (!answerId) return
    const answer = answers.find((a) => a.id === answerId)
    if (!answer || answer.group_id === target) return
    run(`move:${answerId}`, () => moveAnswer(answerId, target))
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <section className="rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${statusLabel.cls}`}>{statusLabel.label}</span>
          <span className="text-sm text-slate-500">
            {respondents} pessoa{respondents === 1 ? '' : 's'} · {answers.length} resposta{answers.length === 1 ? '' : 's'}
            {freshCount > 0 && ` · ${freshCount} sem grupo`}
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{question.prompt}</h1>

        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton icon={Wand2} label="Agrupar sem IA" busy={isBusy('auto')} disabled={pending || answers.length === 0} onClick={() => regroup(false)} />
          <ActionButton
            icon={Sparkles}
            label="Agrupar com IA"
            primary
            busy={isBusy('ai')}
            disabled={pending || !aiEnabled || answers.length === 0}
            onClick={() => regroup(true)}
            title={aiEnabled ? undefined : 'Falta configurar VANACORO_AI_API_KEY no servidor'}
          />
          {groups.length > 0 && freshCount > 0 && (
            <ActionButton
              icon={Inbox}
              label={`Arrumar as novas (${freshCount})`}
              busy={isBusy('new')}
              disabled={pending}
              onClick={() => run('new', () => clusterNewAnswers(question.id))}
            />
          )}
        </div>
        {!aiEnabled && (
          <p className="mt-2 text-xs text-slate-500">
            A IA está desligada (falta a chave <code className="font-mono">VANACORO_AI_API_KEY</code> no servidor). O resto funciona: agrupa sem IA e ajusta à mão.
          </p>
        )}
        {isBusy('ai') && <p className="mt-2 text-xs text-fuchsia-700">A IA está a pensar… pode demorar uns segundos.</p>}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        {/* Grupos */}
        <section className="space-y-3">
          {selected.length >= 2 && (
            <div className="sticky top-20 z-10 flex items-center justify-between gap-2 rounded-xl bg-blue-950 p-3 text-white shadow-lg">
              <span className="text-sm font-semibold">{selected.length} grupos escolhidos</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setSelected([])} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white/70 hover:text-white">
                  Limpar
                </button>
                <button
                  type="button"
                  onClick={merge}
                  disabled={pending}
                  className="flex items-center gap-1.5 rounded-lg bg-yellow-400 px-3 py-1.5 text-sm font-bold text-blue-950 disabled:opacity-50"
                >
                  {isBusy('merge') ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />} Juntar
                </button>
              </div>
            </div>
          )}

          {ungrouped.length > 0 && (
            <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 p-4">
              <h2 className="text-sm font-bold text-amber-900">Sem grupo ({ungrouped.length})</h2>
              <p className="text-xs text-amber-800/80">Agrupa sem IA, com IA, ou arrasta cada uma para um grupo.</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {ungrouped.map((a) => (
                  <AnswerChip key={a.id} answer={a} groups={rows} run={run} pending={pending} onDrag={setDragging} />
                ))}
              </div>
            </div>
          )}

          {rows.length === 0 && ungrouped.length === 0 && (
            <div className="rounded-xl border bg-white p-8 text-center text-slate-400">Ainda não há respostas a esta pergunta.</div>
          )}

          {rows.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              groups={rows}
              entry={rankOf.get(g.id)}
              selected={selected.includes(g.id)}
              onSelect={(on) => setSelected((s) => (on ? [...s, g.id] : s.filter((id) => id !== g.id)))}
              onDrop={() => drop(g.id)}
              onDrag={setDragging}
              run={run}
              pending={pending}
            />
          ))}

          {dragging && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop('new')}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 p-4 text-sm font-semibold text-blue-700"
            >
              <Plus className="h-4 w-4" /> Larga aqui para um grupo novo
            </div>
          )}
        </section>

        {/* Quadro */}
        <aside className="space-y-3 lg:sticky lg:top-20">
          <section className="rounded-2xl border bg-white p-4">
            <h2 className="font-semibold text-gray-800">{isReady || isPlayed ? 'Quadro congelado' : 'Pré-visualização do quadro'}</h2>
            <p className="text-xs text-slate-500">
              {isReady || isPlayed
                ? 'Mudar os grupos agora já não mexe neste quadro.'
                : 'Top 5 grupos com 2+ pessoas; os pontos somam 100.'}
            </p>
            <ol className="mt-3 space-y-1.5">
              {(isReady || isPlayed ? board : preview.entries).map((e) => (
                <li key={e.rank} className="flex items-center gap-2 rounded-lg bg-blue-950 px-3 py-2 text-white">
                  <span className="w-4 text-xs font-bold text-white/50">{e.rank}</span>
                  <span className="text-lg leading-none">{e.emoji}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{e.label}</span>
                  <span className="text-xs text-white/60">{e.respondents}p</span>
                  <span className="w-8 rounded bg-yellow-400 text-center text-sm font-black text-blue-950">{e.points}</span>
                </li>
              ))}
            </ol>
            {!isReady && !isPlayed && preview.problems.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-amber-700">
                {preview.problems.map((p) => (
                  <li key={p}>⚠️ {p}</li>
                ))}
              </ul>
            )}

            {isReady ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (window.confirm('Descongelar? A pergunta deixa de estar pronta até a marcares outra vez.')) {
                    run('unfreeze', () => unfreezeBoard(question.id), 'Quadro descongelado')
                  }
                }}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                {isBusy('unfreeze') ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />} Descongelar
              </button>
            ) : isPlayed ? null : (
              <button
                type="button"
                disabled={pending || status !== 'review' || preview.problems.length > 0}
                onClick={() => run('ready', () => markReady(question.id))}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-purple-800 disabled:opacity-40"
              >
                {isBusy('ready') ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Marcar como pronta
              </button>
            )}
            {status !== 'review' && !isReady && !isPlayed && (
              <p className="mt-2 text-xs text-slate-500">Só dá para marcar como pronta depois de a pergunta fechar.</p>
            )}
          </section>
          <p className="px-1 text-xs text-slate-400">
            Arrasta uma resposta para outro grupo (no telemóvel, usa o menu <MoreHorizontal className="inline h-3 w-3" />). Mexer num grupo à mão
            marca-o como <strong>Manual</strong>: voltar a agrupar já não lhe toca.
          </p>
        </aside>
      </div>
    </div>
  )
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  busy,
  disabled,
  primary,
  title,
}: {
  icon: typeof Wand2
  label: string
  onClick: () => void
  busy?: boolean
  disabled?: boolean
  primary?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-40 ${
        primary ? 'bg-fuchsia-600 text-white hover:bg-fuchsia-700' : 'border bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />} {label}
    </button>
  )
}

function GroupCard({
  group,
  groups,
  entry,
  selected,
  onSelect,
  onDrop,
  onDrag,
  run,
  pending,
}: {
  group: GroupRow
  groups: GroupRow[]
  entry?: { rank: number; points: number }
  selected: boolean
  onSelect: (on: boolean) => void
  onDrop: () => void
  onDrag: (id: string | null) => void
  run: Run
  pending: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(group.label)
  const [emoji, setEmoji] = useState(group.emoji ?? '')
  const [over, setOver] = useState(false)
  const source = GROUP_SOURCE_LABELS[group.source]

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={() => {
        setOver(false)
        onDrop()
      }}
      className={`rounded-xl border bg-white p-4 transition-colors ${group.hidden ? 'opacity-60' : ''} ${
        over ? 'border-blue-400 bg-blue-50' : selected ? 'border-blue-500 ring-2 ring-blue-200' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          className="h-4 w-4 accent-blue-700"
          aria-label={`Escolher ${group.label} para juntar`}
        />
        {editing ? (
          <form
            className="flex flex-1 flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              run(`rename:${group.id}`, async () => {
                const r = await renameGroup(group.id, label, emoji)
                if (!r.error) setEditing(false)
                return r
              })
            }}
          >
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="🙂"
              className="w-14 rounded-lg border px-2 py-1 text-center text-lg"
              aria-label="Emoji"
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={40}
              autoFocus
              className="min-w-0 flex-1 rounded-lg border px-2 py-1 font-semibold"
              aria-label="Nome do grupo"
            />
            <button type="submit" disabled={pending} className="rounded-lg bg-blue-700 p-1.5 text-white disabled:opacity-40" aria-label="Guardar">
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setLabel(group.label)
                setEmoji(group.emoji ?? '')
              }}
              className="rounded-lg border p-1.5 text-slate-500"
              aria-label="Cancelar"
            >
              <X className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <>
            <span className="text-xl leading-none">{group.emoji}</span>
            <span className={`font-bold text-gray-900 ${group.hidden ? 'line-through' : ''}`}>{group.label}</span>
            <button type="button" onClick={() => setEditing(true)} className="text-slate-400 hover:text-slate-700" aria-label="Mudar nome e emoji">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${source.cls}`}>{source.label}</span>
        {entry && (
          <span className="rounded-full bg-yellow-400 px-2 py-0.5 text-[10px] font-black text-blue-950">
            #{entry.rank} · {entry.points} pts
          </span>
        )}
        <span className="ml-auto text-sm font-semibold text-slate-600">
          {group.votes} pessoa{group.votes === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(`hide:${group.id}`, () => setGroupHidden(group.id, !group.hidden))}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          title={group.hidden ? 'Mostrar grupo' : 'Esconder grupo (impróprio ou lixo)'}
        >
          {group.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {group.answers.map((a) => (
          <AnswerChip key={a.id} answer={a} groups={groups} run={run} pending={pending} onDrag={onDrag} />
        ))}
      </div>
    </div>
  )
}

function AnswerChip({
  answer,
  groups,
  run,
  pending,
  onDrag,
}: {
  answer: VanaCoroReviewAnswer
  groups: GroupRow[]
  run: Run
  pending: boolean
  onDrag: (id: string | null) => void
}) {
  const others = groups.filter((g) => g.id !== answer.group_id)
  return (
    <span
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDrag(answer.id)
      }}
      onDragEnd={() => onDrag(null)}
      className={`inline-flex cursor-grab items-center gap-0.5 rounded-full py-0.5 pl-2.5 pr-0.5 text-sm ring-1 ring-inset active:cursor-grabbing ${
        answer.hidden ? 'bg-stone-100 text-stone-400 line-through ring-stone-200' : 'bg-slate-50 text-slate-800 ring-slate-200'
      }`}
      title={`Pessoa ${answer.person.slice(1)}`}
    >
      {answer.text}
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={pending}
          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          aria-label={`Opções de "${answer.text}"`}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
          <DropdownMenuLabel>Mover para…</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => run(`move:${answer.id}`, () => moveAnswer(answer.id, 'new'))}>
            <Plus className="h-4 w-4" /> Grupo novo
          </DropdownMenuItem>
          {others.map((g) => (
            <DropdownMenuItem key={g.id} onSelect={() => run(`move:${answer.id}`, () => moveAnswer(answer.id, g.id))}>
              <span className="w-4 text-center">{g.emoji}</span> <span className="truncate">{g.label}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => run(`hide-a:${answer.id}`, () => setAnswerHidden(answer.id, !answer.hidden))}>
            {answer.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} {answer.hidden ? 'Mostrar' : 'Esconder'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-red-600 focus:text-red-700"
            onSelect={() => {
              if (window.confirm(`Apagar "${answer.text}" para sempre?`)) {
                run(`del:${answer.id}`, () => deleteAnswerAsAdmin(answer.id))
              }
            }}
          >
            <Trash2 className="h-4 w-4" /> Apagar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}
