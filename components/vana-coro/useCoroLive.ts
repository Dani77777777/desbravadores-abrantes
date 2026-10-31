'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { getPublicRound } from '@/lib/actions/vana-coro-game'
import type { VanaCoroPlayer, VanaCoroPublicRound, VanaCoroSession } from '@/types/vana-coro'

/**
 * Sessão do VanaCoro sincronizada (mesmo padrão do VanaSketch / VanaQuest):
 *   1. Realtime — UPDATE na linha da sessão (caminho rápido)
 *   2. Polling — rede de segurança
 *   3. Refetch ao voltar ao separador / à rede
 */
export function useCoroSession(initial: VanaCoroSession, pollMs = 3000): VanaCoroSession {
  const [session, setSession] = useState(initial)
  const id = initial.id

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const apply = (row: Record<string, unknown>) => {
      // Só aceita versões iguais ou mais recentes do quadro (o polling pode chegar atrasado)
      if (cancelled) return
      setSession((cur) => ((row.board_version as number) >= cur.board_version ? (row as unknown as VanaCoroSession) : cur))
    }
    const fetchNow = async () => {
      const { data } = await supabase.from('vanacoro_sessions').select('*').eq('id', id).maybeSingle()
      if (data) apply(data)
    }

    const channel = supabase
      .channel(`vanacoro-session-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vanacoro_sessions', filter: `id=eq.${id}` }, (p) => apply(p.new))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') fetchNow()
      })
    const t = setInterval(fetchNow, pollMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchNow()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', fetchNow)

    return () => {
      cancelled = true
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', fetchNow)
      supabase.removeChannel(channel)
    }
  }, [id, pollMs])

  return session
}

export function useCoroPlayers(sessionId: string, initial: VanaCoroPlayer[], pollMs = 5000): VanaCoroPlayer[] {
  const [players, setPlayers] = useState(initial)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const fetchNow = async () => {
      const { data } = await supabase.from('vanacoro_players').select('*').eq('session_id', sessionId).order('joined_at')
      if (!cancelled && data) setPlayers(data as VanaCoroPlayer[])
    }
    const channel = supabase
      .channel(`vanacoro-players-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanacoro_players', filter: `session_id=eq.${sessionId}` }, () => fetchNow())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') fetchNow()
      })
    const t = setInterval(fetchNow, pollMs)
    return () => {
      cancelled = true
      clearInterval(t)
      supabase.removeChannel(channel)
    }
  }, [sessionId, pollMs])

  return players
}

/** O quadro público: volta a pedi-lo ao servidor sempre que board_version sobe. */
export function useCoroBoard(session: VanaCoroSession): VanaCoroPublicRound | null {
  const [round, setRound] = useState<VanaCoroPublicRound | null>(null)
  const requested = useRef(-1)
  const playing = session.status === 'playing'

  useEffect(() => {
    if (!playing) return
    const version = session.board_version
    requested.current = version
    let cancelled = false
    getPublicRound(session.id)
      .then((r) => {
        // Ignora respostas de pedidos mais antigos que chegam fora de ordem
        if (!cancelled && requested.current === version) setRound(r)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session.id, session.board_version, playing])

  return playing ? round : null
}

export function teamName(session: Pick<VanaCoroSession, 'team_a_name' | 'team_b_name'>, team: 'a' | 'b' | null): string {
  return team === 'a' ? session.team_a_name : team === 'b' ? session.team_b_name : ''
}
