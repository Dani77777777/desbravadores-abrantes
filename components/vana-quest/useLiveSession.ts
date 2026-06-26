'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'

/**
 * Mantém o estado da sessão VanaQuest sincronizado de forma resiliente.
 *
 * O Supabase Realtime é "best-effort" — sob carga (muitos jogadores) ou em redes
 * móveis instáveis, eventos `postgres_changes` podem perder-se. Quando isso acontece,
 * o ecrã fica preso no estado anterior (ex.: nunca mostra as opções da pergunta).
 *
 * Esta hook combina três mecanismos para garantir consistência eventual:
 *   1. Realtime (caminho rápido) — UPDATE na linha da sessão.
 *   2. Polling periódico (rede de segurança) — relê a sessão a cada `pollMs`.
 *   3. Refetch em eventos de reconexão — ao (re)subscrever o canal, ao voltar ao
 *      separador (visibilitychange) e ao recuperar a ligação (online).
 *
 * O canal realtime depende APENAS de `sessionId`, por isso mantém-se estável durante
 * todo o jogo (nunca é recriado a meio, o que evitaria perder eventos na janela de
 * re-subscrição).
 */
export function useLiveSession(
  sessionId: string,
  onSession: (row: Record<string, any>) => void,
  opts: { paused?: boolean; pollMs?: number } = {}
) {
  const { paused = false, pollMs = 2500 } = opts
  const cbRef = useRef(onSession)
  cbRef.current = onSession

  // Canal realtime + refetch em (re)conexão / foco / online. Estável por sessão.
  useEffect(() => {
    if (!sessionId) return
    const supabase = createClient()
    let cancelled = false

    const fetchNow = async () => {
      const { data } = await supabase
        .from('vana_quest_sessions')
        .select('*, vana_quests(title)')
        .eq('id', sessionId)
        .single()
      if (!cancelled && data) cbRef.current(data)
    }

    const channel = supabase
      .channel(`live-session-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vana_quest_sessions', filter: `id=eq.${sessionId}` },
        (p) => { if (!cancelled) cbRef.current(p.new) }
      )
      .subscribe((status) => {
        // Ao (re)subscrever, relê para apanhar qualquer transição perdida enquanto esteve desligado.
        if (status === 'SUBSCRIBED' && !cancelled) fetchNow()
      })

    const onVisible = () => { if (document.visibilityState === 'visible') fetchNow() }
    const onOnline = () => fetchNow()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      supabase.removeChannel(channel)
    }
  }, [sessionId])

  // Polling — rede de segurança independente do realtime.
  useEffect(() => {
    if (!sessionId || paused) return
    const supabase = createClient()
    let cancelled = false

    const fetchNow = async () => {
      const { data } = await supabase
        .from('vana_quest_sessions')
        .select('*, vana_quests(title)')
        .eq('id', sessionId)
        .single()
      if (!cancelled && data) cbRef.current(data)
    }

    const t = setInterval(fetchNow, pollMs)
    return () => { cancelled = true; clearInterval(t) }
  }, [sessionId, paused, pollMs])
}
