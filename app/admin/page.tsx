import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { redirect } from 'next/navigation'
import { MemberList } from './components/MemberList'

export default async function AdminPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'coordenador' && profile.role !== 'dirigente')) {
    redirect('/')
  }

  // Fetch members of the same section
  let query = supabase
    .from('profiles')
    .select('*')
    .eq('section', profile.section)
    .order('full_name')

  // Ideally, if role is coordinator of all sections, we might want to fetch all.
  // But per requirements "Listagem dos membros da sua secção", keeping it scoped.
  // If role is 'coordenador', maybe they should see all? Assuming 'sua secção' implies the section they lead.
  
  const { data: members } = await query

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Painel de Gestão</h1>
                <p className="text-gray-600">Gestão da unidade {profile.section} (Total: {members?.length || 0})</p>
            </div>
            {/* Future Actions: Add announcement, etc */}
        </div>

        <Card>
            <CardHeader>
                <CardTitle>Membros da Unidade</CardTitle>
                <CardDescription>
                    Gerencie os pontos, xp e investiduras dos desbravadores.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <MemberList members={members || []} currentUserRole={profile.role} />
            </CardContent>
        </Card>
      </main>
    </div>
  )
}
