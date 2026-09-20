import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { NewSessionForm } from '@/components/vana-espada/NewSessionForm'
import { isAdminRole } from '@/utils/permissions'
import type { EspadaDifficulty } from '@/types/vana-espada'

// O middleware deixa passar /jogos/vana-espada sem login (o jogo aceita
// convidados), por isso as páginas de anfitrião verificam a sessão aqui.
export default async function NovaSessaoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/jogos/vana-espada/nova')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!isAdminRole(profile)) redirect('/jogos/vana-espada')

  // Só os versículos com excerto servem ao Modo A.
  const { data: verses } = await supabase
    .from('vanaespada_verses')
    .select('difficulty, excerpt')
    .eq('active', true)
    .not('excerpt', 'is', null)

  const usable = (verses ?? []).filter((v) => (v.excerpt ?? '').trim().length > 0)
  const countOf = (d: EspadaDifficulty) => usable.filter((v) => v.difficulty === d).length

  const verseCounts = {
    any: usable.length,
    easy: countOf('easy'),
    medium: countOf('medium'),
    hard: countOf('hard'),
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900">
      <Navbar user={user} profile={profile} />
      <NewSessionForm verseCounts={verseCounts} />
    </div>
  )
}
