'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Clock, Loader2, Send, X } from 'lucide-react'
import type { PublicQuestion } from '@/lib/perguntas/types'
import { obterConvidadoId } from './storage'

const MAX_ANSWERS = 3
const MAX_LENGTH = 40

type Mode = { kind: 'member' } | { kind: 'guest'; token: string }

interface Props {
  initialQuestions: PublicQuestion[]
  mode: Mode
}

function closesLabel(closesAt: string): string {
  const d = new Date(closesAt)
  const ms = d.getTime() - Date.now()
  const day = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Lisbon' })
  const hour = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' })
  if (ms < 60 * 60 * 1000) return 'Fecha daqui a pouco'
  if (ms < 24 * 60 * 60 * 1000) return `Fecha hoje às ${hour}`
  return `Aberta até ${day}, às ${hour}`
}

function remainingLabel(n: number): string {
  if (n <= 0) return 'Já deste as 3 respostas. Obrigado!'
  if (n === MAX_ANSWERS) return 'Podes dar até 3 respostas diferentes.'
  return n === 1 ? 'Podes dar mais 1.' : `Podes dar mais ${n}.`
}

export function QuestionBoard({ initialQuestions, mode }: Props) {
  const [questions, setQuestions] = useState(initialQuestions)
  const [guestId, setGuestId] = useState<string | null>(null)
  const [loading, setLoading] = useState(mode.kind === 'guest')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const token = mode.kind === 'guest' ? mode.token : null

  // Convidados: o id só existe no browser, por isso as próprias respostas vêm daqui.
  useEffect(() => {
    if (!token) return
    const id = obterConvidadoId()
    setGuestId(id)
    const params = new URLSearchParams({ token, guest_id: id })
    fetch(`/api/perguntas?${params}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (res.ok && Array.isArray(body.questions)) setQuestions(body.questions)
        else if (body.error) toast.error(body.error)
      })
      .catch(() => toast.error('Sem ligação. Tenta recarregar a página.'))
      .finally(() => setLoading(false))
  }, [token])

  const identity = token && guestId ? { token, guest_id: guestId } : {}

  async function submit(questionId: string) {
    const text = (drafts[questionId] ?? '').trim()
    if (!text || busy) return
    setBusy(questionId)
    try {
      const res = await fetch('/api/perguntas/resposta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: questionId, text, ...identity }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? 'Não foi possível enviar.')
        return
      }
      setQuestions((qs) =>
        qs.map((q) => (q.id === questionId ? { ...q, answers: [...q.answers, body.answer] } : q)),
      )
      setDrafts((d) => ({ ...d, [questionId]: '' }))
      toast.success(body.reward?.xp ? `Resposta enviada! +${body.reward.xp} XP` : 'Resposta enviada!')
    } catch {
      toast.error('Sem ligação. Tenta outra vez.')
    } finally {
      setBusy(null)
    }
  }

  async function remove(questionId: string, answerId: string) {
    if (busy) return
    setBusy(answerId)
    try {
      const res = await fetch('/api/perguntas/resposta', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer_id: answerId, ...identity }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? 'Não foi possível apagar.')
        return
      }
      setQuestions((qs) =>
        qs.map((q) => (q.id === questionId ? { ...q, answers: q.answers.filter((a) => a.id !== answerId) } : q)),
      )
    } catch {
      toast.error('Sem ligação. Tenta outra vez.')
    } finally {
      setBusy(null)
    }
  }

  if (questions.length === 0) {
    return (
      <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-stone-200">
        <p className="text-4xl">☕</p>
        <p className="mt-3 font-bold text-blue-950">Não há nenhuma pergunta aberta agora.</p>
        <p className="mt-1 text-sm text-stone-500">Volta daqui a uns dias: há sempre uma pergunta nova.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {questions.map((q) => {
        const remaining = MAX_ANSWERS - q.answers.length
        const draft = drafts[q.id] ?? ''
        const sending = busy === q.id
        return (
          <section key={q.id} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:p-6">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-400">
              <Clock className="h-3.5 w-3.5" /> {closesLabel(q.closes_at)}
            </p>
            <h2 className="mt-2 text-xl font-extrabold leading-snug text-blue-950 sm:text-2xl">{q.prompt}</h2>

            {q.answers.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="As tuas respostas">
                {q.answers.map((a) => (
                  <li
                    key={a.id}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-3 pr-1 text-sm font-semibold text-blue-900 ring-1 ring-inset ring-blue-100"
                  >
                    {a.text}
                    <button
                      type="button"
                      onClick={() => remove(q.id, a.id)}
                      disabled={!!busy}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-700 disabled:opacity-50"
                      aria-label={`Apagar "${a.text}"`}
                    >
                      {busy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {remaining > 0 ? (
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  submit(q.id)
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                  maxLength={MAX_LENGTH}
                  disabled={loading}
                  placeholder={q.answers.length ? 'Outra resposta…' : 'A tua resposta…'}
                  aria-label="A tua resposta"
                  enterKeyHint="send"
                  autoComplete="off"
                  className="h-12 min-w-0 flex-1 rounded-2xl border border-stone-200 bg-stone-50 px-4 text-base text-blue-950 outline-none transition-colors placeholder:text-stone-400 focus:border-blue-400 focus:bg-white disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || !!busy || loading}
                  className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-blue-700 px-4 font-bold text-white transition-colors hover:bg-blue-800 disabled:opacity-40"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  <span className="hidden sm:inline">Enviar</span>
                </button>
              </form>
            ) : null}

            <p className={`mt-3 flex items-center gap-1.5 text-sm ${remaining > 0 ? 'text-stone-500' : 'font-semibold text-emerald-700'}`}>
              {remaining <= 0 && <CheckCircle2 className="h-4 w-4" />}
              {loading ? 'A carregar…' : remainingLabel(remaining)}
            </p>
          </section>
        )
      })}
    </div>
  )
}
