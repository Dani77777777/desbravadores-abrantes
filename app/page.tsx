import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import Link from 'next/link'
import { GoldTransferDialog } from '@/components/profile/GoldTransferDialog'
import { TaskCompleteButton } from '@/components/tasks/TaskCompleteButton'
import { AnnouncementsFeed } from '@/components/dashboard/AnnouncementsFeed'
import { EventDashboard } from '@/components/events/EventDashboard'
import { User, Trophy, Coins, Megaphone, History, ListChecks, CheckCircle2, Clock, ShieldCheck, Hourglass } from 'lucide-react'
import { displayFont } from '@/components/landing/fonts'
import { SiteFooter } from '@/components/landing/SiteFooter'

import { LandingPage } from '@/components/landing/LandingPage'
import { getJAEvents, filterJAEventsForSection } from '@/utils/ja-agenda'
import { GAMES, fetchGameSettings, gameVisibilityFor } from '@/utils/games'

const D = displayFont.className

const SECTION_COLORS = {
  rebentos: 'bg-emerald-600',
  ticoes: 'bg-red-800',
  exploradores: 'bg-yellow-500',
  companheiros: 'bg-blue-600',
  embaixadores: 'bg-slate-500',
}

const SECTION_LABELS = {
    rebentos: 'Rebentos',
    ticoes: 'Tições',
    exploradores: 'Exploradores',
    companheiros: 'Companheiros',
    embaixadores: 'Embaixadores'
}

