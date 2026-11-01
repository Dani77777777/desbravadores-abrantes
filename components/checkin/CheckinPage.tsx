'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { CalendarCheck, Check, Clock, Loader2, LogIn, QrCode, UserRound, Users } from 'lucide-react'
import { checkInGuest, checkInMembers, type CheckinPerson } from '@/lib/actions/checkin'
import { CHECKIN_TOLERANCE_MIN, readStoredGuest, storeGuest, type CheckinStatus, type StoredCheckinGuest } from '@/utils/checkin'
import { EntryAvatar } from '@/components/raffle/RaffleStage'

type Props = {
  event: { id: string; title: string; start_at: string } | null
  open: boolean
  hasPass: boolean
  expired: boolean
  loggedIn: boolean
  family: CheckinPerson[]
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
}

function lateLimit(startAt: string) {
  return timeLabel(new Date(new Date(startAt).getTime() + CHECKIN_TOLERANCE_MIN * 60_000).toISOString())
}

export function CheckinPage({ event, open, hasPass, expired, loggedIn, family }: Props) {
  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-8">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-950 text-yellow-300 shadow-md">
          <CalendarCheck className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Marcar presença</p>
          <h1 className="truncate text-xl font-black text-gray-900">{event?.title ?? 'Evento'}</h1>
        </div>
      </div>

      {!event ? (
        <Notice icon={<QrCode className="h-6 w-6" />} title="Evento não encontrado">
          Este QR não corresponde a nenhum evento.
        </Notice>
      ) : !hasPass ? (
        <Notice icon={<QrCode className="h-6 w-6" />} title={expired ? 'Este QR já mudou' : 'Lê o QR no ecrã'}>
          O QR das presenças muda a cada 30 segundos. Aponta outra vez a câmara para o QR que está no ecrã.
        </Notice>
      ) : !open ? (
        <Notice icon={<Clock className="h-6 w-6" />} title="As presenças fecharam">
          Já não dá para marcar presença neste evento. Fala com um dirigente.
        </Notice>
      ) : loggedIn ? (
        <MemberCheckin eventId={event.id} startAt={event.start_at} family={family} />
      ) : (
        <GuestCheckin eventId={event.id} />
      )}
    </main>
  )
}

function Notice({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-6 text-center shadow-sm">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">{icon}</span>
      <p className="text-lg font-black text-gray-900">{title}</p>
      <p className="mt-1 text-sm text-gray-600">{children}</p>
    </div>
  )
}

function Done({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-green-200 bg-white p-6 text-center shadow-sm">
      <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg">
        <Check className="h-8 w-8" strokeWidth={3} />
      </span>
      <p className="text-xl font-black text-gray-900">{title}</p>
      <div className="mt-2 space-y-1 text-sm text-gray-600">{children}</div>
    </div>
  )
}

// ── Membros: a própria conta e a família ───────────────────────

