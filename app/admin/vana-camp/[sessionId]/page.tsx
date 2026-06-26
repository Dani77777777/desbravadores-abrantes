import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Navbar } from '@/components/layout/Navbar'
import {
  ChevronLeft, Flame, VenetianMask, Eye, Shield, User, Crown, Bot, Trophy, Clock, Sparkles,
} from 'lucide-react'
import type {
  VanaCampRole,
  VanaCampChatMode,
  VanaCampMayorMode,
  VanaCampRoleAssignmentMode,
} from '@/types/vana-camp'
import {
  statusLabel,
  causeLabel,
  CHAT_MODE_LABEL,
  MAYOR_MODE_LABEL,
  ASSIGN_MODE_LABEL,
} from '@/utils/vana-camp-labels'

const ROLE_META: Record<VanaCampRole, { label: string; icon: typeof User; color: string }> = {
  infiltrator: { label: 'Infiltrado', icon: VenetianMask, color: 'text-red-300' },
  seer: { label: 'Profeta', icon: Eye, color: 'text-purple-300' },
  guardian: { label: 'Conselheiro', icon: Shield, color: 'text-sky-300' },
  villager: { label: 'Desbravador', icon: User, color: 'text-amber-200' },
}

export default async function VanaCampSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  const isAdmin = profile?.role === 'coordenador' || profile?.role === 'dirigente'
  if (!isAdmin) redirect('/')

  const service = createServiceClient()

  const { data: session } = await service
    .from('vanacamp_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) notFound()

  const { data: hostProfile } = session.host_id
    ? await service.from('profiles').select('full_name').eq('id', session.host_id).single()
    : { data: null }

  const { data: players } = await service
    .from('vanacamp_players')
    .select('*')
    .eq('session_id', sessionId)
    .order('joined_at', { ascending: true })

  const { data: events } = await service
    .from('vanacamp_events')
    .select('*')
    .eq('session_id', sessionId)
    .neq('event_type', 'vibrate')
    .order('created_at', { ascending: true })
    .limit(200)

  function fmt(d: string | null) {
    if (!d) return '—'
    try { return new Date(d).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) }
    catch { return d }
  }
  function timeOnly(d: string) {
    try { return new Date(d).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
    catch { return d }
  }

  type EventRow = NonNullable<typeof events>[number]
  function describeEvent(e: EventRow): { label: string; tone: string } {
    const payload = e.payload as Record<string, unknown> | null
    switch (e.event_type) {
      case 'phase_change':
        return { label: `Fase: ${statusLabel(payload?.from as string)} → ${statusLabel(payload?.to as string)}`, tone: 'text-stone-300' }
      case 'death': {
        const name = (payload?.target_name as string) ?? '?'
        const cause = (payload?.cause as string) ?? '?'
        return { label: `${name} foi para casa (${causeLabel(cause)})`, tone: 'text-red-300' }
      }
      case 'save':
        return { label: 'Conselheiro protegeu um desbravador', tone: 'text-sky-300' }
      case 'night_resolved':
        return { label: 'Noite resolveu (ninguém foi para casa)', tone: 'text-stone-400' }
      case 'vote_tally': {
        const elim = payload?.eliminated as { name?: string } | null
        const tie = payload?.mayor_tiebreak_used
        if (elim?.name) return { label: `Votação: ${elim.name} foi para casa${tie ? ' (desempate do Diretor)' : ''}`, tone: 'text-orange-300' }
        return { label: 'Votação: ninguém foi para casa (empate)', tone: 'text-stone-400' }
      }
      case 'win':
        return { label: `Vitória dos ${payload?.side === 'infiltrators' ? 'Infiltrados' : 'Desbravadores'}`, tone: 'text-amber-300' }
      default:
        return { label: e.event_type, tone: 'text-stone-400' }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-900 via-amber-950 to-stone-900">
      <Navbar user={user} profile={profile} />

      <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <header>
          <Link href="/admin/vana-camp" className="inline-flex items-center gap-1 text-stone-400 hover:text-amber-200 text-sm transition">
            <ChevronLeft className="w-4 h-4" /> VanaCamp
          </Link>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <Flame className="w-6 h-6 text-amber-400" />
            <span className="font-mono font-black text-3xl text-amber-100 tracking-widest">{session.code}</span>
            {session.is_test_session && (
              <span className="text-[10px] uppercase tracking-wider bg-purple-900/60 text-purple-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                <Bot className="w-3 h-3" /> teste
              </span>
            )}
            {session.winner_side && (
              <span className={`text-xs uppercase tracking-wider px-2 py-1 rounded inline-flex items-center gap-1 font-bold ${
                session.winner_side === 'infiltrators' ? 'bg-red-900/60 text-red-200' : 'bg-amber-800/60 text-amber-100'
              }`}>
                <Trophy className="w-3.5 h-3.5" />
                Vitória dos {session.winner_side === 'infiltrators' ? 'Infiltrados' : 'Desbravadores'}
              </span>
            )}
          </div>
        </header>

        {/* Meta */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <Card label="Estado" value={statusLabel(session.status)} />
          <Card label="Dia" value={`${session.day_number}`} />
          <Card label="Narrador" value={hostProfile?.full_name ?? '?'} />
          <Card label="Criada" value={fmt(session.created_at)} />
          <Card label="Modo chat" value={CHAT_MODE_LABEL[session.chat_mode as VanaCampChatMode] ?? session.chat_mode} />
          <Card label="Diretor" value={MAYOR_MODE_LABEL[session.mayor_mode as VanaCampMayorMode] ?? session.mayor_mode} />
          <Card label="Atribuição" value={ASSIGN_MODE_LABEL[session.role_assignment_mode as VanaCampRoleAssignmentMode] ?? session.role_assignment_mode} />
          <Card label="Prémios" value={session.rewards_awarded ? '✓ atribuídos' : '—'} accent={session.rewards_awarded ? 'text-emerald-300' : 'text-stone-300'} />
        </section>

        {/* Jogadores com papéis revelados */}
        <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg overflow-hidden">
          <h2 className="px-4 py-3 text-amber-200 font-bold text-sm uppercase tracking-wide bg-stone-900/40 border-b border-stone-800">
            Jogadores ({players?.length ?? 0})
          </h2>
          <ul className="divide-y divide-stone-800">
            {(players ?? []).map((p) => {
              const role = p.role as VanaCampRole | null
              const meta = role ? ROLE_META[role] : null
              const Icon = meta?.icon ?? User
              return (
                <li key={p.id} className={`p-3 flex items-center gap-3 ${!p.is_alive ? 'opacity-60' : ''}`}>
                  {p.is_bot
                    ? <Bot className="w-4 h-4 text-purple-300 shrink-0" />
                    : <User className="w-4 h-4 text-stone-400 shrink-0" />}
                  <span className="text-stone-100 flex-1 truncate">{p.display_name}</span>
                  {p.is_mayor && <Crown className="w-4 h-4 text-amber-300" />}
                  {meta && (
                    <span className={`flex items-center gap-1 font-semibold text-sm ${meta.color}`}>
                      <Icon className="w-4 h-4" /> {meta.label}
                    </span>
                  )}
                  {!p.is_alive && (
                    <span className="text-stone-500 text-xs">
                      ✗ dia {p.eliminated_on_day} ({causeLabel(p.eliminated_by)})
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        {/* Timeline de eventos */}
        <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg overflow-hidden">
          <h2 className="px-4 py-3 text-amber-200 font-bold text-sm uppercase tracking-wide bg-stone-900/40 border-b border-stone-800 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Linha do tempo ({events?.length ?? 0})
          </h2>
          {!events || events.length === 0 ? (
            <p className="text-stone-400 text-sm italic p-4">Sem eventos.</p>
          ) : (
            <ol className="divide-y divide-stone-800 max-h-[480px] overflow-y-auto">
              {events.map((e) => {
                const d = describeEvent(e)
                return (
                  <li key={e.id} className="px-4 py-2 flex items-center gap-3 text-sm">
                    <span className="text-stone-500 font-mono text-xs">{timeOnly(e.created_at)}</span>
                    <span className="text-stone-500 text-xs">d{e.day_number}</span>
                    <span className={d.tone}>{d.label}</span>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        {/* Quick links */}
        <section className="flex flex-wrap gap-2">
          {session.status !== 'finished' && session.status !== 'cancelled' && (
            <Link
              href={`/jogos/vana-camp/${session.id}/control`}
              className="bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold px-4 py-2 rounded inline-flex items-center gap-2"
            >
              <Flame className="w-4 h-4" /> Painel do Narrador
            </Link>
          )}
          <Link
            href={`/jogos/vana-camp/${session.id}/present`}
            target="_blank"
            className="bg-stone-800 hover:bg-stone-700 text-amber-100 text-sm font-bold px-4 py-2 rounded inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" /> Abrir apresentação
          </Link>
        </section>
      </main>
    </div>
  )
}

function Card({ label, value, accent = 'text-amber-100' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-stone-900/60 border border-stone-700 rounded p-3">
      <div className="text-stone-400 text-xs uppercase tracking-wide">{label}</div>
      <div className={`${accent} font-semibold truncate`}>{value}</div>
    </div>
  )
}