export default async function Dashboard() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
      const gameSettings = await fetchGameSettings(supabase)
      const gameVisibility = Object.fromEntries(GAMES.map((g) => [g.id, gameVisibilityFor(gameSettings[g.id], null)]))
      // Próximo evento aberto a todo o clube (sem secção) para mostrar aos visitantes
      const { data: nextEvent } = await supabase
        .from('events')
        .select('id, title, description, location, start_at, end_at')
        .is('target_section', null)
        .eq('is_finished', false)
        .gte('start_at', new Date().toISOString())
        .order('start_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      return <LandingPage gameVisibility={gameVisibility} nextEvent={nextEvent} />
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Caixa de entrada: os destinatários de cada comunicado são gravados no envio
  // (announcement_recipients), por isso mudar de classe não mistura avisos antigos.
  const { data: inbox } = await supabase
    .from('announcement_recipients')
    .select('read_at, created_at, announcements!inner(id, title, message, created_at, target_user_id, target_section, target_role, audience, author_name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30)

  const announcements = (inbox || []).map((row: any) => ({
    ...row.announcements,
    is_read: !!row.read_at,
  }))

  // Só os avisos das últimas 3 semanas aparecem por defeito;
  // os mais antigos ficam atrás de um botão "Ver avisos antigos"
  const threeWeeksAgo = Date.now() - 21 * 24 * 60 * 60 * 1000
  const unreadAnnouncements = announcements.filter(a => !a.is_read).length
  const recentAnnouncements = announcements.filter(
    a => new Date(a.created_at).getTime() >= threeWeeksAgo
  )
  const olderAnnouncements = announcements.filter(
    a => new Date(a.created_at).getTime() < threeWeeksAgo
  )

  // Fetch Events
  const { data: events } = await supabase
    .from('events')
    .select('*')
    .or(`target_section.is.null,target_section.eq.${profile.section}`)
    .order('start_at', { ascending: true })

  if (!profile) return <div>Perfil não encontrado.</div>

  // Eventos públicos da Juventude Adventista (cache de 6h; [] se o site falhar).
  // Filtrados pela secção pessoal do membro, independentemente do cargo;
  // eventos sem secção reconhecida (ou perfis sem secção) aparecem sempre.
  const jaEvents = filterJAEventsForSection(await getJAEvents(), profile.section)

  const allEvents = [...(events || []), ...jaEvents].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  )

  // Fetch tasks for this user (global ones + their section's tasks)
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .or(`target_section.is.null,target_section.eq.${profile.section}`)
    .order('created_at', { ascending: false })

  // Fetch this user's completions
  const { data: myCompletions } = await supabase
    .from('task_completions')
    .select('task_id, points_awarded')
    .eq('user_id', user.id)

  // Fetch visible surveys (RLS hides surveys older than deadline + 3 days for non-coords)
  const { data: surveys } = await supabase
    .from('surveys')
    .select('*, survey_options(*), survey_responses(id, option_id, user_id)')
    .order('created_at', { ascending: false })

  const completedTaskIds = new Set((myCompletions || []).map(c => c.task_id))
  const pendingAwardIds = new Set((myCompletions || []).filter(c => !c.points_awarded).map(c => c.task_id))

  const sectionColor = SECTION_COLORS[profile.section as keyof typeof SECTION_COLORS] || 'bg-blue-700'
  const sectionLabel = SECTION_LABELS[profile.section as keyof typeof SECTION_LABELS] || profile.section

  const openTasks = (tasks || []).filter(t => !completedTaskIds.has(t.id))
  const doneTasks = (tasks || []).filter(t => completedTaskIds.has(t.id))

  const level = Math.floor(profile.total_xp / 1000) + 1
  const xpInLevel = profile.total_xp % 1000

  return (
    <div className="min-h-screen overflow-x-clip bg-blue-950">
      <Navbar user={user} profile={profile} />

      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden pb-24 pt-10 text-white md:pt-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(40% 55% at 10% 30%, rgba(250,204,21,.16), transparent 70%), radial-gradient(45% 60% at 95% 20%, rgba(99,102,241,.3), transparent 70%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          }}
        />

        <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
          <div className="lp-rise flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:text-left">
            <div className="relative shrink-0">
              <div aria-hidden className="absolute -inset-3 rounded-full bg-yellow-400/25 blur-xl" />
              <div className="relative h-24 w-24 overflow-hidden rounded-full bg-blue-700 ring-4 ring-yellow-400 ring-offset-4 ring-offset-blue-950 sm:h-28 sm:w-28">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-white">
                    <User className="h-10 w-10" />
                  </div>
                )}
              </div>
              {profile.is_invested && (
                <span className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400 text-blue-950 shadow-md ring-4 ring-blue-950" title="Investido">
                  <ShieldCheck className="h-5 w-5" />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-blue-100/70">Olá de novo 👋</p>
              <h1 className={`${D} text-4xl font-extrabold leading-[0.95] tracking-tight sm:text-5xl`}>
                {profile.full_name}
              </h1>
              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                <span className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-white ${sectionColor}`}>
                  {sectionLabel}
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-100 ring-1 ring-inset ring-white/15">
                  {profile.role}
                </span>
                {!profile.is_invested && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                    <Hourglass className="h-3.5 w-3.5" /> A aguardar investidura
                  </span>
                )}
              </div>
              {(unreadAnnouncements > 0 || openTasks.length > 0) && (
                <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                  {unreadAnnouncements > 0 && (
                    <a href="#avisos" className="inline-flex items-center gap-1.5 rounded-full bg-yellow-400 px-3.5 py-1.5 text-sm font-extrabold text-blue-950 transition-transform hover:-translate-y-0.5">
                      <Megaphone className="h-4 w-4" /> {unreadAnnouncements} {unreadAnnouncements === 1 ? 'aviso novo' : 'avisos novos'}
                    </a>
                  )}
                  {openTasks.length > 0 && (
                    <a href="#tarefas" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-bold text-white ring-1 ring-inset ring-white/20 transition-colors hover:bg-white/20">
                      <ListChecks className="h-4 w-4 text-yellow-300" /> {openTasks.length} {openTasks.length === 1 ? 'tarefa pendente' : 'tarefas pendentes'}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* XP e Gold */}
          <div className="lp-rise grid grid-cols-1 gap-3 sm:grid-cols-2" style={{ '--d': '150ms' } as React.CSSProperties}>
            <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-indigo-500 to-violet-700 p-5 shadow-xl shadow-indigo-950/40">
              <Trophy aria-hidden className="absolute -bottom-5 -right-5 h-24 w-24 text-white/10" />
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-100">Nível</p>
                  <p className={`${D} text-5xl font-extrabold leading-none`}>{level}</p>
                </div>
                <p className="text-sm font-bold text-indigo-100">{profile.total_xp} XP</p>
              </div>
              <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-yellow-300 via-orange-400 to-pink-400"
                  style={{ width: `${Math.max(3, xpInLevel / 10)}%` }}
                />
              </div>
              <p className="mt-1.5 text-right text-xs font-semibold text-indigo-100">Próximo nível em {1000 - xpInLevel} XP</p>
            </div>

            <div className="relative overflow-hidden rounded-[1.5rem] bg-yellow-400 p-5 text-blue-950 shadow-xl shadow-yellow-900/30">
              <Coins aria-hidden className="absolute -bottom-5 -right-5 h-24 w-24 text-amber-600/20" />
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-blue-950/70">Saldo Atual</p>
              <p className={`${D} text-5xl font-extrabold leading-none`}>{profile.current_gold}</p>
              <div className="relative mt-4 flex flex-wrap gap-2">
                <GoldTransferDialog
                  currentUserId={user.id}
                  currentGold={profile.current_gold}
                  triggerClassName="flex h-9 items-center gap-1.5 rounded-full border-none bg-blue-950 px-4 text-sm font-bold text-white hover:bg-blue-900 hover:text-white"
                />
                <Link
                  href="/points-history"
                  className="flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-bold text-blue-950 ring-1 ring-inset ring-blue-950/25 transition-colors hover:bg-blue-950/10"
                >
                  <History className="h-4 w-4" /> Histórico
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Conteúdo ──────────────────────────────────────────── */}
      <div className="relative -mt-10 rounded-t-[2.5rem] bg-stone-50 pb-20 pt-10">
        <main className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Avisos */}
            <div id="avisos" className="scroll-mt-24 space-y-4">
              <h2 className={`${D} flex items-center gap-2.5 text-2xl font-extrabold text-blue-950`}>
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md">
                  <Megaphone className="h-5 w-5" />
                </span>
                Avisos e Novidades
                {unreadAnnouncements > 0 && (
                  <span className="rounded-full bg-red-500 px-2.5 py-0.5 font-sans text-xs font-extrabold text-white">
                    {unreadAnnouncements} {unreadAnnouncements === 1 ? 'novo' : 'novos'}
                  </span>
                )}
              </h2>
              <AnnouncementsFeed recent={recentAnnouncements} older={olderAnnouncements} />
            </div>

            {/* Agenda e calendário */}
            <div>
              <EventDashboard events={allEvents} profile={profile} surveys={surveys || []} userId={user.id} />
            </div>
          </div>

          {/* Tarefas */}
          {tasks && tasks.length > 0 && (
            <section id="tarefas" className="scroll-mt-24 space-y-4">
              <h2 className={`${D} flex flex-wrap items-center gap-2.5 text-2xl font-extrabold text-blue-950`}>
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-md">
                  <ListChecks className="h-5 w-5" />
                </span>
                As Minhas Tarefas
                {openTasks.length > 0 && (
                  <span className="rounded-full bg-blue-950 px-2.5 py-0.5 font-sans text-xs font-extrabold text-yellow-300">
                    {openTasks.length} pendentes
                  </span>
                )}
              </h2>

              {openTasks.length > 0 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {openTasks.map(task => (
                    <div
                      key={task.id}
                      className="group flex items-start justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-blue-200"
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-bold text-blue-950">{task.title}</h3>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {task.xp_reward > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-extrabold text-indigo-700">
                              <Trophy className="h-3 w-3" /> +{task.xp_reward}
                            </span>
                          )}
                          {task.gold_reward > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-extrabold text-amber-700">
                              <Coins className="h-3 w-3" /> +{task.gold_reward}
                            </span>
                          )}
                          {task.deadline && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-400">
                              <Clock className="h-3 w-3" /> até {new Date(task.deadline).toLocaleDateString('pt-PT')}
                            </span>
                          )}
                        </div>
                      </div>
                      <TaskCompleteButton taskId={task.id} userId={user.id} />
                    </div>
                  ))}
                </div>
              )}

              {doneTasks.length > 0 && (
                <details className="group rounded-2xl bg-white p-4 ring-1 ring-stone-200">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-stone-500 hover:text-blue-950">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    {doneTasks.length} tarefa{doneTasks.length !== 1 ? 's' : ''} concluída{doneTasks.length !== 1 ? 's' : ''}
                  </summary>
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                    {doneTasks.map(task => (
                      <div key={task.id} className="flex items-center gap-2 rounded-xl bg-stone-50 p-2 px-3 text-xs text-stone-500">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        <span className="truncate">{task.title}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </section>
          )}
        </main>
      </div>

      <SiteFooter />
    </div>
  )
}
