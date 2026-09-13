import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { redirect } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import Link from 'next/link'
import {
  ChevronLeft, Users, Clock, Hash, Calendar, Crown, Bot, Play,
  MonitorPlay, MessageSquareQuote, Grid3X3, FlaskConical,
} from 'lucide-react'
import { WordGrid } from '@/components/vana-words/WordGrid'
import { AwardVanaWordsButton } from '@/components/vana-words/AwardVanaWordsButton'
import { WinnersShareButton } from '@/components/vana-words/WinnersShareButton'
import { TEAM_LABELS } from '@/types/vana-words'
import type { TeamId, VanaWordsPlayer, VanaWordsTurn } from '@/types/vana-words'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  lobby: { label: 'Lobby', color: 'bg-sky-100 text-sky-700' },
  team_preview: { label: 'A definir equipas', color: 'bg-indigo-100 text-indigo-700' },
  arauto_spin: { label: 'A escolher Arautos', color: 'bg-indigo-100 text-indigo-700' },
  arauto_ready: { label: 'Arautos prontos', color: 'bg-indigo-100 text-indigo-700' },
  playing: { label: 'A jogar', color: 'bg-emerald-100 text-emerald-700' },
  finished: { label: 'Terminada', color: 'bg-slate-200 text-slate-600' },
}

const END_REASON_LABELS: Record<string, string> = {
  pass: 'Passou o turno',
  neutral: 'Palavra neutra',
  opponent: 'Palavra da outra equipa',
  black: 'Palavra preta 💀',
  limit: 'Limite de tentativas',
}

