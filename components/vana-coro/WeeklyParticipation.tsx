'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { BarChart3, CheckCircle2, Copy, UserX, Users } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SECTIONS, SECTION_COLORS, SECTION_LABELS, isSection } from '@/utils/ranking'
import type { ParticipationMember, WeeklyParticipation as Data } from '@/lib/actions/vana-coro-participation'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-PT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Lisbon',
  })
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

/** Quadro de quem já respondeu à Pergunta da Semana e de quem ainda falta. */
export function WeeklyParticipation({ data }: { data: Data }) {
  const { question, answered, missing, guests, totalMembers, history } = data

  if (!question) {
    return (
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-semibold text-gray-800">Quem já respondeu</h2>
        <p className="mt-1 text-sm text-slate-500">Ainda não abriu nenhuma pergunta.</p>
      </section>
    )
  }

  const rate = pct(answered.length, totalMembers)

  async function copyMissing() {
    const names = missing.map((m) => `• ${m.name}`).join('\n')
    const text = `Ainda não responderam à Pergunta da Semana (${missing.length}):\n${names}`
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Lista copiada')
    } catch {
      toast.error('Não foi possível copiar.')
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
            <Users className="h-5 w-5 text-fuchsia-600" /> Quem já respondeu
          </h2>
          <p className="mt-1 font-semibold text-gray-900">{question.prompt}</p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
            question.open ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-600'
          }`}
        >
          {question.open ? `Aberta até ${formatDate(question.closes_at)}` : `Fechou ${formatDate(question.closes_at)}`}
        </span>
      </div>

      {/* Números */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Responderam" value={answered.length} cls="text-emerald-700" />
        <Stat label="Faltam" value={missing.length} cls="text-red-600" />
        <Stat label="Participação" value={`${rate}%`} cls="text-gray-900" />
      </div>
      <div>
        <div className="h-3 overflow-hidden rounded-full bg-red-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${rate}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {answered.length} de {totalMembers} membros (desbravadores e dirigentes, sem contas de teste)
          {guests > 0 && ` · mais ${guests} convidado${guests === 1 ? '' : 's'} pelo link`}
        </p>
      </div>

      <BySection answered={answered} missing={missing} />

      {/* Listas */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-red-100 bg-red-50/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-red-700">
              <UserX className="h-4 w-4" /> Ainda não responderam ({missing.length})
            </h3>
            {missing.length > 0 && (
              <button
                type="button"
                onClick={copyMissing}
                className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                title="Copiar os nomes para mandar no grupo"
              >
                <Copy className="h-3.5 w-3.5" /> Copiar
              </button>
            )}
          </div>
          {missing.length === 0 ? (
            <p className="text-sm text-emerald-700">Toda a gente respondeu! 🎉</p>
          ) : (
            <PeopleList people={missing} />
          )}
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Já responderam ({answered.length})
          </h3>
          {answered.length === 0 ? <p className="text-sm text-slate-500">Ainda ninguém.</p> : <PeopleList people={answered} />}
        </div>
      </div>

      {history.length > 1 && <History history={history} totalMembers={totalMembers} />}
    </section>
  )
}

function Stat({ label, value, cls }: { label: string; value: number | string; cls: string }) {
  return (
    <div className="rounded-xl bg-stone-50 p-3 text-center">
      <p className={`text-2xl font-black tabular-nums ${cls}`}>{value}</p>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
    </div>
  )
}

function BySection({ answered, missing }: { answered: ParticipationMember[]; missing: ParticipationMember[] }) {
  const rows = SECTIONS.map((s) => {
    const yes = answered.filter((m) => m.section === s).length
    const total = yes + missing.filter((m) => m.section === s).length
    return { s, yes, total }
  }).filter((r) => r.total > 0)
  if (rows.length < 2) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-gray-700">Por classe</h3>
      {rows.map(({ s, yes, total }) => (
        <div key={s} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 font-semibold text-gray-700">{SECTION_LABELS[s]}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-100">
            <div className={`h-full rounded-full ${SECTION_COLORS[s]}`} style={{ width: `${pct(yes, total)}%` }} />
          </div>
          <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-500">
            {yes}/{total}
          </span>
        </div>
      ))}
    </div>
  )
}

function PeopleList({ people }: { people: ParticipationMember[] }) {
  return (
    <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
      {people.map((m) => (
        <li key={m.id} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-sm">
          <Avatar className="h-6 w-6">
            <AvatarImage src={m.avatar_url || undefined} className="object-cover" />
            <AvatarFallback className="bg-stone-200 text-[10px] font-bold text-stone-600">{m.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{m.name}</span>
          {m.is_leader && <span className="text-[10px] font-bold uppercase text-blue-700">Dirigente</span>}
          {isSection(m.section) && <span className="text-[11px] text-slate-400">{SECTION_LABELS[m.section]}</span>}
        </li>
      ))}
    </ul>
  )
}

function History({ history, totalMembers }: { history: Data['history']; totalMembers: number }) {
  const [show, setShow] = useState(false)
  const average = pct(history.reduce((sum, q) => sum + q.members, 0), history.length * totalMembers)

  return (
    <div className="border-t pt-4">
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-sm font-bold text-gray-700"
      >
        <span className="flex items-center gap-1.5">
          <BarChart3 className="h-4 w-4 text-slate-500" /> Últimas {history.length} perguntas
        </span>
        <span className="text-xs font-semibold text-slate-500">
          média {average}% · {show ? 'esconder' : 'ver'}
        </span>
      </button>
      {show && (
        <div className="mt-3 space-y-2">
          {history.map((q) => {
            const p = pct(q.members, totalMembers)
            return (
              <div key={q.id} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-gray-700" title={q.prompt}>
                    {q.open && <span className="mr-1 text-[10px] font-bold uppercase text-emerald-600">Aberta</span>}
                    {q.prompt}
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">
                    {q.members}/{totalMembers} · {p}%
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full rounded-full bg-fuchsia-500" style={{ width: `${p}%` }} />
                </div>
              </div>
            )
          })}
          <p className="text-xs text-slate-400">As percentagens contam os membros de hoje.</p>
        </div>
      )}
    </div>
  )
}
