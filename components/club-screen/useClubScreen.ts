'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import {
  clubLocalChannelName,
  normalizeClubState,
  type ClubLocalMessage,
  type ClubScreenState,
} from '@/utils/club-screen'

/**
 * Estado do Ecrã do Clube, igual em todas as janelas da mesma conta:
 *   • no mesmo computador por BroadcastChannel (instantâneo);
 *   • entre dispositivos (telemóvel ↔ PC do projetor) pela linha `club_screens` + realtime.
 *
 * Cada janela tem um id (`by`). Mensagens do mesmo `by` só são aceites se forem mais
 * recentes (mesmo relógio), por isso um eco atrasado da base de dados nunca desfaz uma
 * mudança feita a seguir; mensagens de outros dispositivos são aceites pela ordem de chegada.
 */
export function useClubScreen(userId: string, initialState: ClubScreenState, role: 'controller' | 'projector') {
  const [supabase] = useState(() => createClient())
  const [clientId] = useState(() => `${role}-${Math.random().toString(36).slice(2, 10)}`)
  const [state, setState] = useState(initialState)
  const stateRef = useRef(state)
  const lastSeenRef = useRef<Record<string, number>>({ [initialState.by]: initialState.sentAt })
  const bcRef = useRef<BroadcastChannel | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const accept = useCallback(
    (incoming: ClubScreenState) => {
      if (incoming.by === clientId) return
      const seen = lastSeenRef.current[incoming.by]
      if (seen !== undefined && incoming.sentAt <= seen) return
      lastSeenRef.current[incoming.by] = incoming.sentAt
      stateRef.current = incoming
      setState(incoming)
    },
    [clientId],
  )

  const refetch = useCallback(async () => {
    const { data } = await supabase.from('club_screens').select('state').eq('host_id', userId).maybeSingle()
    if (data?.state) accept(normalizeClubState(data.state))
  }, [supabase, userId, accept])

  // Mesmo computador
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel(clubLocalChannelName(userId))
    bcRef.current = bc
    bc.onmessage = (ev: MessageEvent<ClubLocalMessage>) => {
      const m = ev.data
      if (m?.type === 'state') accept(normalizeClubState(m.state))
      else if (m?.type === 'hello' && role === 'controller') bc.postMessage({ type: 'state', state: stateRef.current } satisfies ClubLocalMessage)
    }
    if (role === 'projector') bc.postMessage({ type: 'hello' } satisfies ClubLocalMessage)
    return () => {
      bc.close()
      bcRef.current = null
    }
  }, [userId, role, accept])

  // Outros dispositivos
  useEffect(() => {
    const channel = supabase
      .channel(`club-screen-${userId}-${clientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'club_screens', filter: `host_id=eq.${userId}` },
        (payload) => {
          const raw = (payload.new as { state?: unknown } | null)?.state
          if (raw) accept(normalizeClubState(raw))
          else refetch()
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refetch()
      })
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, userId, clientId, accept, refetch])

  // Gravar na base de dados (agrupa mudanças seguidas).
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const save = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      supabase
        .from('club_screens')
        .upsert({ host_id: userId, state: stateRef.current, updated_at: new Date().toISOString() })
        .then(({ error }) => {
          if (error) console.warn('club_screens:', error.message)
          setSaveError(error ? error.message : null)
        })
    }, 250)
  }, [supabase, userId])

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    },
    [],
  )

  const update = useCallback(
    (change: (s: ClubScreenState) => Omit<ClubScreenState, 'sentAt' | 'by'>) => {
      const next: ClubScreenState = { ...change(stateRef.current), sentAt: Date.now(), by: clientId }
      stateRef.current = next
      setState(next)
      bcRef.current?.postMessage({ type: 'state', state: next } satisfies ClubLocalMessage)
      save()
    },
    [clientId, save],
  )

  return { state, update, saveError }
}
