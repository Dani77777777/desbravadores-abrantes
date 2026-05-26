'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { VanaCampPlayerPublic } from '@/types/vana-camp'

/**
 * Hook que mantém a lista de jogadores (view pública sem `role`) sempre fresca.
 *
 * Subscrição: ouve `vanacamp_events` da sessão e re-busca a lista quando há
 * eventos relevantes (joins/leaves não geram event no lobby, por isso fazemos
 * polling leve a cada 3s só na fase de lobby). Para fases pós-lobby, a maioria
 * das mudanças (mortes, etc.) emitem events e a re-busca acontece via realtime.
 */
export function usePlayerList(sessionId: string, pollWhileLobby = true) {
  const [players, setPlayers] = useState<VanaCampPlayerPublic[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    let mounted = true

    async function refresh() {
      const { data } = await supabase
        .from('vanacamp_players_public')
        .select('*')
        .eq('session_id', sessionId)
        .order('joined_at', { ascending: true })
      if (mounted && data) {
        setPlayers(data as VanaCampPlayerPublic[])
        setLoading(false)
      }
    }

    refresh()

    // Realtime: events da sessão → re-busca
    const channel = supabase
      .channel(`vanacamp_players_${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vanacamp_events', filter: `session_id=eq.${sessionId}` },
        () => refresh()
      )
      .subscribe()

    // Polling leve no lobby para detetar joins/leaves (não emitem event)
    let interval: ReturnType<typeof setInterval> | null = null
    if (pollWhileLobby) {
      interval = setInterval(refresh, 3000)
    }

    return () => {
      mounted = false
      supabase.removeChannel(channel)
      if (interval) clearInterval(interval)
    }
  }, [sessionId, pollWhileLobby])

  return { players, loading }
}
