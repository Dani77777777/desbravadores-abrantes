'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { toEspadaSession, toPublicRound } from '@/utils/vana-espada'
import type { EspadaPublicRound, EspadaRoundJson, EspadaSession, EspadaSessionRow } from '@/types/vana-espada'

/**
 * Mantém a sessão do VanaEspada sincronizada de forma resiliente — mesma receita
 * do `useLiveSession` do VanaQuest, porque o Realtime do Supabase é best-effort e
 * sob carga (30 telemóveis) perde eventos:
 *
 *   1. Realtime (caminho rápido) — UPDATE na linha da sessão.
 *   2. Polling de 2,5 s (rede de segurança).
 *   3. Refetch ao (re)subscrever, ao voltar ao separador e ao recuperar a rede.
 *
 * Além da sessão, traz a ronda atual pela RPC `get_vanaespada_round_public`, que
 * NUNCA devolve a referência certa antes da revelação. A ronda é relida sempre que
 * mudam `status` ou `current_round`.
 *
 * O canal realtime depende só de `sessionId`: mantém-se estável durante todo o
 * jogo, para não perder eventos na janela de re-subscrição.
 */
export function useEspadaSession(sessionId: string, initialSession: EspadaSession) {
  const [session, setSession] = useState<EspadaSession>(initialSession)
  const [round, setRound] = useState<EspadaPublicRound | null>(null)

  const applyRow = useCallback((row: EspadaSessionRow) => {
    setSession((prev) => ({ ...prev, ...toEspadaSession(row) }))
  }, [])

  // ── Sessão: realtime + refetch em (re)conexão / foco / online ──
  useEffect(() => {
    if (!sessionId) return
    const supabase = createClient()
    let cancelled = false

    const fetchNow = async () => {
      const { data } = await supabase
        .from('vanaespada_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle()
      if (!cancelled && data) applyRow(data)
    }

    const channel = supabase
      .channel(`espada-session-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vanaespada_sessions', filter: `id=eq.${sessionId}` },
        (p) => { if (!cancelled) applyRow(p.new as EspadaSessionRow) }
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
  }, [sessionId, applyRow])

  // ── Polling: rede de segurança independente do realtime ──
  useEffect(() => {
    if (!sessionId) return
    const supabase = createClient()
    let cancelled = false

    const t = setInterval(async () => {
      const { data } = await supabase
        .from('vanaespada_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle()
      if (!cancelled && data) applyRow(data)
    }, 2500)

    return () => { cancelled = true; clearInterval(t) }
  }, [sessionId, applyRow])

  // ── Ronda pública: relida quando muda a ronda ou o estado ──
  const roundKey = `${session.currentRound}:${session.status}`
  useEffect(() => {
    if (!sessionId || session.currentRound < 0) {
      setRound(null)
      return
    }
    const supabase = createClient()
    let cancelled = false

    supabase
      .rpc('get_vanaespada_round_public', { p_session_id: sessionId })
      .then(({ data }) => {
        if (!cancelled) setRound(toPublicRound(data as EspadaRoundJson | null))
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, roundKey])

  return { session, round }
}

/**
 * Relógio alinhado com o servidor.
 *
 * `serverNow` vem do render da página (Date.now() no servidor). A diferença para o
 * relógio local é o offset: assim um telemóvel com a hora errada continua a ver a
 * contagem decrescente certa. (Os pontos nunca dependem disto — o tempo de resposta
 * é sempre medido no servidor.)
 */
export function useServerClock(serverNow: number) {
  const offsetRef = useRef(0)

  useEffect(() => {
    offsetRef.current = serverNow - Date.now()
  }, [serverNow])

  const now = useCallback(() => Date.now() + offsetRef.current, [])
  return { now }
}

/**
 * Segundos que faltam até `endsAt` (ISO do servidor). Só serve para mostrar a
 * contagem: quem decide que a fase acabou é o `usePhaseWatchdog`.
 */
export function useCountdown(endsAt: string | null, now: () => number): number {
  const [left, setLeft] = useState(0)

  useEffect(() => {
    if (!endsAt) {
      setLeft(0)
      return
    }
    const end = new Date(endsAt).getTime()
    const tick = () => setLeft(Math.max(0, (end - now()) / 1000))
    tick()
    const t = setInterval(tick, 100)
    return () => clearInterval(t)
  }, [endsAt, now])

  return left
}

/**
 * Pede a transição seguinte enquanto o prazo da fase já passou.
 *
 * Repete em vez de disparar uma só vez ao chegar a zero, de propósito: se o
 * relógio do cliente estiver uns centésimos adiantado, o primeiro pedido é
 * recusado pela base de dados (que só aceita a transição depois do prazo) e sem
 * repetição o jogo ficava preso. As transições são condicionais e idempotentes,
 * por isso pedir de novo não custa nada.
 *
 * `graceMs` serve para o projetor esperar um pouco antes de fazer o trabalho do
 * painel do anfitrião — normalmente é o anfitrião que avança.
 */
export function usePhaseWatchdog(
  endsAt: string | null,
  now: () => number,
  advance: () => void,
  { enabled = true, graceMs = 0 }: { enabled?: boolean; graceMs?: number } = {}
) {
  const advanceRef = useRef(advance)
  useEffect(() => { advanceRef.current = advance })

  useEffect(() => {
    if (!enabled || !endsAt) return
    const deadline = new Date(endsAt).getTime() + graceMs

    const check = () => { if (now() >= deadline) advanceRef.current() }
    const t = setInterval(check, 1000)
    return () => clearInterval(t)
  }, [enabled, endsAt, graceMs, now])
}
