import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { redirect } from 'next/navigation'
import { MemberList } from './components/MemberList'
import { TaskPanel } from './components/TaskPanel'
import { OverviewPanel } from './components/OverviewPanel'
import { AnnouncementPanel } from './components/AnnouncementPanel'
import { SuggestionPanel } from './components/SuggestionPanel'
import { EventPanel } from './components/EventPanel'
import { Users, ListChecks, Megaphone, MessageSquare, LayoutDashboard, CalendarDays } from 'lucide-react'

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'coordenador' && profile.role !== 'dirigente')) {
    redirect('/')
  }

  // Fetch members (coordenador sees all, dirigente sees their LEADERSHIP section)
  let membersQuery = supabase.from('profiles').select('*').order('full_name')
  if (profile.role === 'dirigente') {
    const targetSection = profile.leadership_section || profile.section
    membersQuery = membersQuery.eq('section', targetSection)
  }
  const { data: members } = await membersQuery

  // Fetch tasks visible to this user
  let tasksQuery = supabase.from('tasks').select('*').order('created_at', { ascending: false })
  if (profile.role === 'dirigente') {
    const targetSection = profile.leadership_section || profile.section
    tasksQuery = tasksQuery.or(`target_section.is.null,target_section.eq.${targetSection}`)
  }
  const { data: tasks } = await tasksQuery

  // Fetch completions – Explicitly join the user who completed the task
  let completionsQuery = supabase
    .from('task_completions')
    .select(`
      *,
      profiles:user_id!inner(*),
      tasks:task_id!inner(*)
    `)
    .order('completed_at', { ascending: false })

  if (profile.role === 'dirigente') {
    const targetSection = profile.leadership_section || profile.section
    completionsQuery = completionsQuery.eq('profiles.section', targetSection)
  }

  const { data: completions } = await completionsQuery

  // Fetch announcements sent by ME
  const { data: sentAnnouncements } = await supabase
    .from('announcements')
    .select('*')
    .eq('author_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(20)

  // Fetch suggestions
  let suggestionsQuery = supabase
    .from('suggestions')
    .select(`
      *,
      profiles:user_id(full_name, section)
    `)
    .order('created_at', { ascending: false })

  if (profile.role === 'dirigente') {
    const targetSection = profile.leadership_section || profile.section
    suggestionsQuery = suggestionsQuery
      .eq('target', 'dirigente')
      .eq('profiles.section', targetSection)
  }

  const { data: suggestions } = await suggestionsQuery

  // Fetch Events
  let eventsQuery = supabase.from('events').select('*').order('start_at', { ascending: false })
  if (profile.role === 'dirigente') {
    const targetSection = profile.leadership_section || profile.section
    eventsQuery = eventsQuery.or(`target_section.is.null,target_section.eq.${targetSection}`)
  }
  const { data: events } = await eventsQuery

  const resolvedParams = await searchParams
  const defaultTab = profile.role === 'coordenador' ? 'overview' : 'members'
  const activeTab = resolvedParams?.tab || defaultTab

  const SECTION_LABELS: Record<string, string> = {
    rebentos: 'Rebentos', ticoes: 'Tições', exploradores: 'Exploradores',
    companheiros: 'Companheiros', embaixadores: 'Embaixadores',
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Painel de Gestão</h1>
            <p className="text-gray-600">
              {profile.role === 'coordenador'
                ? `Coordenador • Todos os membros (${members?.length || 0})`
                : `Dirigente das classes: ${SECTION_LABELS[profile.leadership_section || profile.section] || profile.section} • (${members?.length || 0} membros)`}
            </p>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="bg-white p-1.5 rounded-2xl border border-gray-200 shadow-sm overflow-x-auto no-scrollbar scroll-smooth flex gap-1 mb-2">
          {profile.role === 'coordenador' && (
            <a
              href="/admin?tab=overview"
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'bg-blue-900 text-white shadow-md'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" /> Visão Geral
            </a>
          )}
          <a
            href="/admin?tab=members"
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap ${
              activeTab === 'members'
                ? 'bg-blue-900 text-white shadow-md'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <Users className="w-4 h-4" /> Membros
          </a>
          <a
            href="/admin?tab=tasks"
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap ${
              activeTab === 'tasks'
                ? 'bg-blue-900 text-white shadow-md'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <ListChecks className="w-4 h-4" /> Tarefas
          </a>
          <a
            href="/admin?tab=events"
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap ${
              activeTab === 'events'
                ? 'bg-blue-900 text-white shadow-md'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <CalendarDays className="w-4 h-4" /> Eventos
          </a>
          <a
            href="/admin?tab=announcements"
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap ${
              activeTab === 'announcements'
                ? 'bg-blue-900 text-white shadow-md'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <Megaphone className="w-4 h-4" /> Comunicados
            {(sentAnnouncements?.length ?? 0) > 0 && (
              <span className={`ml-1 text-[10px] font-black rounded-full px-1.5 py-0.5 ${activeTab === 'announcements' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'}`}>
                {sentAnnouncements?.length}
              </span>
            )}
          </a>
          <a
            href="/admin?tab=suggestions"
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap ${
              activeTab === 'suggestions'
                ? 'bg-blue-900 text-white shadow-md'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <MessageSquare className="w-4 h-4" /> Sugestões
            {(suggestions?.filter(s => !s.is_read).length ?? 0) > 0 && (
              <span className={`ml-1 text-[10px] font-black rounded-full px-1.5 py-0.5 ${activeTab === 'suggestions' ? 'bg-red-500 text-white shadow-sm' : 'bg-red-100 text-red-700'}`}>
                {suggestions?.filter(s => !s.is_read).length}
              </span>
            )}
          </a>
        </div>

        {/* Overview tab */}
        {activeTab === 'overview' && profile.role === 'coordenador' && (
          <OverviewPanel
            profile={profile}
            members={members || []}
          />
        )}

        {/* Members tab */}
        {activeTab === 'members' && (
          <Card>
            <CardHeader>
              <CardTitle>Membros da Classe</CardTitle>
              <CardDescription>Gerencie os pontos, XP e investiduras dos desbravadores.</CardDescription>
            </CardHeader>
            <CardContent>
              <MemberList 
                members={members || []} 
                currentUserRole={profile.role} 
                adminProfile={profile}
              />
            </CardContent>
          </Card>
        )}

        {/* Tasks tab */}
        {activeTab === 'tasks' && (
          <TaskPanel
            profile={profile}
            tasks={tasks || []}
            completions={completions || []}
          />
        )}

        {/* Announcements tab */}
        {activeTab === 'events' && (
          <EventPanel 
            profile={profile}
            members={members || []}
            events={events || []}
          />
        )}

        {/* Announcements tab */}
        {activeTab === 'announcements' && (
          <AnnouncementPanel
            profile={profile}
            members={members || []}
            sentAnnouncements={sentAnnouncements || []}
          />
        )}

        {/* Suggestions tab */}
        {activeTab === 'suggestions' && (
          <SuggestionPanel
            profile={profile}
            initialSuggestions={suggestions || []}
          />
        )}
      </main>
    </div>
  )
}
