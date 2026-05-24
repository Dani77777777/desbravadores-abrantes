import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import Link from 'next/link'
import {
  ChevronLeft, Users, Trophy, Clock, Flame, CheckCircle2, Hash,
  Calendar, Zap, Award, Play, MonitorPlay, UserPlus
} from 'lucide-react'
import { PlayerAvatar } from '@/components/vana-quest/PlayerAvatar'
import { DeleteSessionButton } from '@/components/vana-quest/DeleteSessionButton'
import { AwardSessionButton } from '@/components/vana-quest/AwardSessionButton'

const OPTION_COLORS: Record<string, string> = {
  A: 'bg-red-500', B: 'bg-blue-500', C: 'bg-yellow-400', D: 'bg-green-500',
}
const OPTION_LABELS: Record<string, string> = { A: '▲', B: '●', C: '◆', D: '■' }

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  waiting: { label: 'Em sala de espera', color: 'bg-purple-100 text-purple-700' },
  question_intro: { label: 'A decorrer', color: 'bg-blue-100 text-blue-700' },
  question_active: { label: 'A decorrer', color: 'bg-blue-100 text-blue-700' },
  question_results: { label: 'A decorrer', color: 'bg-blue-100 text-blue-700' },
  question_leaderboard: { label: 'A decorrer', color: 'bg-blue-100 text-blue-700' },
  finished: { label: 'Terminada', color: 'bg-green-100 text-green-700' },
}

