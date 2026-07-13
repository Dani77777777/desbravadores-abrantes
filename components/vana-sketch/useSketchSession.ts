'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'

/**
 * Mantém a sessão VanaSketch sincronizada de forma resiliente
 * (mesmo padrão do useLiveSession do VanaQuest):
 *   1. Realtime — UPDATE na linha da sessão (caminho rápido)
 *   2. Polling periódico — rede de segurança
 *   3. Refetch em reconexão / visibilitychange / online
 */
export function useSketchSession(
  sessionId: string,
  onSession: (row: Record<string, any>) => void,
  opts: { paused?: boolean; pollMs?: number } = {}
) {
  const { paused = false, pollMs = 2500 } = opts
  const cbRef = useRef(onSession)
  cbRef.current = onSession

  useEffect(() => {
    if (!sessionId) return
    const supabase = createClient()
    let cancelled = false

    const fetchNow = async () => {
      const { data } = await supabase
        .from('vanasketch_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()
      if (!cancelled && data) cbRef.current(data)
    }

    const channel = supabase
      .channel(`vanasketch-session-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vanasketch_sessions', filter: `id=eq.${sessionId}` },
        (p) => { if (!cancelled) cbRef.current(p.new) }
      )
      .subscribe((status) => {
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

  useEffect(() => {
    if (!sessionId || paused) return
    const supabase = createClient()
    let cancelled = false

    const fetchNow = async () => {
      const { data } = await supabase
        .from('vanasketch_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()
      if (!cancelled && data) cbRef.current(data)
    }

    const t = setInterval(fetchNow, pollMs)
    return () => { cancelled = true; clearInterval(t) }
  }, [sessionId, paused, pollMs])
}

/** Lista de jogadores sincronizada (INSERT/UPDATE/DELETE + refetch). */
export function useSketchPlayers(
  sessionId: string,
  onPlayers: (rows: Record<string, any>[]) => void,
  opts: { pollMs?: number } = {}
) {
  const { pollMs = 4000 } = opts
  const cbRef = useRef(onPlayers)
  cbRef.current = onPlayers

  useEffect(() => {
    if (!sessionId) return
    const supabase = createClient()
    let cancelled = false

    const fetchNow = async () => {
      const { data } = await supabase
        .from('vanasketch_players')
        .select('*')
        .eq('session_id', sessionId)
        .order('joined_at')
      if (!cancelled && data) cbRef.current(data)
    }

    const channel = supabase
      .channel(`vanasketch-players-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vanasketch_players', filter: `session_id=eq.${sessionId}` },
        () => { if (!cancelled) fetchNow() }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && !cancelled) fetchNow()
      })

    const t = setInterval(fetchNow, pollMs)

    return () => {
      cancelled = true
      clearInterval(t)
      supabase.removeChannel(channel)
    }
  }, [sessionId, pollMs])
}

/** Feed de palpites da ronda actual (INSERT em tempo real + fetch inicial). */
export function useSketchGuesses(
  sessionId: string,
  roundNumber: number,
  onGuesses: (rows: Record<string, any>[]) => void,
) {
  const cbRef = useRef(onGuesses)
  cbRef.current = onGuesses
  const rowsRef = useRef<Record<string, any>[]>([])
  const roundRef = useRef(roundNumber)
  roundRef.current = roundNumber

  useEffect(() => {
    if (!sessionId) return
    const supabase = createClient()
    let cancelled = false

    const fetchNow = async () => {
      const round = roundRef.current
      const { data } = await supabase
        .from('vanasketch_guesses')
        .select('*')
        .eq('session_id', sessionId)
        .eq('round_number', round)
        .order('created_at')
      if (!cancelled && data && round === roundRef.current) {
        rowsRef.current = data
        cbRef.current(data)
      }
    }

    const channel = supabase
      .channel(`vanasketch-guesses-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vanasketch_guesses', filter: `session_id=eq.${sessionId}` },
        (p) => {
          if (cancelled) return
          const row = p.new as Record<string, any>
          if (row.round_number !== roundRef.current) return
          if (rowsRef.current.some((r) => r.id === row.id)) return
          rowsRef.current = [...rowsRef.current, row]
          cbRef.current(rowsRef.current)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && !cancelled) fetchNow()
      })

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [sessionId])

  // Nova ronda → limpar feed e recarregar
  useEffect(() => {
    rowsRef.current = []
    cbRef.current([])
    const supabase = createClient()
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('vanasketch_guesses')
        .select('*')
        .eq('session_id', sessionId)
        .eq('round_number', roundNumber)
        .order('created_at')
      if (!cancelled && data) {
        rowsRef.current = data
        cbRef.current(data)
      }
    })()
    return () => { cancelled = true }
  }, [sessionId, roundNumber])
}
