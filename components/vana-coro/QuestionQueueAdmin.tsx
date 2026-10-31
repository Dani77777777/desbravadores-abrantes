'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import {
  CalendarClock,
  Check,
  Copy,
  Loader2,
  Lock,
  Pencil,
  Play,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Square,
  Trash2,
  Undo2,
  Users,
  Zap,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import {
  closeQuestionNow,
  createQuestions,
  deleteQuestion,
  openQuestionNow,
  rotateInviteToken,
  scheduleQueueAction,
  setTurbo,
  unscheduleQuestion,
  updateQuestion,
  type ActionResult,
} from '@/lib/actions/vana-coro'
import { questionStatus, type QuestionStatus } from '@/utils/vana-coro/schedule'
import { MIN_RESPONDENTS, QUESTIONS_PER_GAME, QUESTION_STATUS_LABELS } from '@/utils/vana-coro-labels'
import type { VanaCoroQuestionWithStats, VanaCoroSettings } from '@/types/vana-coro'

interface Props {
  settings: VanaCoroSettings
  questions: VanaCoroQuestionWithStats[]
  inviteUrl: string
}

// Ordem da lista: o que está a acontecer primeiro, o arquivo no fim.
const STATUS_ORDER: Record<QuestionStatus, number> = { open: 0, scheduled: 1, queued: 2, review: 3, ready: 4, played: 5 }

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-PT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Lisbon',
  })
}

