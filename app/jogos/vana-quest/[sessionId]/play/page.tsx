import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { PlayerScreen } from '@/components/vana-quest/PlayerScreen'

export default async function PlayPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile: any = null
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    profile = data
    // Fallback do avatar para o user_metadata da conta. Nota: o site NÃO tem login com
    // Google (só email e palavra-passe), por isso isto normalmente vem vazio.
    if (profile && !profile.avatar_url) {
      profile.avatar_url = user.user_metadata?.avatar_url || null
    }
  }

  const { data: session } = await supabase
    .from('vana_quest_sessions')
    .select('*, vana_quests(title)')
    .eq('id', sessionId)
    .single()

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center text-white">
          <p className="text-2xl font-bold">Sessão não encontrada.</p>
          <a href="/jogos/vana-quest" className="mt-4 text-sky-300 underline block">Voltar</a>
        </div>
      </div>
    )
  }

  const { data: questions } = await supabase
    .from('vana_quest_questions')
    .select('*')
    .eq('vana_quest_id', session.vana_quest_id)
    .order('question_order')

  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, full_name, section, avatar_url')
    .eq('role', 'desbravador')
    .order('full_name')

  // Fallback: para profiles sem avatar_url, buscar do auth.users metadata. O site não tem
  // login com Google, por isso as fotos vêm sempre do perfil (avatar_url).
  const missingAvatarIds = (profilesData || []).filter((p) => !p.avatar_url).map((p) => p.id)
  const metaAvatars = new Map<string, string>()
  if (missingAvatarIds.length > 0) {
    try {
      const service = createServiceClient()
      const { data: usersData } = await service.auth.admin.listUsers({ perPage: 1000 })
      ;(usersData?.users || []).forEach((u) => {
        const meta = u.user_metadata?.avatar_url || u.user_metadata?.picture
        if (meta && missingAvatarIds.includes(u.id)) {
          metaAvatars.set(u.id, meta)
        }
      })
    } catch {}
  }

  const allMembers = (profilesData || []).map((p) => ({
    ...p,
    avatar_url: p.avatar_url || metaAvatars.get(p.id) || null,
  }))

  return (
    <PlayerScreen
      sessionId={sessionId}
      userId={user?.id || null}
      userProfile={profile}
      initialSession={session}
      questions={questions || []}
      allMembers={allMembers || []}
    />
  )
}
