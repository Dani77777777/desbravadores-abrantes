import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
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
import { AuditPanel } from './components/AuditPanel'
import { GamesPanel } from './components/GamesPanel'
import { GameAnalyticsPanel } from './components/GameAnalyticsPanel'
import { ANALYTICS_PERIODS, buildGameAnalytics, lastDays, type AnalyticsPeriod, type GameAnalytics, type GamePlay } from '@/utils/game-analytics'
import { lisbonDateString } from '@/utils/vana-codigo/day'
import { ToolsPanel } from './components/ToolsPanel'
import { Users, ListChecks, Megaphone, MessageSquare, LayoutDashboard, CalendarDays, ShoppingBag, QrCode, Gamepad2, ClipboardList, ScrollText, Wrench } from 'lucide-react'
import { effectiveRole, effectiveLeadershipSection, isHelper, helperLabel } from '@/utils/permissions'
import { fetchGameSettings } from '@/utils/games'
import { displayFont } from '@/components/landing/fonts'

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

  // Cargo EFETIVO (considera ajudantes). As RLS na BD já usam o cargo efetivo;
  // aqui usamos o mesmo no scoping/gating para o ajudante ver o que o cargo vê.
  const effRole = effectiveRole(profile)
  const effLeadership = effectiveLeadershipSection(profile)

  if (!profile || (effRole !== 'coordenador' && effRole !== 'dirigente')) {
    redirect('/')
  }

  // Fetch members (coordenador sees all, dirigente sees their LEADERSHIP section)
  let membersQuery = supabase.from('profiles').select('*').order('full_name')
  if (effRole === 'dirigente') {
    const targetSection = effLeadership || profile.section
    membersQuery = membersQuery.eq('section', targetSection)
  }
  const { data: members } = await membersQuery

  // Lista de TODOS os membros do clube — para o seletor de nomeação de ajudantes.
  // Só carregada para coordenador/dirigente REAIS (ajudantes não nomeiam ninguém).
  let clubMembers: any[] = []
  if (profile.role === 'coordenador' || profile.role === 'dirigente') {
    const { data: cm } = await supabase.rpc('list_club_members_for_assignment')
    clubMembers = cm || []
  }

  // Fetch tasks visible to this user
  let tasksQuery = supabase.from('tasks').select('*').order('created_at', { ascending: false })
  if (effRole === 'dirigente') {
    const targetSection = effLeadership || profile.section
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

  if (effRole === 'dirigente') {
    const targetSection = effLeadership || profile.section
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

  // Destinatários e estado de leitura dos comunicados enviados
  const sentIds = (sentAnnouncements || []).map((a) => a.id)
  const { data: sentRecipients } = sentIds.length
    ? await supabase
      .from('announcement_recipients')
      .select('announcement_id, user_id, read_at')
      .in('announcement_id', sentIds)
    : { data: [] as any[] }

  // Membros cuja idade sugere outra classe (só a coordenação recebe linhas)
  const { data: sectionSuggestions } = effRole === 'coordenador'
    ? await supabase.rpc('list_section_suggestions')
    : { data: [] as any[] }

  // Fetch suggestions
  let suggestionsQuery = supabase
    .from('suggestions')
    .select(`
      *,
      profiles:user_id(full_name, section)
    `)
    .order('created_at', { ascending: false })

  if (effRole === 'dirigente') {
    const targetSection = effLeadership || profile.section
    suggestionsQuery = suggestionsQuery
      .eq('target', 'dirigente')
      .eq('profiles.section', targetSection)
  }

  const { data: suggestions } = await suggestionsQuery

  // Fetch Events
  let eventsQuery = supabase.from('events').select('*').order('start_at', { ascending: false })
  if (effRole === 'dirigente') {
    const targetSection = effLeadership || profile.section
    eventsQuery = eventsQuery.or(`target_section.is.null,target_section.eq.${targetSection}`)
  }
  const { data: events } = await eventsQuery

  // Fetch Store Data
  let products = []
  let purchases = []
  let storeRateInfo = null
  let storeSettings = null

  if (effRole === 'coordenador') {
    const { data: storeProducts } = await supabase.from('store_products').select('*').order('created_at', { ascending: false })
    products = storeProducts || []

    const { data: storePurchases } = await supabase
      .from('store_purchases')
      .select(`
        *,
        profiles:user_id(full_name, section, avatar_url),
        store_products:product_id(name, type, price_eur, max_discount_percent, is_preorder)
      `)
      .order('created_at', { ascending: false })
    purchases = storePurchases || []

    const [{ data: rateData }, { data: settingsData }] = await Promise.all([
      supabase.rpc('get_gold_rate_info'),
      supabase.from('store_settings').select('*').eq('id', true).maybeSingle(),
    ])
    storeRateInfo = rateData || null
    storeSettings = settingsData || null
  }

  // Fetch Surveys (coord-only tab; load all surveys with options + responses)
  let surveys: any[] = []
  if (effRole === 'coordenador') {
    const { data: surveysData } = await supabase
      .from('surveys')
      .select('*, survey_options(*), survey_responses(id, option_id, user_id)')
      .order('created_at', { ascending: false })
    surveys = surveysData || []
  }

  // Perfil EFETIVO passado aos painéis — para um ajudante agir como o cargo que ajuda.
  const effProfile = isHelper(profile)
    ? { ...profile, role: effRole, leadership_section: effLeadership }
    : profile

  const resolvedParams = await searchParams
  const isCoordenador = effRole === 'coordenador'
  const isDirigente = effRole === 'dirigente'

  const defaultTab = isCoordenador ? 'overview' : 'members'
  let activeTab = resolvedParams?.tab || defaultTab

  // Security: If a dirigente tries to access coord-only tabs, redirect to default
  const coordOnlyTabs = ['overview', 'qr', 'store', 'surveys']
  if (isDirigente && coordOnlyTabs.includes(activeTab)) {
    redirect('/admin?tab=members')
  }
  // Auditoria: só coordenadores REAIS (ajudantes de coordenação não se auditam a si próprios)
  const isRealCoordenador = profile.role === 'coordenador'
  if (activeTab === 'audit' && !isRealCoordenador) {
    redirect(`/admin?tab=${defaultTab}`)
  }

  // Disponibilidade dos jogos (aba "Jogos")
  const gameSettings = activeTab === 'games' ? await fetchGameSettings(supabase) : null

  // Analítica dos jogos a solo: 7 e 30 dias, cada um comparado com o período anterior
  // (por isso 60 dias de dados). A RLS já limita o dirigente à sua classe.
  // null = tabela por criar (migração por correr).
  let gameAnalytics: Record<AnalyticsPeriod, GameAnalytics> | null = null
  let sentinelaGuestRounds: Record<AnalyticsPeriod, number> | null = null
  if (activeTab === 'games') {
    const from = lastDays(lisbonDateString(), 60)[0]
    const rows: GamePlay[] = []
    let failed = false
    for (let page = 0; page < 20; page++) {
      const { data, error } = await supabase
        .from('game_plays')
        .select('game_id, user_id, mode, play_date, started_at, is_finished, is_won, attempts')
        .gte('play_date', from)
        .order('id')
        .range(page * 1000, page * 1000 + 999)
      if (error) { failed = true; break }
      rows.push(...(data as GamePlay[]))
      if (!data || data.length < 1000) break
    }
    gameAnalytics = failed
      ? null
      : (Object.fromEntries(ANALYTICS_PERIODS.map((p) => [p, buildGameAnalytics(rows, new Date(), p)])) as Record<AnalyticsPeriod, GameAnalytics>)

    // Rondas de convidados (sem conta) no VanaSentinela — não entram em game_plays.
    // Só a coordenação as consegue ler (RLS da tabela de pontuações).
    if (isCoordenador) {
      const counts = await Promise.all(
        ANALYTICS_PERIODS.map(async (p) => {
          const { count, error } = await supabase
            .from('vana_sentinela_scores')
            .select('id', { count: 'exact', head: true })
            .is('user_id', null)
            .gte('created_at', `${lastDays(lisbonDateString(), p)[0]}T00:00:00Z`)
          return error ? null : count ?? 0
        }),
      )
      if (counts.every((c) => c !== null)) {
        sentinelaGuestRounds = Object.fromEntries(ANALYTICS_PERIODS.map((p, i) => [p, counts[i]])) as Record<AnalyticsPeriod, number>
      }
    }
  }

  // Presenças dos últimos eventos concluídos (taxas de presença na Visão Geral e nos Eventos).
  // Limitado aos 15 mais recentes para ficar bem abaixo do limite de 1000 linhas por pedido.
  let attendance: any[] = []
  if (activeTab === 'overview' || activeTab === 'events') {
    const recentFinishedIds = (events || []).filter((e) => e.is_finished).slice(0, 15).map((e) => e.id)
    if (recentFinishedIds.length) {
      const { data: att } = await supabase
        .from('event_attendance')
        .select('event_id, user_id, status')
        .in('event_id', recentFinishedIds)
      attendance = att || []
    }
  }

  // Respostas "Vou / Não vou" dos eventos por fechar que pedem confirmação
  let rsvps: any[] = []
  if (activeTab === 'events') {
    const rsvpIds = (events || []).filter((e) => e.rsvp_enabled && !e.is_finished).map((e) => e.id)
    if (rsvpIds.length) {
      const { data: rs } = await supabase.from('event_rsvps').select('event_id, user_id, going').in('event_id', rsvpIds)
      rsvps = rs || []
    }
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
            <h1 className={`${displayFont.className} text-3xl font-extrabold tracking-tight text-blue-950`}>Painel de Gestão</h1>
            <p className="text-stone-500">
              {isHelper(profile) && <span className="font-bold text-blue-700">{helperLabel(profile)} • </span>}
              {isCoordenador
                ? `Coordenação • Todos os membros (${members?.length || 0})`
                : `Classes: ${SECTION_LABELS[effLeadership || profile.section] || profile.section} • (${members?.length || 0} membros)`}
            </p>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="bg-white p-1.5 rounded-2xl border border-gray-200 shadow-sm overflow-x-auto no-scrollbar scroll-smooth flex gap-1 mb-2">
          {([
            { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard, coordOnly: true, count: 0, countColor: 'blue' },
            { id: 'members', label: 'Membros', icon: Users, coordOnly: false, count: 0, countColor: 'blue' },
            { id: 'tasks', label: 'Tarefas', icon: ListChecks, coordOnly: false, count: 0, countColor: 'blue' },
            { id: 'events', label: 'Eventos', icon: CalendarDays, coordOnly: false, count: 0, countColor: 'blue' },
            { id: 'announcements', label: 'Comunicados', icon: Megaphone, coordOnly: false, count: sentAnnouncements?.length || 0, countColor: 'blue' },
            { id: 'suggestions', label: 'Sugestões', icon: MessageSquare, coordOnly: false, count: suggestions?.filter(s => !s.is_read).length || 0, countColor: 'red' },
            { id: 'qr', label: 'Questões / QR', icon: QrCode, coordOnly: true, count: 0, countColor: 'blue' },
            { id: 'surveys', label: 'Inquéritos', icon: ClipboardList, coordOnly: true, count: 0, countColor: 'blue' },
            { id: 'games', label: 'Jogos', icon: Gamepad2, coordOnly: false, count: 0, countColor: 'blue' },
            { id: 'tools', label: 'Ferramentas', icon: Wrench, coordOnly: false, count: 0, countColor: 'blue' },
            { id: 'store', label: 'Loja', icon: ShoppingBag, coordOnly: true, count: purchases?.filter(p => p.status === 'pending').length || 0, countColor: 'orange' },
            { id: 'audit', label: 'Auditoria', icon: ScrollText, coordOnly: true, realCoordOnly: true, count: 0, countColor: 'blue' }
          ] as { id: string, label: string, icon: any, coordOnly: boolean, realCoordOnly?: boolean, count: number, countColor: string, href?: string }[])
            .filter(tab => (!tab.coordOnly || isCoordenador) && (!tab.realCoordOnly || isRealCoordenador))
            .map((tab) => (
              <a
                key={tab.id}
                href={tab.href || `/admin?tab=${tab.id}`}
                className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap ${activeTab === tab.id
                    ? 'bg-blue-950 text-white shadow-md'
                    : 'text-gray-500 hover:bg-gray-100'
                  }`}
              >
                <tab.icon className="w-4 h-4" /> {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`ml-1 text-[10px] font-black rounded-full px-1.5 py-0.5 ${activeTab === tab.id
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
        {activeTab === 'overview' && isCoordenador && (
          <OverviewPanel
            profile={effProfile}
            members={members || []}
            events={events || []}
            purchases={purchases || []}
            rateInfo={storeRateInfo}
            attendance={attendance}
            suggestions={suggestions || []}
            tasks={tasks || []}
            completions={completions || []}
            sectionSuggestions={sectionSuggestions || []}
          />
        )}

        {/* Members tab */}
        {activeTab === 'members' && (
          <MemberList
            members={members || []}
            currentUserRole={profile.role}
            adminProfile={profile}
            clubMembers={clubMembers}
            sectionSuggestions={sectionSuggestions || []}
            events={events || []}
          />
        )}

        {/* Tasks tab */}
        {activeTab === 'tasks' && (
          <TaskPanel
            profile={effProfile}
            tasks={tasks || []}
            completions={completions || []}
            members={members || []}
          />
        )}

        {/* Announcements tab */}
        {activeTab === 'events' && (
          <EventPanel
            profile={effProfile}
            members={members || []}
            events={events || []}
            attendance={attendance}
            rsvps={rsvps}
          />
        )}

        {/* Announcements tab */}
        {activeTab === 'announcements' && (
          <AnnouncementPanel
            profile={effProfile}
            members={members || []}
            sentAnnouncements={sentAnnouncements || []}
            sentRecipients={sentRecipients || []}
          />
        )}

        {activeTab === 'suggestions' && (
          <SuggestionPanel
            profile={effProfile}
            initialSuggestions={suggestions || []}
          />
        )}

        {/* QR tab */}
        {activeTab === 'qr' && isCoordenador && (
          <QrPanel profile={effProfile} />
        )}

        {/* Games tab: analítica dos jogos a solo + disponibilidade */}
        {activeTab === 'games' && (
          <GameAnalyticsPanel
            analytics={gameAnalytics}
            sentinelaGuestRounds={sentinelaGuestRounds}
            memberNames={Object.fromEntries((members || []).map((m) => [m.id, m.full_name || 'Membro']))}
            totalMembers={members?.length || 0}
            scopeLabel={isCoordenador ? 'todo o clube' : `classe ${SECTION_LABELS[effLeadership || profile.section] || profile.section}`}
          />
        )}
        {activeTab === 'games' && gameSettings && (
          <GamesPanel
            initialSettings={gameSettings}
            canEdit={isCoordenador}
            isCoordenador={isCoordenador}
          />
        )}

        {/* Tools tab */}
        {activeTab === 'tools' && <ToolsPanel />}

        {/* Audit tab */}
        {activeTab === 'audit' && isRealCoordenador && (
          <AuditPanel members={members || []} />
        )}

        {activeTab === 'surveys' && isCoordenador && (
          <SurveyPanel profile={effProfile} surveys={surveys} />
        )}

        {/* Store tab */}
        {activeTab === 'store' && isCoordenador && (
          <StorePanel
            profile={effProfile}
            products={products}
            initialPurchases={purchases}
            members={members || []}
            events={events || []}
            rateInfo={storeRateInfo}
            settings={storeSettings}
          />
        )}
      </main>
    </div>
  )
}