export function QuestionQueueAdmin({ settings, questions, inviteUrl }: Props) {
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  /** Corre uma action com toast de erro/sucesso. */
  function run(key: string, action: () => Promise<ActionResult & Record<string, unknown>>, success?: string | ((r: Record<string, unknown>) => string)) {
    setBusyId(key)
    startTransition(async () => {
      try {
        const result = await action()
        if (result.error) toast.error(result.error)
        else if (success) toast.success(typeof success === 'function' ? success(result) : success)
      } catch {
        toast.error('Algo correu mal. Tenta outra vez.')
      } finally {
        setBusyId(null)
      }
    })
  }

  const rows = useMemo(() => {
    const now = new Date()
    return questions
      .map((q) => ({ ...q, status: questionStatus(q, now) }))
      .sort((a, b) => {
        const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        if (byStatus) return byStatus
        if (a.status === 'scheduled' || a.status === 'open') return (a.opens_at ?? '').localeCompare(b.opens_at ?? '')
        if (a.status === 'queued') return a.created_at.localeCompare(b.created_at)
        return (b.closes_at ?? b.created_at).localeCompare(a.closes_at ?? a.created_at)
      })
  }, [questions])

  const queuedCount = rows.filter((q) => q.status === 'queued').length
  const readyCount = rows.filter((q) => q.status === 'ready').length
  const candidates = rows.filter((q) => q.status === 'review' && q.respondents >= MIN_RESPONDENTS).length

  return (
    <div className="space-y-6">
      {/* Banco */}
      <section className="rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-800">Banco de perguntas</h2>
          <p className="text-sm text-slate-500">
            Tens <strong className="text-gray-900">{readyCount}</strong> pergunta{readyCount === 1 ? '' : 's'} pronta{readyCount === 1 ? '' : 's'} · um jogo precisa de ~8–9
          </p>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-amber-400 transition-all"
            style={{ width: `${Math.min(100, (readyCount / QUESTIONS_PER_GAME) * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {candidates > 0
            ? `${candidates} pergunta${candidates === 1 ? '' : 's'} fechada${candidates === 1 ? '' : 's'} com ${MIN_RESPONDENTS}+ pessoas à espera da revisão dos grupos (chega na próxima fase).`
            : `Uma pergunta só pode ir a jogo com pelo menos ${MIN_RESPONDENTS} pessoas diferentes.`}
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <NewQuestionsForm run={run} busy={pending && busyId === 'create'} />

        {/* Ritmo */}
        <section className="space-y-4 rounded-2xl border bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-800">Ritmo</h2>
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="flex items-center gap-1.5 font-semibold text-gray-800">
                <Zap className="h-4 w-4 text-amber-500" /> Modo turbo
              </span>
              <span className="block text-sm text-slate-500">
                Para quando há um JA marcado e o banco não chega: de 3 em 3 dias, abertas 5.
              </span>
            </span>
            <Switch
              checked={settings.turbo}
              disabled={pending}
              onCheckedChange={(on) => run('turbo', () => setTurbo(on), on ? 'Modo turbo ligado' : 'Ritmo normal')}
            />
          </label>
          <p className="rounded-xl bg-stone-50 p-3 text-sm text-slate-600">
            Uma pergunta nova a cada <strong>{settings.cadence_days} dias</strong>, aberta <strong>{settings.open_days} dias</strong>,
            sempre às 18:00. O ritmo só conta para as perguntas que ainda vais agendar.
          </p>
          <button
            type="button"
            disabled={pending || queuedCount === 0}
            onClick={() =>
              run('schedule', scheduleQueueAction, (r) => `${r.scheduled} pergunta${r.scheduled === 1 ? '' : 's'} agendada${r.scheduled === 1 ? '' : 's'}`)
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-40"
          >
            {pending && busyId === 'schedule' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            Agendar fila {queuedCount > 0 && `(${queuedCount})`}
          </button>
        </section>
      </div>

      {/* Fila */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">Perguntas</h2>
        {rows.length === 0 ? (
          <div className="rounded-2xl border bg-white p-8 text-center text-slate-400">Ainda não há perguntas. Escreve as primeiras acima.</div>
        ) : (
          <div className="space-y-2">
            {rows.map((q) => (
              <QuestionRow key={q.id} q={q} run={run} pending={pending} busyId={busyId} />
            ))}
          </div>
        )}
      </section>

      <InviteLink url={inviteUrl} rotatedAt={settings.invite_rotated_at} run={run} pending={pending} />
    </div>
  )
}

type Run = (key: string, action: () => Promise<ActionResult & Record<string, unknown>>, success?: string | ((r: Record<string, unknown>) => string)) => void

function NewQuestionsForm({ run, busy }: { run: Run; busy: boolean }) {
  const [text, setText] = useState('')
  const [allowGuests, setAllowGuests] = useState(true)
  const lines = text.split('\n').filter((l) => l.trim()).length

  return (
    <section className="space-y-3 rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-800">Novas perguntas</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={'Uma por linha, ex.:\nO que nunca falta num acampamento?\nDiz uma personagem bíblica que passou fome.'}
        className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
      />
      <p className="text-xs text-slate-500">
        Evita perguntas datadas: a pergunta pode ser jogada meses depois. Perguntas abertas, com muitas respostas possíveis, dão melhores quadros.
      </p>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={allowGuests} onChange={(e) => setAllowGuests(e.target.checked)} className="h-4 w-4 accent-blue-700" />
        Convidados com o link também podem responder
      </label>
      <button
        type="button"
        disabled={busy || lines === 0}
        onClick={() =>
          run(
            'create',
            async () => {
              const r = await createQuestions(text, allowGuests)
              if (!r.error) setText('')
              return r
            },
            (r) => `${r.created} pergunta${r.created === 1 ? '' : 's'} na fila`,
          )
        }
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-fuchsia-700 disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Pôr na fila {lines > 1 && `(${lines})`}
      </button>
    </section>
  )
}

function QuestionRow({
  q,
  run,
  pending,
  busyId,
}: {
  q: VanaCoroQuestionWithStats & { status: QuestionStatus }
  run: Run
  pending: boolean
  busyId: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [prompt, setPrompt] = useState(q.prompt)
  const [allowGuests, setAllowGuests] = useState(q.allow_guests)
  const status = QUESTION_STATUS_LABELS[q.status]
  const busy = pending && busyId?.startsWith(q.id)
  const lowTurnout = q.status === 'review' && q.respondents < MIN_RESPONDENTS

  function remove() {
    run(`${q.id}:delete`, async () => {
      if (q.answers === 0) {
        if (!window.confirm('Apagar esta pergunta?')) return {}
        return deleteQuestion(q.id)
      }
      const typed = window.prompt(
        `Esta pergunta tem ${q.answers} resposta${q.answers === 1 ? '' : 's'} de ${q.respondents} pessoa${q.respondents === 1 ? '' : 's'}, que se perdem para sempre.\nEscreve APAGAR para confirmar.`,
      )
      if (typed === null) return {}
      if (typed.trim().toUpperCase() !== 'APAGAR') return { error: 'Não apagado: tinhas de escrever APAGAR.' }
      return deleteQuestion(q.id, typed)
    })
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${status.cls}`}>{status.label}</span>
        {!q.allow_guests && (
          <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1 text-[10px] font-bold uppercase text-stone-600">
            <Lock className="h-3 w-3" /> Só membros
          </span>
        )}
        {q.opens_at && (
          <span className="text-xs text-slate-500">
            {formatDate(q.opens_at)} → {formatDate(q.closes_at)}
          </span>
        )}
        <span className={`ml-auto inline-flex items-center gap-1 text-xs font-semibold ${lowTurnout ? 'text-amber-700' : 'text-slate-500'}`}>
          <Users className="h-3.5 w-3.5" />
          {q.respondents} pessoa{q.respondents === 1 ? '' : 's'} · {q.answers} resposta{q.answers === 1 ? '' : 's'}
          {q.guest_respondents > 0 && ` · ${q.guest_respondents} convidado${q.guest_respondents === 1 ? '' : 's'}`}
        </span>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={140}
            disabled={q.answers > 0}
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-blue-400 disabled:bg-stone-50 disabled:text-stone-500"
          />
          {q.answers > 0 && <p className="text-xs text-slate-500">Já tem respostas: o texto já não se pode mudar.</p>}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={allowGuests} onChange={(e) => setAllowGuests(e.target.checked)} className="h-4 w-4 accent-blue-700" />
            Convidados com o link também podem responder
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(`${q.id}:save`, async () => {
                  const r = await updateQuestion(q.id, { prompt, allow_guests: allowGuests })
                  if (!r.error) setEditing(false)
                  return r
                }, 'Guardado')
              }
              className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-40"
            >
              <Check className="h-4 w-4" /> Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setPrompt(q.prompt)
                setAllowGuests(q.allow_guests)
              }}
              className="rounded-lg border px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 font-semibold text-gray-900">{q.prompt}</p>
      )}

      {lowTurnout && (
        <p className="mt-1 text-xs text-amber-700">Só {q.respondents} pessoas: o mínimo para ir a jogo é {MIN_RESPONDENTS}.</p>
      )}

      {!editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          {q.status !== 'played' && (
            <RowButton icon={Pencil} label="Editar" onClick={() => setEditing(true)} disabled={busy} />
          )}
          {(q.status === 'queued' || q.status === 'scheduled') && (
            <RowButton
              icon={Play}
              label="Abrir já"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Abrir esta pergunta agora? Fica logo visível no Painel dos membros.')) {
                  run(`${q.id}:open`, () => openQuestionNow(q.id), 'Pergunta aberta')
                }
              }}
            />
          )}
          {q.status === 'scheduled' && (
            <RowButton icon={Undo2} label="Tirar a data" disabled={busy} onClick={() => run(`${q.id}:unschedule`, () => unscheduleQuestion(q.id), 'Voltou para a fila')} />
          )}
          {q.status === 'open' && (
            <RowButton
              icon={Square}
              label="Fechar já"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Fechar já esta pergunta? Ninguém mais poderá responder.')) {
                  run(`${q.id}:close`, () => closeQuestionNow(q.id), 'Pergunta fechada')
                }
              }}
            />
          )}
          {q.status !== 'played' && q.status !== 'ready' && (
            <RowButton icon={Trash2} label="Apagar" danger disabled={busy} onClick={remove} />
          )}
          {busy && <Loader2 className="h-4 w-4 animate-spin self-center text-slate-400" />}
        </div>
      )}
    </div>
  )
}

function RowButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: typeof Pencil
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}

function InviteLink({ url, rotatedAt, run, pending }: { url: string; rotatedAt: string; run: Run; pending: boolean }) {
  const [showQr, setShowQr] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado')
    } catch {
      toast.error('Não foi possível copiar. Seleciona o link e copia à mão.')
    }
  }

  function print() {
    const svg = qrRef.current?.querySelector('svg')?.outerHTML
    const win = window.open('', '_blank', 'width=600,height=800')
    if (!svg || !win) return
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Pergunta da Semana</title>
      <style>body{font-family:system-ui,sans-serif;text-align:center;padding:48px}h1{font-size:40px;margin:0 0 8px}p{font-size:20px;color:#444}svg{width:360px;height:360px;margin:32px auto}</style>
      </head><body><h1>Pergunta da Semana</h1><p>Aponta a câmara e responde!</p>${svg}<p style="font-size:14px">${url.replace(/</g, '&lt;')}</p>
      <script>window.onload=()=>{window.print()}</script></body></html>`)
    win.document.close()
  }

  return (
    <section className="space-y-3 rounded-2xl border bg-white p-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Link de convite</h2>
        <p className="text-sm text-slate-500">
          Um só link para o clube todo: quem o tiver responde como convidado (sem conta e sem pontos). Os membros entram com a conta.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-sm" />
        <div className="flex gap-2">
          <button type="button" onClick={copy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Copy className="h-4 w-4" /> Copiar
          </button>
          <button type="button" onClick={() => setShowQr((v) => !v)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <QrCode className="h-4 w-4" /> QR
          </button>
        </div>
      </div>
      {showQr && (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-stone-50 p-4">
          <div ref={qrRef} className="rounded-xl bg-white p-3">
            <QRCodeSVG value={url} size={200} level="M" />
          </div>
          <button type="button" onClick={print} className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-xs text-slate-500">Gerado a {formatDate(rotatedAt)}. Se o link se espalhar para fora do clube, gera um novo.</p>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm('Gerar um link novo? O atual deixa de funcionar na hora (os QR impressos também).')) {
              run('rotate', rotateInviteToken, 'Link novo gerado')
            }
          }}
          className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Gerar novo link
        </button>
      </div>
    </section>
  )
}
