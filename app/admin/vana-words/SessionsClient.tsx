'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { deleteVanaWordsSession } from '@/lib/actions/vana-words'
import {
  ExternalLink, Users, Clock, Trash2, FlaskConical, Monitor,
  Loader2, AlertTriangle, X,
} from 'lucide-react'

interface SessionRow {
  id: string
  code: string
  status: string
  is_test_session: boolean
  created_at: string
  vanawords_players?: { count: number }[]
}

const STATUS_LABELS: Record<string, string> = {
  lobby: 'Lobby',
  team_preview: 'A definir equipas',
  arauto_spin: 'A escolher Arautos',
  arauto_ready: 'Arautos prontos',
  playing: 'A jogar',
  finished: 'Terminado',
}

// Cor do "pill" de estado
const STATUS_STYLES: Record<string, string> = {
  lobby: 'bg-sky-100 text-sky-700',
  team_preview: 'bg-indigo-100 text-indigo-700',
  arauto_spin: 'bg-indigo-100 text-indigo-700',
  arauto_ready: 'bg-indigo-100 text-indigo-700',
  playing: 'bg-emerald-100 text-emerald-700',
  finished: 'bg-slate-200 text-slate-600',
}

export function SessionsClient({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter()
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function handleDelete(id: string) {
    setError(null)
    setDeletingId(id)
    startTransition(async () => {
      const res = await deleteVanaWordsSession(id)
      setDeletingId(null)
      if (res.error) {
        setError(res.error)
        return
      }
      setConfirmId(null)
      router.refresh()
    })
  }

  if (!sessions.length) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white/50 px-4 py-10 text-center">
        <p className="text-slate-500 text-sm">Ainda não criaste nenhuma sessão.</p>
      </div>
    )
  }

  return (
    <>
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {sessions.map((s) => {
          const playerCount = s.vanawords_players?.[0]?.count ?? 0
          const isActive = s.status !== 'finished'
          const canDelete = s.status !== 'playing'
          const confirming = confirmId === s.id
          const busy = deletingId === s.id && isPending

          return (
            <div
              key={s.id}
              className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              {/* Linha de topo: código + estado */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-14 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-inner">
                    <span className="text-[9px] font-medium uppercase tracking-wide opacity-80">Código</span>
                    <span className="text-lg font-black tracking-widest leading-none">{s.code}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLES[s.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[s.status] ?? s.status}
                      </span>
                      {s.is_test_session && (
                        <span className="flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                          <FlaskConical className="w-3 h-3" /> TESTE
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {playerCount}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(s.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ações */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {isActive && (
                  <Link
                    href={`/jogos/vana-words/${s.id}/control`}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Abrir
                  </Link>
                )}
                <Link
                  href={`/jogos/vana-words/${s.id}/present`}
                  target="_blank"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                >
                  <Monitor className="w-3.5 h-3.5" /> Projetor
                </Link>
                {canDelete && (
                  <button
                    onClick={() => { setConfirmId(s.id); setError(null) }}
                    title="Apagar sessão"
                    className="flex items-center justify-center rounded-lg bg-red-50 px-3 py-2 text-red-600 hover:bg-red-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Overlay de confirmação */}
              {confirming && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/95 px-5 text-center backdrop-blur-sm">
                  <AlertTriangle className="w-7 h-7 text-red-500" />
                  <p className="text-sm font-semibold text-gray-800">
                    Apagar a sessão <span className="font-black">{s.code}</span>?
                  </p>
                  <p className="text-xs text-slate-500">Esta ação é permanente.</p>
                  <div className="flex w-full gap-2">
                    <button
                      onClick={() => setConfirmId(null)}
                      disabled={busy}
                      className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      disabled={busy}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Apagar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