export default async function SessionDetailPage({
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

  const { data: session } = await supabase
    .from('vana_quest_sessions')
    .select('*, vana_quests(title, description), host:host_id(full_name)')
    .eq('id', sessionId)
    .single()

  if (!session) redirect('/admin/vana-quest')

  const { data: questions } = await supabase
    .from('vana_quest_questions')
    .select('*')
    .eq('vana_quest_id', session.vana_quest_id)
    .order('question_order')

  const { data: participants } = await supabase
    .from('vana_quest_participants')
    .select('*, recipient:rewards_recipient_id(full_name), user:user_id(full_name)')
    .eq('session_id', sessionId)
    .order('total_points', { ascending: false })

  const { data: answers } = await supabase
    .from('vana_quest_answers')
    .select('*')
    .eq('session_id', sessionId)

  // Recompute true max streak per participant from the answer history (ordered by question_order).
  // Treats unanswered questions as streak-breaking.
  const questionOrderMap = new Map<string, number>()
  ;(questions || []).forEach((q) => questionOrderMap.set(q.id, q.question_order))
  const trueMaxStreak = new Map<string, number>()
  const trueCorrect = new Map<string, number>()
  ;(participants || []).forEach((p) => {
    const myAnswered = new Map<string, boolean>()
    ;(answers || [])
      .filter((a) => a.participant_id === p.id)
      .forEach((a) => myAnswered.set(a.question_id, a.is_correct))
    let streak = 0
    let max = 0
    let correct = 0
    ;(questions || []).forEach((q) => {
      const ans = myAnswered.get(q.id)
      if (ans === true) {
        streak += 1
        correct += 1
        if (streak > max) max = streak
      } else {
        // wrong OR didn't answer → break streak
        streak = 0
      }
    })
    trueMaxStreak.set(p.id, max)
    trueCorrect.set(p.id, correct)
  })

  const status = STATUS_LABELS[session.status] || STATUS_LABELS.waiting
  const durationMin = session.ended_at
    ? Math.round((new Date(session.ended_at).getTime() - new Date(session.created_at).getTime()) / 60000)
    : null

  const totalParticipants = participants?.length || 0
  const totalQuestions = questions?.length || 0
  const totalAnswers = answers?.length || 0
  const correctAnswers = answers?.filter((a) => a.is_correct).length || 0
  const accuracy = totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/admin/vana-quest" className="text-gray-500 hover:text-gray-900 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${status.color}`}>
                {status.label}
              </span>
              <span className="text-xs text-gray-400 font-mono flex items-center gap-1">
                <Hash className="w-3 h-3" /> {session.pin}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 truncate">
              {(session.vana_quests as any)?.title || 'Sem título'}
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
              {(session.host as any)?.full_name && (
                <>
                  <span>·</span>
                  <span>Host: {(session.host as any).full_name}</span>
                </>
              )}
            </p>
          </div>

          {session.status === 'finished' && (
            <div className="flex-shrink-0">
              <DeleteSessionButton
                sessionId={sessionId}
                sessionTitle={(session.vana_quests as any)?.title || 'sessão'}
              />
            </div>
          )}
        </div>

        {/* Live actions — only if session is still active */}
        {session.status !== 'finished' && (
          <div className="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-2xl p-4 sm:p-5 shadow-lg border border-blue-800/30">
            <div className="flex items-start gap-3 mb-3">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse mt-1.5 flex-shrink-0" />
              <div>
                <p className="text-white font-bold text-sm">Sessão ao vivo</p>
                <p className="text-blue-200 text-xs">Esta sessão ainda está {session.status === 'waiting' ? 'em sala de espera' : 'a decorrer'}.</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {session.host_id === user.id && (
                <Link
                  href={`/jogos/vana-quest/${sessionId}/control`}
                  className="flex-1 flex items-center justify-center gap-2 bg-white text-blue-900 font-bold text-sm py-2.5 px-4 rounded-xl hover:bg-yellow-300 transition-colors"
                >
                  <Play className="w-4 h-4" /> Voltar ao controlo
                </Link>
              )}
              <a
                href={`/jogos/vana-quest/${sessionId}/present`}
                target="_blank"
                rel="noopener"
                className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold text-sm py-2.5 px-4 rounded-xl border border-white/20 transition-colors"
              >
                <MonitorPlay className="w-4 h-4" /> Abrir apresentação
              </a>
              {session.status === 'waiting' && (
                <a
                  href={`/jogos/vana-quest?pin=${session.pin}`}
                  target="_blank"
                  rel="noopener"
                  className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold text-sm py-2.5 px-4 rounded-xl border border-white/20 transition-colors"
                >
                  <UserPlus className="w-4 h-4" /> Entrar como jogador
                </a>
              )}
            </div>
          </div>
        )}

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<Users className="w-5 h-5" />} label="Jogadores" value={totalParticipants} color="blue" />
          <StatCard icon={<Trophy className="w-5 h-5" />} label="Perguntas" value={totalQuestions} color="amber" />
          <StatCard icon={<CheckCircle2 className="w-5 h-5" />} label="Acerto" value={`${accuracy}%`} color="green" />
          <StatCard icon={<Hash className="w-5 h-5" />} label="Respostas" value={totalAnswers} color="indigo" />
        </div>

        {/* Atribuir XP/Gold — só se a sessão está terminada */}
        {session.status === 'finished' && participants && participants.length > 0 && (
          <AwardSessionButton
            sessionId={sessionId}
            alreadyAwarded={!!(session as any).points_awarded_at}
            awardedAt={(session as any).points_awarded_at}
          />
        )}

        {/* Leaderboard */}
        <section className="bg-white rounded-2xl border shadow-sm p-5 space-y-3">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" /> Classificação final
          </h2>

          {!participants || participants.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Sem participantes.</p>
          ) : (
            <div className="space-y-1.5">
              {participants.map((p, i) => {
                const recipient = (p.recipient as any)?.full_name
                const linkedUser = (p.user as any)?.full_name
                const realMax = trueMaxStreak.get(p.id) ?? 0
                const realCorrect = trueCorrect.get(p.id) ?? p.correct_answers
                return (
                  <div key={p.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                    <span className={`text-base font-black w-7 text-center ${
                      i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-700' : 'text-gray-300'
                    }`}>
                      {i + 1}
                    </span>
                    <PlayerAvatar
                      name={p.display_name}
                      avatarUrl={p.avatar_url}
                      className="w-9 h-9"
                      textClassName="text-sm"
                      fallbackBg="bg-blue-100 text-blue-700"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{p.display_name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {p.is_guest ? (
                          recipient ? <>convidado → <span className="text-blue-700">{recipient}</span></> : 'convidado (sem destinatário)'
                        ) : linkedUser || 'desbravador'}
                      </p>
                    </div>
                    <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500 flex-shrink-0">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-green-600" /> {realCorrect}
                      </span>
                      {realMax >= 2 && (
                        <span className="flex items-center gap-1 text-orange-500">
                          <Flame className="w-3 h-3" /> {realMax}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-black text-gray-900 tabular-nums">{Number(p.total_points).toFixed(2)}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">pts</p>
                    </div>
                    {session.status === 'finished' && Number(p.total_points) > 0 && (
                      <div className="hidden sm:block text-right text-xs text-gray-500 border-l pl-3 ml-1">
                        <p>+{Math.round(Number(p.total_points))} 🪙</p>
                        <p>+{Math.round(Number(p.total_points)) * 2} ⭐</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Per question breakdown */}
        {questions && questions.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-blue-600" /> Detalhe por pergunta
            </h2>

            <div className="space-y-3">
              {questions.map((q, i) => {
                const qAnswers = (answers || []).filter((a) => a.question_id === q.id)
                const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, '∅': 0 }
                qAnswers.forEach((a) => {
                  if (a.chosen_option) counts[a.chosen_option] = (counts[a.chosen_option] || 0) + 1
                  else counts['∅']++
                })
                const max = Math.max(...Object.values(counts), 1)
                const correctCount = qAnswers.filter((a) => a.is_correct).length

                return (
                  <div key={q.id} className="bg-white rounded-2xl border shadow-sm p-5">
                    <div className="flex items-start gap-3 mb-4">
                      <span className="w-7 h-7 rounded-full bg-blue-900 text-white text-xs font-black flex items-center justify-center flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{q.question_text}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {q.time_seconds}s</span>
                          <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> ×{q.points_multiplier}</span>
                          <span>{qAnswers.length} respostas · {correctCount} certas</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                        const optText = q[`option_${opt.toLowerCase()}` as keyof typeof q] as string
                        const count = counts[opt] || 0
                        const isCorrect = q.correct_option === opt
                        const pct = (count / max) * 100
                        return (
                          <div key={opt} className="flex items-center gap-2">
                            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black flex-shrink-0 ${OPTION_COLORS[opt]}`}>
                              {OPTION_LABELS[opt]}
                            </span>
                            <div className="flex-1 relative h-7 rounded-lg bg-gray-100 overflow-hidden">
                              <div
                                className={`absolute inset-y-0 left-0 ${OPTION_COLORS[opt]} ${isCorrect ? 'opacity-100' : 'opacity-30'} transition-all`}
                                style={{ width: `${Math.max(2, pct)}%` }}
                              />
                              <div className="relative h-full flex items-center justify-between px-2.5 text-xs">
                                <span className={`font-semibold truncate ${pct > 30 ? 'text-white' : 'text-gray-700'}`}>{optText}</span>
                                <span className={`font-black tabular-nums shrink-0 ml-2 ${pct > 30 ? 'text-white' : 'text-gray-700'}`}>{count}</span>
                              </div>
                            </div>
                            {isCorrect && (
                              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                            )}
                          </div>
                        )
                      })}
                      {counts['∅'] > 0 && (
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-gray-200 text-gray-500 font-black">∅</span>
                          <span>{counts['∅']} sem resposta (tempo esgotado)</span>
                        </div>
                      )}
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
