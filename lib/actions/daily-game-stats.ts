import { createServiceClient } from '@/utils/supabase/service'
import { lisbonDateString, lisbonDayStart } from '@/utils/vana-codigo/day'

export type DailyPlayersStats = {
  date: string
  players: number
}

/**
 * Conta jogadores distintos que tiveram uma sessão atualizada no dia do clube
 * (Europe/Lisbon). Os jogos diários mantêm uma sessão por utilizador e modo,
 * por isso contamos `user_id`, e não o número de sessões/modos.
 */
export async function getDailyPlayersStats(table: 'vantur_sessions' | 'vana_codigo_sessions'): Promise<DailyPlayersStats> {
  const service = createServiceClient()
  const { data, error } = await service
    .from(table)
    .select('user_id')
    .gte('updated_at', lisbonDayStart().toISOString())

  if (error) throw new Error(error.message)

  return {
    date: lisbonDateString(),
    players: new Set((data ?? []).map((session) => session.user_id)).size,
  }
}
