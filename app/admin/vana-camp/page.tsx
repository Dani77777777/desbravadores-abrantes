import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Navbar } from '@/components/layout/Navbar'
import {
  ChevronLeft, Flame, History, Plus, Trophy, Users, Bot, Eye, Skull, Crown, Sparkles,
} from 'lucide-react'
import { DeleteVanaCampSessionButton } from '@/components/vana-camp/DeleteVanaCampSessionButton'

export default async function VanaCampAdminPage() {
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

  // Sessões ordenadas por mais recente, com contagem de jogadores
  const { data: sessions } = await supabase
    .from('vanacamp_sessions')
    .select('*, vanacamp_players(count)')
    .order('created_at', { ascending: false })
    .limit(50)

  // Estatísticas globais simples
  const total = sessions?.length ?? 0
  const finished = sessions?.filter((s) => s.status === 'finished').length ?? 0
  const active = sessions?.filter(
    (s) => s.status !== 'finished' && s.status !== 'cancelled',
  ).length ?? 0
  const infWins = sessions?.filter((s) => s.winner_side === 'infiltrators').length ?? 0
  const fielWins = sessions?.filter((s) => s.winner_side === 'desbravadores').length ?? 0

  function fmtDate(d: string) {
    try {
      return new Date(d).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })
    } catch { return d }
  }

  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    lobby: { label: 'No lobby', color: 'bg-stone-700/60 text-stone-200' },
    role_preview: { label: 'A preparar papéis', color: 'bg-amber-900/60 text-amber-200' },
    role_reveal: { label: 'A revelar papéis', color: 'bg-amber-900/60 text-amber-200' },
    night_infiltrators: { label: 'Noite — Infiltrados', color: 'bg-indigo-900/60 text-indigo-200' },
    night_seer: { label: 'Noite — Profeta', color: 'bg-purple-900/60 text-purple-200' },
    night_guardian: { label: 'Noite — Conselheiro', color: 'bg-sky-900/60 text-sky-200' },
    day_announce: { label: 'Manhã', color: 'bg-orange-900/60 text-orange-200' },
    day_discussion: { label: 'Assembleia', color: 'bg-amber-700/60 text-amber-100' },
    day_vote: { label: 'A votar', color: 'bg-red-900/60 text-red-200' },
    day_result: { label: 'Veredito', color: 'bg-stone-700/60 text-stone-200' },
    finished: { label: 'Terminada', color: 'bg-emerald-900/60 text-emerald-200' },
    cancelled: { label: 'Cancelada', color: 'bg-stone-800/60 text-stone-400' },
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-900 via-amber-950 to-stone-900">
      <Navbar user={user} profile={profile} />

      <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        <header className="space-y-3">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-stone-400 hover:text-amber-200 text-sm transition"
          >
            <ChevronLeft className="w-4 h-4" /> Admin
          </Link>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Flame className="w-8 h-8 text-amber-400" />
              <h1 className="text-3xl font-black text-amber-100">VanaCamp</h1>
            </div>
            <Link
              href="/jogos/vana-camp"
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-2 text-sm transition"
            >
              <Plus className="w-4 h-4" /> Criar nova partida
            </Link>
          </div>
        </header>

        {/* Stats */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <StatCard icon={History} label="Total" value={total} />
          <StatCard icon={Flame} label="A decorrer" value={active} accent="text-orange-300" />
          <StatCard icon={Trophy} label="Terminadas" value={finished} accent="text-emerald-300" />
          <StatCard icon={Skull} label="Vitórias Inf." value={infWins} accent="text-red-300" />
          <StatCard icon={Users} label="Vitórias Fiéis" value={fielWins} accent="text-amber-300" />
        </section>

        {/* Lista de sessões */}
        <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg overflow-hidden">
          <h2 className="px-4 py-3 text-amber-200 font-bold text-sm uppercase tracking-wide bg-stone-900/40 border-b border-stone-800">
            Sessões recentes ({sessions?.length ?? 0})
          </h2>
          {!sessions || sessions.length === 0 ? (
            <p className="text-stone-400 text-sm italic p-6 text-center">Sem partidas ainda.</p>
          ) : (
            <ul className="divide-y divide-stone-800">
              {sessions.map((s) => {
                const statusMeta = STATUS_LABELS[s.status] ?? { label: s.status, color: 'bg-stone-700 text-stone-200' }
                const playerCount = (s.vanacamp_players as { count: number }[] | null)?.[0]?.count ?? 0
                const isHost = s.host_id === user.id
                const targetHref = isHost && s.status !== 'finished' && s.status !== 'cancelled'
                  ? `/jogos/vana-camp/${s.id}/control`
                  : `/admin/vana-camp/${s.id}`
                return (
                  <li key={s.id} className="hover:bg-stone-900/40 transition">
                    <div className="p-4 flex items-center gap-3 flex-wrap">
                      <Link href={targetHref} className="flex-1 min-w-0 flex items-center gap-3 group">
                        <span className="font-mono font-bold text-amber-100 text-lg">{s.code}</span>
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${statusMeta.color}`}>
                          {statusMeta.label}
                        </span>
                        {s.is_test_session && (
                          <span className="text-[10px] uppercase tracking-wider bg-purple-900/60 text-purple-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                            <Bot className="w-3 h-3" /> teste
                          </span>
                        )}
                        {s.winner_side && (
                          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded inline-flex items-center gap-1 ${
                            s.winner_side === 'infiltrators' ? 'bg-red-900/60 text-red-200' : 'bg-amber-800/60 text-amber-100'
                          }`}>
                            <Trophy className="w-3 h-3" />
                            {s.winner_side === 'infiltrators' ? 'Infiltrados' : 'Desbravadores'}
                          </span>
                        )}
                        {s.rewards_awarded && (
                          <span className="text-[10px] uppercase tracking-wider bg-emerald-900/60 text-emerald-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> prémios
                          </span>
                        )}
                      </Link>
                      <span className="flex items-center gap-1 text-stone-400 text-xs">
                        <Users className="w-3 h-3" /> {playerCount}
                      </span>
                      <span className="text-stone-500 text-xs">Dia {s.day_number}</span>
                      <span className="text-stone-500 text-xs">{fmtDate(s.created_at)}</span>
                      <Link
                        href={`/admin/vana-camp/${s.id}`}
                        className="text-amber-300 hover:text-amber-100 text-xs flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" /> Detalhes
                      </Link>
                      <DeleteVanaCampSessionButton sessionId={s.id} code={s.code} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}

function StatCard({
  icon: Icon, label, value, accent = 'text-amber-200',
}: { icon: typeof Flame; label: string; value: number; accent?: string }) {
  return (
    <div className="bg-stone-800/60 border border-amber-700/40 rounded p-3">
      <div className="flex items-center gap-1.5 text-stone-400 text-xs uppercase tracking-wide">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`text-2xl font-black ${accent}`}>{value}</div>
    </div>
  )
}
