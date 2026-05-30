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
import { StorePanel } from './components/StorePanel'
import { QrPanel } from './components/QrPanel'
import { SurveyPanel } from './components/SurveyPanel'
import { Users, ListChecks, Megaphone, MessageSquare, LayoutDashboard, CalendarDays, ShoppingBag, QrCode, Gamepad2, Swords, ClipboardList } from 'lucide-react'

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

  // Fetch Store Data
  let products = []
  let purchases = []
  
  if (profile.role === 'coordenador') {
    const { data: storeProducts } = await supabase.from('store_products').select('*').order('created_at', { ascending: false })
    products = storeProducts || []

    const { data: storePurchases } = await supabase
      .from('store_purchases')
      .select(`
        *,
        profiles:user_id(full_name, section),
        store_products:product_id(name, type, price)
      `)
      .order('created_at', { ascending: false })
    purchases = storePurchases || []
  }

  // Fetch Surveys (coord-only tab; load all surveys with options + responses)
  let surveys: any[] = []
  if (profile.role === 'coordenador') {
    const { data: surveysData } = await supabase
      .from('surveys')
      .select('*, survey_options(*), survey_responses(id, option_id, user_id)')
      .order('created_at', { ascending: false })
    surveys = surveysData || []
  }

  const resolvedParams = await searchParams
  const isCoordenador = profile.role === 'coordenador'
  const isDirigente = profile.role === 'dirigente'
  
  const defaultTab = isCoordenador ? 'overview' : 'members'
  let activeTab = resolvedParams?.tab || defaultTab

  // Security: If a dirigente tries to access coord-only tabs, redirect to default
  const coordOnlyTabs = ['overview', 'qr', 'store', 'surveys']
  if (isDirigente && coordOnlyTabs.includes(activeTab)) {
    redirect('/admin?tab=members')
  }

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
          {( [
            { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard, coordOnly: true, count: 0, countColor: 'blue' },
            { id: 'members', label: 'Membros', icon: Users, coordOnly: false, count: 0, countColor: 'blue' },
            { id: 'tasks', label: 'Tarefas', icon: ListChecks, coordOnly: false, count: 0, countColor: 'blue' },
            { id: 'events', label: 'Eventos', icon: CalendarDays, coordOnly: false, count: 0, countColor: 'blue' },
            { id: 'announcements', label: 'Comunicados', icon: Megaphone, coordOnly: false, count: sentAnnouncements?.length || 0, countColor: 'blue' },
            { id: 'suggestions', label: 'Sugestões', icon: MessageSquare, coordOnly: false, count: suggestions?.filter(s => !s.is_read).length || 0, countColor: 'red' },
            { id: 'qr', label: 'Questões / QR', icon: QrCode, coordOnly: true, count: 0, countColor: 'blue' },
            { id: 'surveys', label: 'Inquéritos', icon: ClipboardList, coordOnly: true, count: 0, countColor: 'blue' },
            { id: 'vantur', label: 'Vantur', icon: Gamepad2, coordOnly: true, count: 0, countColor: 'blue', href: '/admin/vantur' },
            { id: 'vana-quest', label: 'VanaQuest', icon: Swords, coordOnly: true, count: 0, countColor: 'blue', href: '/admin/vana-quest' },
            { id: 'vana-words', label: 'VanaWords', icon: Gamepad2, coordOnly: false, count: 0, countColor: 'blue', href: '/admin/vana-words' },
            { id: 'store', label: 'Loja', icon: ShoppingBag, coordOnly: true, count: purchases?.filter(p => p.status === 'pending').length || 0, countColor: 'orange' }
          ] as { id: string, label: string, icon: any, coordOnly: boolean, count: number, countColor: string, href?: string }[])
            .filter(tab => !tab.coordOnly || isCoordenador)
            .map((tab) => (
              <a
                key={tab.id}
                href={tab.href || `/admin?tab=${tab.id}`}
                className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-blue-900 text-white shadow-md'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                <tab.icon className="w-4 h-4" /> {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`ml-1 text-[10px] font-black rounded-full px-1.5 py-0.5 ${
                    activeTab === tab.id 
                      ? 'bg-white/20 text-white' 
                      : tab.countColor === 'red' ? 'bg-red-100 text-red-700' : 
                        tab.countColor === 'orange' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </a>
            ))}
        </div>

        {/* Overview tab */}
        {activeTab === 'overview' && profile.role === 'coordenador' && (
          <OverviewPanel
            profile={profile}
            members={members || []}
            events={events || []}
            purchases={purchases || []}
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

        {activeTab === 'suggestions' && (
          <SuggestionPanel
            profile={profile}
            initialSuggestions={suggestions || []}
          />
        )}

        {/* QR tab */}
        {activeTab === 'qr' && profile.role === 'coordenador' && (
          <QrPanel profile={profile} />
        )}

        {/* Surveys tab */}
        {activeTab === 'surveys' && profile.role === 'coordenador' && (
          <SurveyPanel profile={profile} surveys={surveys} />
        )}

        {/* Store tab */}
        {activeTab === 'store' && profile.role === 'coordenador' && (
          <StorePanel
            profile={profile}
            products={products}
            initialPurchases={purchases}
          />
        )}
      </main>
    </div>
  )
}