function MemberCheckin({ eventId, startAt, family }: { eventId: string; startAt: string; family: CheckinPerson[] }) {
  const [pending, startTransition] = useTransition()
  const markable = family.filter((p) => p.canAttend && !p.status)
  // Por defeito vem marcada só a própria conta (a primeira); os familiares escolhem-se.
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(markable[0]?.id === family[0]?.id ? [family[0].id] : []))
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ marked: string[]; already: string[]; status: CheckinStatus } | null>(null)

  if (family.length === 0) {
    return (
      <Notice icon={<UserRound className="h-6 w-6" />} title="Conta sem perfil do clube">
        Esta conta não tem perfil de membro.
      </Notice>
    )
  }

  if (result) {
    return (
      <Done title={result.marked.length > 0 ? 'Presença registada!' : 'Já estava registado'}>
        {result.marked.length > 0 && <p>{result.marked.join(', ')}</p>}
        {result.already.length > 0 && <p className="text-gray-500">Já estavam marcados: {result.already.join(', ')}</p>}
        {result.marked.length > 0 && result.status === 'atrasado' && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
            Chegaste depois das {lateLimit(startAt)}, por isso ficou como <b>atrasado</b>. O dirigente pode corrigir.
          </p>
        )}
        <p className="pt-1 text-xs text-gray-400">Os dirigentes confirmam as presenças no fim do evento.</p>
      </Done>
    )
  }

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const r = await checkInMembers(eventId, [...chosen])
      if (r.error) setError(r.error)
      else setResult({ marked: r.marked ?? [], already: r.already ?? [], status: r.status ?? 'presente' })
    })
  }

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="space-y-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="flex items-center gap-2 font-black text-gray-900">
        <Users className="h-5 w-5 text-blue-900" /> {family.length > 1 ? 'Quem está aqui?' : 'Estás aqui?'}
      </p>
      <ul className="space-y-2">
        {family.map((p) => {
          const marked = !!p.status
          const disabled = marked || !p.canAttend
          const on = chosen.has(p.id)
          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggle(p.id)}
                className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                  on ? 'border-blue-900 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                } disabled:cursor-default disabled:bg-gray-50`}
              >
                <EntryAvatar entry={{ id: p.id, name: p.name, avatar: p.avatar }} className="size-10" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-gray-900">{p.name}</span>
                  {marked && (
                    <span className="text-xs font-bold text-green-700">{p.status === 'faltou' ? 'Marcado pelo dirigente' : 'Já marcado ✓'}</span>
                  )}
                  {!marked && !p.canAttend && <span className="text-xs text-gray-500">Este evento é de outra secção</span>}
                </span>
                {!disabled && (
                  <span
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2 ${
                      on ? 'border-blue-900 bg-blue-900 text-white' : 'border-gray-300'
                    }`}
                  >
                    {on && <Check className="h-4 w-4" strokeWidth={3} />}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
      {markable.length === 0 ? (
        <p className="text-center text-sm font-bold text-green-700">Está tudo marcado. 👍</p>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={pending || chosen.size === 0}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-950 text-lg font-black text-yellow-300 shadow-lg disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Marcar presença
          {chosen.size > 1 && ` (${chosen.size})`}
        </button>
      )}
    </div>
  )
}

// ── Convidados: só o nome ──────────────────────────────────────

function GuestCheckin({ eventId }: { eventId: string }) {
  const [pending, startTransition] = useTransition()
  const [mode, setMode] = useState<'choose' | 'guest'>('choose')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [stored, setStored] = useState<StoredCheckinGuest | null>(null)

  useEffect(() => {
    const g = readStoredGuest()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (g?.eventId === eventId) setStored(g)
  }, [eventId])

  if (stored) {
    return (
      <Done title={`Olá, ${stored.name}! 👋`}>
        <p>A tua presença está registada. Bem-vindo(a)!</p>
        <p className="pt-1 text-xs text-gray-400">Se fores jogar, entra neste telemóvel: o jogo já sabe quem és.</p>
      </Done>
    )
  }

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const r = await checkInGuest(eventId, name)
      if (r.error || !r.guest) {
        setError(r.error ?? 'Não foi possível registar.')
        return
      }
      const g = { eventId, guestId: r.guest.id, secret: r.guest.secret, name: r.guest.name, at: Date.now() }
      storeGuest(g)
      setStored(g)
    })
  }

  if (mode === 'choose') {
    return (
      <div className="space-y-3">
        <Link
          href={`/login?next=${encodeURIComponent(`/presenca/${eventId}`)}`}
          className="flex w-full items-center gap-4 rounded-3xl border border-gray-200 bg-white p-5 text-left shadow-sm hover:bg-gray-50"
        >
          <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-950 text-yellow-300">
            <LogIn className="h-6 w-6" />
          </span>
          <span>
            <span className="block text-lg font-black text-gray-900">Sou do clube</span>
            <span className="block text-sm text-gray-500">Entra na tua conta e marca-te (e à tua família).</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMode('guest')}
          className="flex w-full items-center gap-4 rounded-3xl border border-gray-200 bg-white p-5 text-left shadow-sm hover:bg-gray-50"
        >
          <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-yellow-400 text-blue-950">
            <UserRound className="h-6 w-6" />
          </span>
          <span>
            <span className="block text-lg font-black text-gray-900">Sou visita</span>
            <span className="block text-sm text-gray-500">Não tens conta? Escreve só o teu nome.</span>
          </span>
        </button>
      </div>
    )
  }

  return (
    <form
      className="space-y-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <label className="block">
        <span className="text-sm font-bold text-gray-800">O teu nome</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoFocus
          autoComplete="given-name"
          placeholder="Ex.: Tiago Silva"
          className="mt-1.5 h-12 w-full rounded-2xl border border-gray-200 px-4 text-base"
        />
      </label>
      <p className="text-xs text-gray-500">O nome só fica guardado até ao fim do evento, para os sorteios e as equipas.</p>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={pending || name.trim().length < 2}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-950 text-lg font-black text-yellow-300 shadow-lg disabled:opacity-40"
      >
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Registar presença
      </button>
      <button type="button" onClick={() => setMode('choose')} className="w-full text-sm font-bold text-gray-500 hover:underline">
        Voltar
      </button>
    </form>
  )
}
