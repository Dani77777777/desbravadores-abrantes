'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { SegEvent } from '@/types/vana-sketch'
import type { LiveStroke } from './board'

/**
 * Sincronização do quadro de desenho.
 *
 * Dois canais complementares:
 *   1. Broadcast (rápido, efémero) — troços do traço em curso chegam em
 *      tempo real enquanto o desenhador arrasta o dedo.
 *   2. Tabela vanasketch_strokes (persistente) — cada traço terminado é
 *      gravado; quem chega tarde ou perde eventos reconstrói o quadro a
 *      partir da BD (refetch ao subscrever, ao voltar ao separador e quando
 *      canvas_version muda).
 *
 * `onChange` é chamado sempre que o quadro muda — o componente redesenha.
 */
export function useSketchSync(
  sessionId: string,
  roundNumber: number,
  canvasVersion: number,
) {
  const strokesRef = useRef<Map<string, LiveStroke>>(new Map())
  const [revision, setRevision] = useState(0)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const roundRef = useRef(roundNumber)
  roundRef.current = roundNumber
  // Contador local de ordem dos traços persistidos
  const seqRef = useRef(0)

  const bump = useCallback(() => setRevision((r) => r + 1), [])

  const fetchStrokes = useCallback(async () => {
    const supabase = createClient()
    const round = roundRef.current
    const { data } = await supabase
      .from('vanasketch_strokes')
      .select('id, color, size, points, seq')
      .eq('session_id', sessionId)
      .eq('round_number', round)
      .order('seq')
    if (!data || round !== roundRef.current) return
    // Reconstruir traços terminados; manter os que estão a ser desenhados agora
    const next = new Map<string, LiveStroke>()
    for (const row of data) {
      next.set(row.id, {
        id: row.id,
        color: row.color,
        size: row.size,
        points: row.points as [number, number][],
        done: true,
      })
      seqRef.current = Math.max(seqRef.current, (row.seq ?? 0) + 1)
    }
    for (const [id, s] of strokesRef.current) {
      if (!s.done && !next.has(id)) next.set(id, s)
    }
    strokesRef.current = next
    bump()
  }, [sessionId, bump])

  // Nova ronda / quadro limpo pelo servidor → recomeçar do zero
  useEffect(() => {
    strokesRef.current = new Map()
    seqRef.current = 0
    bump()
    fetchStrokes()
  }, [roundNumber, canvasVersion, fetchStrokes, bump])

  // Canal realtime — estável por sessão
  useEffect(() => {
    if (!sessionId) return
    const supabase = createClient()
    let cancelled = false

    const applySeg = (p: SegEvent) => {
      if (p.roundNumber !== roundRef.current) return
      const existing = strokesRef.current.get(p.strokeId)
      if (existing) {
        existing.points.push(...p.points)
      } else {
        strokesRef.current.set(p.strokeId, {
          id: p.strokeId,
          color: p.color,
          size: p.size,
          points: [...p.points],
          done: false,
        })
      }
      bump()
    }

    const channel = supabase
      .channel(`vanasketch-${sessionId}`)
      .on('broadcast', { event: 'seg' }, ({ payload }) => {
        if (!cancelled) applySeg(payload as SegEvent)
      })
      .on('broadcast', { event: 'end' }, ({ payload }) => {
        if (cancelled) return
        const s = strokesRef.current.get((payload as { strokeId: string }).strokeId)
        if (s) { s.done = true; bump() }
      })
      .on('broadcast', { event: 'undo' }, ({ payload }) => {
        if (cancelled) return
        if (strokesRef.current.delete((payload as { strokeId: string }).strokeId)) bump()
      })
      .on('broadcast', { event: 'clear' }, () => {
        if (cancelled) return
        strokesRef.current = new Map()
        bump()
      })
      // Fallback: traços persistidos que o broadcast possa ter perdido
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vanasketch_strokes', filter: `session_id=eq.${sessionId}` },
        ({ new: row }) => {
          if (cancelled) return
          const r = row as { id: string; round_number: number; color: string; size: number; points: [number, number][] }
          if (r.round_number !== roundRef.current) return
          strokesRef.current.set(r.id, {
            id: r.id, color: r.color, size: r.size, points: r.points, done: true,
          })
          bump()
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'vanasketch_strokes', filter: `session_id=eq.${sessionId}` },
        ({ old: row }) => {
          if (cancelled) return
          const id = (row as { id?: string }).id
          if (id && strokesRef.current.delete(id)) bump()
        }
      )
      .subscribe((status) => {
        // Ao (re)ligar, reconstruir a partir da BD (apanha o que se perdeu)
        if (status === 'SUBSCRIBED' && !cancelled) fetchStrokes()
      })

    channelRef.current = channel

    const onVisible = () => { if (document.visibilityState === 'visible') fetchStrokes() }
    const onOnline = () => fetchStrokes()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)

    return () => {
      cancelled = true
      channelRef.current = null
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      supabase.removeChannel(channel)
    }
  }, [sessionId, fetchStrokes, bump])

  // ── API do desenhador ───────────────────────────────────────
  // O broadcast não devolve os nossos próprios eventos (self: false por
  // omissão), por isso cada função também aplica a mudança localmente.

  const sendSeg = useCallback((strokeId: string, color: string, size: number, points: [number, number][]) => {
    const existing = strokesRef.current.get(strokeId)
    if (existing) existing.points.push(...points)
    else strokesRef.current.set(strokeId, { id: strokeId, color, size, points: [...points], done: false })
    bump()
    channelRef.current?.send({
      type: 'broadcast',
      event: 'seg',
      payload: { strokeId, roundNumber: roundRef.current, color, size, points } satisfies SegEvent,
    })
  }, [bump])

  const commitStroke = useCallback(async (strokeId: string) => {
    const s = strokesRef.current.get(strokeId)
    if (!s) return
    s.done = true
    bump()
    channelRef.current?.send({ type: 'broadcast', event: 'end', payload: { strokeId } })
    const supabase = createClient()
    await supabase.from('vanasketch_strokes').insert({
      id: strokeId,
      session_id: sessionId,
      round_number: roundRef.current,
      seq: seqRef.current++,
      color: s.color,
      size: s.size,
      points: s.points,
    })
  }, [sessionId, bump])

  const undoLast = useCallback(async () => {
    // Último traço terminado
    let last: LiveStroke | null = null
    for (const s of strokesRef.current.values()) if (s.done) last = s
    if (!last) return
    strokesRef.current.delete(last.id)
    bump()
    channelRef.current?.send({ type: 'broadcast', event: 'undo', payload: { strokeId: last.id } })
    const supabase = createClient()
    await supabase.from('vanasketch_strokes').delete().eq('id', last.id)
  }, [bump])

  const clearBoard = useCallback(async () => {
    strokesRef.current = new Map()
    bump()
    channelRef.current?.send({ type: 'broadcast', event: 'clear', payload: { roundNumber: roundRef.current } })
    const supabase = createClient()
    await supabase
      .from('vanasketch_strokes')
      .delete()
      .eq('session_id', sessionId)
      .eq('round_number', roundRef.current)
  }, [sessionId, bump])

  return { strokesRef, revision, sendSeg, commitStroke, undoLast, clearBoard }
}
