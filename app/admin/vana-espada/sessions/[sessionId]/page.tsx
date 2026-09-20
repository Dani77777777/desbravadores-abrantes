import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Award, BookOpen, Calendar, CheckCircle2, ChevronLeft, Clock, Hash, MonitorPlay,
  Play, Target, TrendingDown, TrendingUp, Trophy, UserPlus, Users, Zap,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { Navbar } from '@/components/layout/Navbar'
import { PlayerAvatar } from '@/components/vana-quest/PlayerAvatar'
import { DeleteSessionButton } from '@/components/vana-espada/DeleteSessionButton'
import { AwardSessionButton } from '@/components/vana-espada/AwardSessionButton'
import { isAdminRole, SECTION_LABELS as CLUB_SECTION_LABELS } from '@/utils/permissions'
import { SECTION_COLORS, SECTION_LABELS, getBook, type BibleSection } from '@/utils/bible-books'
import {
  ANSWER_TIERS,
  answerTier,
  calcEspadaRewards,
  foundTheBook,
  formatGuess,
  formatReference,
  summarizePlayerStrengths,
  type AnswerTier,
  type PlayerStrengths,
} from '@/utils/vana-espada'
import {
  ANSWER_TIER_COLORS,
  ANSWER_TIER_LABELS,
  ANSWER_TIER_SHORT,
  ESPADA_STATUS_LABELS,
} from '@/utils/vana-espada-labels'
import type { EspadaStatus, LocateBreakdown } from '@/types/vana-espada'

interface SessionRow {
  id: string
  pin: string
  status: EspadaStatus
  host_id: string
  total_rounds: number
  created_at: string
  ended_at: string | null
  points_awarded_at: string | null
  host: { full_name: string | null } | null
}

interface RoundRow {
  id: string
  round_index: number
  book_id: number
  chapter: number
  verse_start: number
  verse_end: number
  excerpt: string | null
  translation: string | null
  time_seconds: number
  started_at: string | null
}

interface PlayerRow {
  id: string
  display_name: string
  avatar_url: string | null
  is_guest: boolean
  total_points: number
  joined_at: string
  recipient: { full_name: string | null } | null
  user: { full_name: string | null; section: string | null } | null
}

interface AnswerRow {
  round_id: string
  player_id: string
  guess_book: number | null
  guess_chapter: number | null
  guess_verse: number | null
  points: number
  breakdown: LocateBreakdown | null
  elapsed_ms: number | null
}

/**
 * Relatório de uma sessão do VanaEspada — o equivalente ao do VanaQuest, com uma
 * secção a mais: os pontos fortes de cada desbravador por secção da Bíblia.
 *
 * As rondas (com a resposta) e as respostas não têm leitura para o cliente, por
 * isso esta página lê-as pelo service role, depois de confirmar que é liderança.
 */
