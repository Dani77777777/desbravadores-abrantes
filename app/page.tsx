import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { GoldTransferDialog } from '@/components/profile/GoldTransferDialog'

// ... lines 7-9 ...
import { TaskCompleteButton } from '@/components/tasks/TaskCompleteButton'
import { EventDashboard } from '@/components/events/EventDashboard'
import { Button } from '@/components/ui/button'
// ... (adding import at top) ...
import { User, Trophy, Coins, Megaphone, ScanLine, History, ListChecks, CheckCircle2, Clock, CalendarDays } from 'lucide-react'

import { LandingPage } from '@/components/landing/LandingPage'
import { getJAEvents, filterJAEventsForSection } from '@/utils/ja-agenda'

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
      return <LandingPage />
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Filter announcements based on role hierarchy
  let announcementsQuery = supabase
    .from('announcements')
    .select('*')

  const orFilter = [
    `and(target_user_id.is.null,target_section.is.null,target_role.is.null)`,
    `target_user_id.eq.${user.id}`,
    `and(target_section.eq.${profile.section},target_role.is.null)`,
    `and(target_section.eq.${profile.section},target_role.eq.${profile.role})`,
    `and(target_section.is.null,target_role.eq.${profile.role})`,
  ].join(',')
  announcementsQuery = announcementsQuery.or(orFilter)

  const { data: announcements } = await announcementsQuery
    .order('created_at', { ascending: false })
    .limit(10)

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

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Hero Section */}
        <Card className="overflow-hidden border-none shadow-md">
            <div className={`h-24 ${sectionColor} relative`}>
                {!profile.is_invested && (
                  <div className="absolute top-2 right-2">
                    <Badge variant="destructive" className="bg-red-500/90 text-white hover:bg-red-600">
                      A aguardar investidura
                    </Badge>
                  </div>
                )}
            </div>
            <CardContent className="pt-0 relative px-6 pb-6">
                <div className="flex flex-col sm:flex-row items-center sm:items-end -mt-12 mb-4 gap-4">
                     <div className="relative">
                        <div className="w-24 h-24 rounded-full border-4 border-white bg-gray-200 overflow-hidden shadow-sm">
                            {profile.avatar_url ? (
                                <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-300 text-gray-500">
                                    <User className="h-10 w-10" />
                                </div>
                            )}
                        </div>
                        {profile.is_invested && (
                           <div className="absolute -bottom-2 -right-2 bg-yellow-400 p-1.5 rounded-full border-2 border-white shadow-sm" title="Investido">
                               <div className="w-4 h-4 bg-yellow-600 rounded-full" />
                           </div>
                        )}
                     </div>
                     <div className="text-center sm:text-left flex-1">
                        <h1 className="text-2xl font-bold text-gray-900">{profile.full_name}</h1>
                        <div className="flex items-center justify-center sm:justify-start gap-2 mt-1">
                            <Badge variant="secondary" className={`${sectionColor} text-white border-none capitalize`}>
                                {sectionLabel}
                            </Badge>
                            <Badge variant="outline" className="text-gray-600 capitalize">
                                {profile.role}
                            </Badge>
                        </div>
                     </div>
                </div>

                {/* Gamification Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    <div className="space-y-2">
                         <div className="flex justify-between items-center text-sm font-medium">
                            <div className="flex items-center gap-2 text-indigo-700">
                                <Trophy className="w-4 h-4" />
                                <span>Pontos de Experiência (XP)</span>
                            </div>
                            <span className="text-gray-600">{profile.total_xp} XP</span>
                         </div>
                         <Progress value={(profile.total_xp % 1000) / 10} className="h-3 bg-indigo-100" indicatorColor="bg-indigo-600" />
                         <p className="text-xs text-right text-gray-500">Próximo nível em {1000 - (profile.total_xp % 1000)} XP</p>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-xl border border-yellow-100">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-yellow-100 rounded-full text-yellow-700">
                                <Coins className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-yellow-800 font-medium">Saldo Atual</p>
                                <p className="text-2xl font-bold text-yellow-900">{profile.current_gold}</p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <GoldTransferDialog currentUserId={user.id} currentGold={profile.current_gold} />
                            <Link href="/points-history">
                              <Button size="sm" variant="outline" className="w-full border-yellow-300 text-yellow-800 hover:bg-yellow-100 flex items-center gap-1">
                                  <History className="w-4 h-4" />
                                  Histórico
                              </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
        
        {/* Main Content Grid: Announcements and Events */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Announcements Section */}
            <div className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <Megaphone className="w-5 h-5 text-blue-700" /> Avisos e Novidades
                </h2>
                <div className="space-y-4">
                    {announcements && announcements.length > 0 ? (
                        announcements.map((announcement) => (
                            <Card key={announcement.id} className="border-none shadow-sm overflow-hidden">
                                <div className="h-1 bg-blue-600 w-full opacity-20" />
                                <CardContent className="p-5">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-gray-900 transition-colors">
                                            {announcement.title}
                                        </h3>
                                        <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">
                                            {new Date(announcement.created_at).toLocaleDateString('pt-PT')}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                                        {announcement.message}
                                    </p>
                                </CardContent>
                            </Card>
                        ))
                    ) : (
                        <Card className="border-dashed border-2 bg-transparent shadow-none">
                            <CardContent className="py-10 text-center">
                                <p className="text-gray-500 italic">Nenhum aviso de momento.</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            {/* Events Agenda & Calendar Section */}
            <div>
                <EventDashboard events={allEvents} profile={profile} surveys={surveys || []} userId={user.id} />
            </div>
        </div>

        {/* Tasks Section */}
        {tasks && tasks.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-stone-200">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-blue-700" /> As Minhas Tarefas
              {openTasks.length > 0 && (
                <Badge className="bg-blue-700 text-white ml-1">{openTasks.length} pendentes</Badge>
              )}
            </h2>

            {openTasks.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {openTasks.map(task => (
                  <Card key={task.id} className="border border-blue-100 bg-white hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 text-sm truncate">{task.title}</h3>
                          <div className="flex items-center gap-3 mt-2">
                            {task.xp_reward > 0 && <span className="text-xs text-indigo-600 font-medium flex items-center gap-1"><Trophy className="w-3 h-3" /> +{task.xp_reward}</span>}
                            {task.gold_reward > 0 && <span className="text-xs text-yellow-600 font-medium flex items-center gap-1"><Coins className="w-3 h-3" /> +{task.gold_reward}</span>}
                            {task.deadline && (
                              <span className="text-[10px] text-gray-400">
                                até {new Date(task.deadline).toLocaleDateString('pt-PT')}
                              </span>
                            )}
                          </div>
                        </div>
                        <TaskCompleteButton taskId={task.id} userId={user.id} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {doneTasks.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 list-none">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  {doneTasks.length} tarefa{doneTasks.length !== 1 ? 's' : ''} concluída{doneTasks.length !== 1 ? 's' : ''}
                </summary>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                  {doneTasks.map(task => (
                    <div key={task.id} className="p-2 px-3 border rounded-lg bg-gray-50 flex items-center gap-2 text-xs text-gray-500">
                      <CheckCircle2 className="w-3 h-3 text-green-600 shrink-0" />
                      <span className="truncate">{task.title}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

      </main>
    </div>
  )
}