export default async function VanaWordsSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const isAdmin = profile?.role === 'coordenador' || profile?.role === 'dirigente'
  if (!isAdmin) redirect('/')

  const service = createServiceClient()

  const { data: session } = await service
    .from('vanawords_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) redirect('/admin/vana-words')

  const [{ data: players }, { data: words }, { data: guesses }, { data: turns }, { data: hostProfile }] =
    await Promise.all([
      service.from('vanawords_players').select('*').eq('session_id', sessionId).order('joined_at'),
      service.from('vanawords_words').select('*').eq('session_id', sessionId).order('grid_pos'),
      service.from('vanawords_guesses').select('*').eq('session_id', sessionId),
      service.from('vanawords_turns').select('*').eq('session_id', sessionId).order('turn_order'),
      service.from('profiles').select('full_name').eq('id', session.host_id).maybeSingle(),
    ])

  const allPlayers = (players ?? []) as VanaWordsPlayer[]
  const allTurns = (turns ?? []) as VanaWordsTurn[]
  const status = STATUS_LABELS[session.status] ?? STATUS_LABELS.lobby
  const isFinished = session.status === 'finished'
  const winner = session.winner_team as TeamId | null
  const isHost = session.host_id === user.id

  const durationMin = session.ended_at && session.started_at
    ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
    : null

  const revealedCount = (words ?? []).filter((w) => w.is_revealed).length

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/admin/vana-words" className="text-gray-500 hover:text-gray-900 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${status.color}`}>
                {status.label}
              </span>
              <span className="text-xs text-gray-400 font-mono flex items-center gap-1">
                <Hash className="w-3 h-3" /> {session.code}
              </span>
              {session.is_test_session && (
                <span className="flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                  <FlaskConical className="w-3 h-3" /> TESTE
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 truncate">
              VanaWords — Sessão {session.code}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
              <Calendar className="w-3 h-3" />
              {new Date(session.created_at).toLocaleString('pt-PT', { dateStyle: 'long', timeStyle: 'short' })}
              {durationMin !== null && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {durationMin} min</span>
                </>
              )}
              {hostProfile?.full_name && (
                <>
                  <span>·</span>
                  <span>Host: {hostProfile.full_name}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Sessão ao vivo */}
        {!isFinished && (
          <div className="bg-gradient-to-r from-emerald-900 to-teal-900 rounded-2xl p-4 sm:p-5 shadow-lg border border-emerald-800/30">
            <div className="flex items-start gap-3 mb-3">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse mt-1.5 flex-shrink-0" />
              <div>
                <p className="text-white font-bold text-sm">Sessão ao vivo</p>
                <p className="text-emerald-200 text-xs">Esta sessão ainda está a decorrer.</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {isHost && (
                <Link
                  href={`/jogos/vana-words/${sessionId}/control`}
                  className="flex-1 flex items-center justify-center gap-2 bg-white text-emerald-900 font-bold text-sm py-2.5 px-4 rounded-xl hover:bg-yellow-300 transition-colors"
                >
                  <Play className="w-4 h-4" /> Voltar ao controlo
                </Link>
              )}
              <a
                href={`/jogos/vana-words/${sessionId}/present`}
                target="_blank"
                rel="noopener"
                className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold text-sm py-2.5 px-4 rounded-xl border border-white/20 transition-colors"
              >
                <MonitorPlay className="w-4 h-4" /> Abrir projetor
              </a>
            </div>
          </div>
        )}

        {/* Vencedor */}
        {isFinished && winner && (
          <div className={`rounded-2xl border p-5 ${winner === 'a' ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
            <p className="text-3xl mb-1">{winner === 'a' ? '🦁' : '🦅'}</p>
            <p className={`font-black text-lg ${winner === 'a' ? 'text-amber-800' : 'text-blue-800'}`}>
              Equipa {TEAM_LABELS[winner]} venceu!
            </p>
            <p className={`text-sm ${winner === 'a' ? 'text-amber-700/80' : 'text-blue-700/80'}`}>
              {session.win_reason === 'black_hit'
                ? 'A equipa adversária revelou a palavra preta 💀'
                : 'Encontraram todas as palavras da equipa!'}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <WinnersShareButton
                winners={allPlayers.filter((p) => p.team === winner)}
                allPlayers={allPlayers}
                team={winner}
                winReason={session.win_reason}
              />
            </div>
          </div>
        )}

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<Users className="w-5 h-5" />} label="Jogadores" value={allPlayers.length} color="blue" />
          <StatCard icon={<MessageSquareQuote className="w-5 h-5" />} label="Dicas dadas" value={allTurns.filter((t) => t.hint_word).length} color="amber" />
          <StatCard icon={<Grid3X3 className="w-5 h-5" />} label="Palavras reveladas" value={`${revealedCount} / ${(words ?? []).length}`} color="green" />
          <StatCard icon={<Hash className="w-5 h-5" />} label="Palpites" value={(guesses ?? []).length} color="indigo" />
        </div>

        {/* Atribuir pontos — só se terminada e ainda por atribuir */}
        {isFinished && winner && (
          isHost ? (
            <AwardVanaWordsButton
              sessionId={sessionId}
              alreadyAwarded={!!session.rewards_awarded}
              winnerTeam={winner}
            />
          ) : !session.rewards_awarded ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-amber-800 text-sm">
              ⚠️ Pontos ainda por atribuir — apenas o host desta sessão ({hostProfile?.full_name ?? '—'}) os pode atribuir.
            </div>
          ) : null
        )}

        {/* Equipas */}
        <section className="grid gap-4 sm:grid-cols-2">
          {(['a', 'b'] as TeamId[]).map((tid) => {
            const team = allPlayers.filter((p) => p.team === tid)
            const isWinnerTeam = isFinished && winner === tid
            return (
              <div
                key={tid}
                className={`bg-white rounded-2xl border shadow-sm p-5 ${isWinnerTeam ? (tid === 'a' ? 'border-amber-300' : 'border-blue-300') : ''}`}
              >
                <h2 className={`font-bold flex items-center gap-2 mb-3 ${tid === 'a' ? 'text-amber-700' : 'text-blue-700'}`}>
                  {tid === 'a' ? '🦁' : '🦅'} Equipa {TEAM_LABELS[tid]}
                  {isWinnerTeam && <span className="ml-auto text-base">🏆</span>}
                </h2>
                {team.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">Sem jogadores.</p>
                ) : (
                  <div className="space-y-1.5">
                    {team.map((p) => (
                      <div key={p.id} className="flex items-center gap-2.5 py-1.5 border-b last:border-0">
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${tid === 'a' ? 'bg-amber-500' : 'bg-blue-500'}`}>
                            {p.display_name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className="flex-1 text-sm font-semibold text-gray-900 truncate">{p.display_name}</span>
                        {p.is_arauto && (
                          <span className="flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold text-yellow-700">
                            <Crown className="w-3 h-3" /> Arauto
                          </span>
                        )}
                        {p.is_bot && <Bot className="w-3.5 h-3.5 text-purple-400" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </section>

        {/* Grelha final com as cores */}
        {(words ?? []).length > 0 && (
          <section className="space-y-3">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-emerald-600" /> Grelha da partida
            </h2>
            <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(168deg,#0d1533,#0a1022 58%,#0b1126)' }}>
              <WordGrid
                words={words ?? []}
                guesses={guesses ?? []}
                players={allPlayers}
                showColors
                disabled
              />
            </div>
          </section>
        )}

        {/* Detalhe por turno */}
        {allTurns.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <MessageSquareQuote className="w-4 h-4 text-blue-600" /> Detalhe por turno
            </h2>
            <div className="space-y-3">
              {allTurns.map((t, i) => {
                const teamColor = t.team === 'a' ? 'bg-amber-500' : 'bg-blue-500'
                return (
                  <div key={t.id} className="bg-white rounded-2xl border shadow-sm p-5">
                    <div className="flex items-start gap-3">
                      <span className={`w-7 h-7 rounded-full ${teamColor} text-white text-xs font-black flex items-center justify-center flex-shrink-0`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">
                          {t.team === 'a' ? '🦁' : '🦅'} Equipa {TEAM_LABELS[t.team]}
                          {t.hint_word && (
                            <span className="ml-2 text-gray-700">
                              — dica «{t.hint_word}» ×{t.hint_number}
                            </span>
                          )}
                        </p>
                        {(t.words_revealed?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {t.words_revealed.map((w, wi) => (
                              <span
                                key={wi}
                                className={`rounded-lg px-2 py-0.5 text-xs font-bold ${
                                  w.team === 'a' ? 'bg-amber-100 text-amber-800'
                                    : w.team === 'b' ? 'bg-blue-100 text-blue-800'
                                    : w.team === 'black' ? 'bg-gray-900 text-red-400'
                                    : 'bg-stone-200 text-stone-700'
                                }`}
                              >
                                {w.word}
                              </span>
                            ))}
                          </div>
                        )}
                        {t.end_reason && (
                          <p className="text-xs text-gray-400 mt-2">
                            Fim do turno: {END_REASON_LABELS[t.end_reason] ?? t.end_reason}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-green-50 text-green-700',
    indigo: 'bg-indigo-50 text-indigo-700',
  }
  return (
    <div className="bg-white rounded-2xl border shadow-sm p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-black text-gray-900 tabular-nums leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}
