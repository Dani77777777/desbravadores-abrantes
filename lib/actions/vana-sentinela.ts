'use server'

import { createClient } from '@/utils/supabase/server'

/**
 * Apagar uma pontuação do ranking do VanaSentinela (casos de batota).
 * Só a coordenação: a RLS da tabela recusa o DELETE a todos os outros.
 */
export async function deleteVanaSentinelaScore(scoreId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sem sessão.' }

  const { data, error } = await supabase
    .from('vana_sentinela_scores')
    .delete()
    .eq('id', scoreId)
    .select('id')

  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Sem permissão para apagar esta pontuação.' }
  return {}
}
