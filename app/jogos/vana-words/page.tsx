import { createClient } from '@/utils/supabase/server'
import { VanaWordsHome } from '@/components/vana-words/VanaWordsHome'

export default async function VanaWordsEntryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let isDesbravador = false
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    isDesbravador = profile?.role === 'desbravador'
  }

  return <VanaWordsHome userId={user?.id ?? null} isDesbravador={isDesbravador} />
}