export default async function EspadaSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!isAdminRole(profile)) redirect('/')

  const service = createServiceClient()
  const [sessionRes, roundsRes, playersRes, answersRes] = await Promise.all([
    service
      .from('vanaespada_sessions')
      .select('id, pin, status, host_id, total_rounds, created_at, ended_at, points_awarded_at, host:host_id(full_name)')
      .eq('id', sessionId)
      .maybeSingle(),
    service
      .from('vanaespada_session_rounds')
      .select('id, round_index, book_id, chapter, verse_start, verse_end, excerpt, translation, time_seconds, started_at')
      .eq('session_id', sessionId)
      .order('round_index'),
    service
      .from('vanaespada_players')
      .select('id, display_name, avatar_url, is_guest, total_points, joined_at, recipient:rewards_recipient_id(full_name), user:user_id(full_name, section)')
      .eq('session_id', sessionId)
      .order('total_points', { ascending: false }),
    service
      .from('vanaespada_answers')
      .select('round_id, player_id, guess_book, guess_chapter, guess_verse, points, breakdown, elapsed_ms')
      .eq('session_id', sessionId),
  ])

  const session = sessionRes.data as unknown as SessionRow | null
  if (!session) redirect('/admin/vana-espada')

  const rounds = (roundsRes.data ?? []) as RoundRow[]
  const players = (playersRes.data ?? []) as unknown as PlayerRow[]
  const answers = (answersRes.data ?? []) as AnswerRow[]

  const playedRounds = rounds.filter((r) => r.started_at)
  const answersByPlayer = groupBy(answers, (a) => a.player_id)
  const answersByRound = groupBy(answers, (a) => a.round_id)

  // Rondas que contam para cada jogador: as que começaram depois de ele entrar,
  // mais alguma em que tenha respondido (entrou mesmo a tempo).
  const eligibleRounds = (player: PlayerRow) => {
    const joined = new Date(player.joined_at).getTime()
    const answeredIds = new Set((answersByPlayer.get(player.id) ?? []).map((a) => a.round_id))
    return playedRounds.filter(
      (r) => answeredIds.has(r.id) || new Date(r.started_at as string).getTime() >= joined
    )
  }

  const strengths = new Map<string, PlayerStrengths>(
    players.map((p) => [
      p.id,
      summarizePlayerStrengths(
        eligibleRounds(p).map((r) => ({ id: r.id, bookId: r.book_id })),
        (answersByPlayer.get(p.id) ?? []).map((a) => ({
          roundId: a.round_id,
          breakdown: a.breakdown,
          points: a.points,
          elapsedMs: a.elapsed_ms,
        }))
      ),
    ])
  )

  // ── Números gerais ──
  const tiersOverall = answers.map((a) => answerTier(a.breakdown))
  const bookRightPct = answers.length
    ? Math.round((tiersOverall.filter(foundTheBook).length / answers.length) * 100)
    : 0
  const exactCount = tiersOverall.filter((t) => t === 'exact').length

  // ── O grupo por secção: das respostas às rondas dessa secção, quantas acertaram o livro ──
  const groupBySection = new Map<BibleSection, { rounds: number; answers: number; bookRight: number }>()
  for (const r of playedRounds) {
    const section = getBook(r.book_id)?.section
    if (!section) continue
    const acc = groupBySection.get(section) ?? { rounds: 0, answers: 0, bookRight: 0 }
    const roundAnswers = answersByRound.get(r.id) ?? []
    acc.rounds += 1
    acc.answers += roundAnswers.length
    acc.bookRight += roundAnswers.filter((a) => foundTheBook(answerTier(a.breakdown))).length
    groupBySection.set(section, acc)
  }
  const groupSections = [...groupBySection.entries()]
    .map(([section, s]) => ({ section, ...s, pct: s.answers ? Math.round((s.bookRight / s.answers) * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct)

  const isLive = session.status !== 'finished'
  const durationMin = session.ended_at
    ? Math.round((new Date(session.ended_at).getTime() - new Date(session.created_at).getTime()) / 60000)
    : null
  const statusColor =
    session.status === 'finished' ? 'bg-green-100 text-green-700'
      : session.status === 'lobby' ? 'bg-purple-100 text-purple-700'
      : 'bg-blue-100 text-blue-700'

  const memberLabel = (p: PlayerRow) => {
    if (p.is_guest) {
      return p.recipient?.full_name
        ? <>convidado → <span className="text-blue-700">{p.recipient.full_name}</span></>
        : 'convidado (sem destinatário)'
    }
    const section = p.user?.section ? CLUB_SECTION_LABELS[p.user.section] ?? p.user.section : null
    return [p.user?.full_name ?? 'desbravador', section].filter(Boolean).join(' · ')
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center gap-4">
          <Link href="/admin/vana-espada" className="text-gray-500 hover:text-gray-900 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusColor}`}>
                {ESPADA_STATUS_LABELS[session.status] ?? session.status}
              </span>
              <span className="text-xs text-gray-400 font-mono flex items-center gap-1">
                <Hash className="w-3 h-3" /> {session.pin}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <img src="/images/VanaEspada.jpeg" alt="" className="w-8 h-8 object-contain rounded-md" />
              VanaEspada · Onde Está?
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
              {session.host?.full_name && (
                <>
                  <span>·</span>
                  <span>Anfitrião: {session.host.full_name}</span>
                </>
              )}
            </p>
          </div>
          <DeleteSessionButton sessionId={session.id} pin={session.pin} live={isLive} redirectTo="/admin/vana-espada" />
        </div>

        {/* Sessão ao vivo */}
        {isLive && (
          <div className="bg-gradient-to-r from-slate-800 via-sky-900 to-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
            <div className="flex items-start gap-3 mb-3">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse mt-1.5 flex-shrink-0" />
              <div>
                <p className="text-white font-bold text-sm">Sessão ao vivo</p>
                <p className="text-sky-200 text-xs">
                  Esta sessão ainda está {session.status === 'lobby' ? 'na sala de espera' : 'a decorrer'} —
                  o relatório vai-se completando ronda a ronda.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {session.host_id === user.id && (
                <Link
                  href={`/jogos/vana-espada/${session.id}/control`}
                  className="flex-1 flex items-center justify-center gap-2 bg-amber-400 text-slate-900 font-bold text-sm py-2.5 px-4 rounded-xl hover:bg-amber-300 transition-colors"
                >
                  <Play className="w-4 h-4" /> Voltar ao controlo
                </Link>
              )}
              <a
                href={`/jogos/vana-espada/${session.id}/present`}
                target="_blank"
                rel="noopener"
                className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold text-sm py-2.5 px-4 rounded-xl border border-white/20 transition-colors"
              >
                <MonitorPlay className="w-4 h-4" /> Abrir apresentação
              </a>
              {session.status === 'lobby' && (
                <a
                  href={`/jogos/vana-espada?pin=${session.pin}`}
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

        {/* Números rápidos */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<Users className="w-5 h-5" />} label="Jogadores" value={players.length} color="blue" />
          <StatCard
            icon={<BookOpen className="w-5 h-5" />}
            label="Rondas jogadas"
            value={`${playedRounds.length}/${session.total_rounds}`}
            color="amber"
          />
          <StatCard icon={<CheckCircle2 className="w-5 h-5" />} label="Acertaram o livro" value={`${bookRightPct}%`} color="green" />
          <StatCard icon={<Target className="w-5 h-5" />} label="Referências exatas" value={exactCount} color="indigo" />
        </div>

        {/* Prémios */}
        {session.status === 'finished' && players.length > 0 && (
          <AwardSessionButton
            sessionId={session.id}
            alreadyAwarded={!!session.points_awarded_at}
            awardedAt={session.points_awarded_at}
          />
        )}

        {/* Classificação final */}
        <section className="bg-white rounded-2xl border shadow-sm p-5 space-y-3">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" /> Classificação {isLive ? 'até agora' : 'final'}
          </h2>

          {players.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Sem jogadores.</p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-500">
                Cada 10 pontos valem 1 Gold, e o XP é o dobro (4826 pts → 482🪙 + 964⭐).
              </p>
              {players.map((p, i) => {
                const s = strengths.get(p.id)
                const { gold, xp } = calcEspadaRewards(Number(p.total_points) || 0)
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
                      fallbackBg="bg-sky-100 text-sky-700"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{p.display_name}</p>
                      <p className="text-xs text-gray-500 truncate">{memberLabel(p)}</p>
                    </div>
                    {s && (
                      <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500 flex-shrink-0">
                        <span className="flex items-center gap-1" title="Referências exatas">
                          <Target className="w-3 h-3 text-amber-500" /> {s.tiers.exact}
                        </span>
                        <span className="flex items-center gap-1" title="Acertou pelo menos o livro">
                          <BookOpen className="w-3 h-3 text-green-600" />
                          {s.tiers.exact + s.tiers.chapter + s.tiers.book}/{s.rounds}
                        </span>
                      </div>
                    )}
                    <div className="text-right">
                      <p className="font-black text-gray-900 tabular-nums">{Number(p.total_points)}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">pts</p>
                    </div>
                    {session.status === 'finished' && gold > 0 && (
                      <div className="hidden sm:block text-right text-xs text-gray-500 border-l pl-3 ml-1">
                        <p>+{gold} 🪙</p>
                        <p>+{xp} ⭐</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Pontos fortes de cada desbravador */}
        {players.length > 0 && playedRounds.length > 0 && (
          <section className="space-y-3">
            <div>
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-600" /> Pontos fortes de cada desbravador
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Uma secção é ponto forte quando a média é de pelo menos 600 pontos por ronda (encontra o livro),
                e é para treinar abaixo de 200 (nem a secção acerta). Só contam as rondas em que cada um já estava no jogo.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {players.map((p) => {
                const s = strengths.get(p.id)
                if (!s || s.rounds === 0) return null
                return <StrengthCard key={p.id} player={p} strengths={s} subtitle={memberLabel(p)} />
              })}
            </div>
          </section>
        )}

        {/* O grupo por secção */}
        {groupSections.length > 0 && (
          <section className="bg-white rounded-2xl border shadow-sm p-5 space-y-3">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-600" /> O grupo por secção da Bíblia
            </h2>
            <p className="text-xs text-gray-500">
              Das respostas às rondas de cada secção, quantas acertaram pelo menos o livro. Ajuda a escolher o que treinar a seguir.
            </p>
            <div className="space-y-2">
              {groupSections.map((g) => (
                <SectionBar
                  key={g.section}
                  section={g.section}
                  pct={g.pct}
                  detail={`${g.bookRight}/${g.answers} · ${g.rounds} ronda${g.rounds === 1 ? '' : 's'}`}
                />
              ))}
            </div>
          </section>
        )}

        {/* Detalhe por ronda */}
        {playedRounds.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-blue-600" /> Detalhe por ronda
            </h2>

            <div className="space-y-3">
              {playedRounds.map((r) => (
                <RoundCard
                  key={r.id}
                  round={r}
                  answers={answersByRound.get(r.id) ?? []}
                  players={players.filter((p) => eligibleRounds(p).some((er) => er.id === r.id))}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

// ── Pontos fortes de um jogador ──────────────────────────────────────

function StrengthCard({
  player, strengths: s, subtitle,
}: {
  player: PlayerRow
  strengths: PlayerStrengths
  subtitle: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-3">
        <PlayerAvatar
          name={player.display_name}
          avatarUrl={player.avatar_url}
          className="w-10 h-10"
          textClassName="text-sm"
          fallbackBg="bg-sky-100 text-sky-700"
        />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 truncate">{player.display_name}</p>
          <p className="text-xs text-gray-500 truncate">{subtitle}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-black text-gray-900 tabular-nums leading-none">{s.avgPoints}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider">pts/ronda</p>
        </div>
      </div>

      {/* Precisão: de "referência exata" a "sem resposta" */}
      <div className="space-y-1.5">
        <TierBar tiers={s.tiers} total={s.rounds} />
        <div className="flex flex-wrap gap-1">
          {ANSWER_TIERS.filter((t) => s.tiers[t] > 0).map((t) => (
            <span
              key={t}
              title={ANSWER_TIER_LABELS[t]}
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${ANSWER_TIER_COLORS[t].chip}`}
            >
              {ANSWER_TIER_SHORT[t]} {s.tiers[t]}
            </span>
          ))}
          {s.avgSeconds != null && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-white text-gray-500 border-gray-200 flex items-center gap-0.5">
              <Zap className="w-2.5 h-2.5" /> {s.avgSeconds.toLocaleString('pt-PT')} s em média
            </span>
          )}
        </div>
      </div>

      {/* Pontos fortes e a treinar */}
      {(s.strongest.length > 0 || s.weakest.length > 0) && (
        <div className="space-y-1.5 text-xs">
          {s.strongest.length > 0 && (
            <p className="flex items-start gap-1.5 text-green-700">
              <TrendingUp className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span><strong>Forte em:</strong> {s.strongest.map((x) => SECTION_LABELS[x]).join(', ')}</span>
            </p>
          )}
          {s.weakest.length > 0 && (
            <p className="flex items-start gap-1.5 text-red-600">
              <TrendingDown className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span><strong>A treinar:</strong> {s.weakest.map((x) => SECTION_LABELS[x]).join(', ')}</span>
            </p>
          )}
        </div>
      )}

      {/* Por secção */}
      <div className="space-y-1.5 pt-1 border-t">
        {s.bySection.map((sec) => (
          <SectionBar
            key={sec.section}
            section={sec.section}
            pct={Math.round((sec.avgPoints / 1000) * 100)}
            detail={`livro ${sec.bookRight}/${sec.rounds} · ${sec.avgPoints} pts`}
            compact
          />
        ))}
      </div>
    </div>
  )
}

// ── Uma ronda ────────────────────────────────────────────────────────

function RoundCard({ round, answers, players }: { round: RoundRow; answers: AnswerRow[]; players: PlayerRow[] }) {
  const book = getBook(round.book_id)
  const answerByPlayer = new Map(answers.map((a) => [a.player_id, a]))

  const rows = players
    .map((p) => {
      const a = answerByPlayer.get(p.id)
      return { player: p, answer: a, tier: answerTier(a?.breakdown) as AnswerTier }
    })
    .sort((x, y) => (y.answer?.points ?? -1) - (x.answer?.points ?? -1))

  const tiers = Object.fromEntries(ANSWER_TIERS.map((t) => [t, 0])) as Record<AnswerTier, number>
  rows.forEach((r) => { tiers[r.tier] += 1 })

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-5">
      <div className="flex items-start gap-3 mb-3">
        <span className="w-7 h-7 rounded-full bg-slate-800 text-white text-xs font-black flex items-center justify-center flex-shrink-0">
          {round.round_index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-gray-900">
              {formatReference({
                bookId: round.book_id,
                chapter: round.chapter,
                verseStart: round.verse_start,
                verseEnd: round.verse_end,
              })}
            </p>
            {book && (
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                <span className={`w-2 h-2 rounded-sm ${SECTION_COLORS[book.section].bg}`} />
                {SECTION_LABELS[book.section]}
              </span>
            )}
          </div>
          {round.excerpt && (
            <p className="text-sm text-gray-600 italic mt-1 leading-snug">&ldquo;{round.excerpt}&rdquo;</p>
          )}
          <p className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {round.time_seconds}s</span>
            <span>
              {answers.length} respostas · {rows.filter((r) => foundTheBook(r.tier)).length} acertaram o livro
            </span>
          </p>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <TierBar tiers={tiers} total={rows.length} />
          <div className="mt-3 divide-y">
            {rows.map(({ player, answer, tier }) => (
              <div key={player.id} className="flex items-center gap-2.5 py-1.5">
                <PlayerAvatar
                  name={player.display_name}
                  avatarUrl={player.avatar_url}
                  className="w-7 h-7"
                  textClassName="text-[10px]"
                  fallbackBg="bg-sky-100 text-sky-700"
                />
                <span className="text-sm text-gray-900 font-semibold truncate flex-1 min-w-0">{player.display_name}</span>
                <span className="font-mono text-sm text-gray-700 tabular-nums">
                  {answer
                    ? formatGuess({
                        bookId: answer.guess_book ?? undefined,
                        chapter: answer.guess_chapter,
                        verse: answer.guess_verse,
                      })
                    : '—'}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border w-[4.5rem] text-center ${ANSWER_TIER_COLORS[tier].chip}`}>
                  {ANSWER_TIER_SHORT[tier]}
                </span>
                <span className="text-xs text-gray-400 tabular-nums w-10 text-right">
                  {answer?.elapsed_ms != null ? `${(answer.elapsed_ms / 1000).toFixed(1)}s` : ''}
                </span>
                <span className="font-black text-sm text-gray-900 tabular-nums w-12 text-right">
                  {answer ? answer.points : 0}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Peças pequenas ───────────────────────────────────────────────────

/** Barra empilhada dos níveis de resposta (referência exata → sem resposta). */
function TierBar({ tiers, total }: { tiers: Record<AnswerTier, number>; total: number }) {
  if (total === 0) return null
  return (
    <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
      {ANSWER_TIERS.filter((t) => tiers[t] > 0).map((t) => (
        <div
          key={t}
          className={ANSWER_TIER_COLORS[t].bar}
          style={{ width: `${(tiers[t] / total) * 100}%` }}
          title={`${ANSWER_TIER_LABELS[t]}: ${tiers[t]}`}
        />
      ))}
    </div>
  )
}

function SectionBar({
  section, pct, detail, compact,
}: {
  section: BibleSection
  pct: number
  detail: string
  compact?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`flex items-center gap-1.5 flex-shrink-0 ${compact ? 'w-32 text-[11px]' : 'w-40 text-xs'} font-semibold text-gray-700`}>
        <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${SECTION_COLORS[section].bg}`} />
        <span className="truncate">{SECTION_LABELS[section]}</span>
      </span>
      <div className={`flex-1 rounded-full bg-gray-100 overflow-hidden ${compact ? 'h-1.5' : 'h-2.5'}`}>
        <div
          className={SECTION_COLORS[section].bg}
          style={{ width: `${Math.max(2, Math.min(100, pct))}%`, height: '100%' }}
        />
      </div>
      <span className={`flex-shrink-0 text-right text-gray-500 tabular-nums ${compact ? 'text-[10px] w-28' : 'text-xs w-32'}`}>
        {detail}
      </span>
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
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>{icon}</div>
      <div>
        <p className="text-2xl font-black text-gray-900 tabular-nums leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}
