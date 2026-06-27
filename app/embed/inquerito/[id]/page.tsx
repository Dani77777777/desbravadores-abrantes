'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { QRCodeSVG } from 'qrcode.react'
import { ClipboardList, CalendarClock, Users, Lock, EyeOff } from 'lucide-react'

interface EmbedOption {
  id: string
  label: string
  count: number | null
}

interface EmbedSurvey {
  id: string
  question: string
  description: string | null
  deadline: string
  opened: boolean
  is_open: boolean
  show_results_live: boolean
  total: number
  options: EmbedOption[]
}

const BAR_COLORS = [
  'bg-blue-600',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-violet-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-lime-500',
]

function timeLeft(deadline: Date, now: Date) {
  const ms = deadline.getTime() - now.getTime()
  if (ms <= 0) return null
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}min`
  const days = Math.floor(hours / 24)
  return `${days} dia${days === 1 ? '' : 's'}`
}

export default function SurveyEmbedPage() {
  const params = useParams<{ id: string }>()
  // Read ?qr=1 from window to avoid the Suspense requirement of useSearchParams
  const [showQr, setShowQr] = useState(false)
  useEffect(() => {
    setShowQr(new URLSearchParams(window.location.search).get('qr') === '1')
  }, [])

  const [survey, setSurvey] = useState<EmbedSurvey | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchSurvey = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('get_survey_embed', { p_survey_id: params.id })
    if (error || !data) {
      setNotFound(true)
    } else {
      setSurvey(data as EmbedSurvey)
      setNotFound(false)
    }
    setLoading(false)
  }, [params.id])

  useEffect(() => {
    fetchSurvey()
    const id = setInterval(fetchSurvey, 5000)
    return () => clearInterval(id)
  }, [fetchSurvey])

  const now = new Date()

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950">
        <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </main>
    )
  }

  if (notFound || !survey) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950 p-6">
        <p className="text-white/70 text-lg">Inquérito não encontrado.</p>
      </main>
    )
  }

  const deadlineDate = new Date(survey.deadline)
  const tl = timeLeft(deadlineDate, now)
  const showCounts = survey.opened && survey.options.some(o => o.count !== null)
  const maxCount = Math.max(1, ...survey.options.map(o => o.count ?? 0))
  const voteUrl = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950 flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-3xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-blue-300 text-xs uppercase tracking-widest font-semibold">
            <ClipboardList className="w-4 h-4" /> Inquérito · Desbravadores Abrantes
          </div>
          {survey.opened ? (
            <>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-white leading-tight">{survey.question}</h1>
              {survey.description && (
                <p className="text-blue-200/80 text-sm sm:text-base">{survey.description}</p>
              )}
            </>
          ) : (
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white leading-tight">Em breve...</h1>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs sm:text-sm">
            {!survey.opened ? (
              <span className="px-3 py-1 rounded-full bg-slate-500/30 text-slate-200 font-semibold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> A votação ainda não abriu
              </span>
            ) : survey.is_open ? (
              <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-300 font-semibold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> Votação aberta
                {tl && <span className="text-green-200/70 font-normal">· fecha em {tl}</span>}
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 font-semibold flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" /> Votação encerrada
              </span>
            )}
            {survey.opened && (
              <span className="px-3 py-1 rounded-full bg-white/10 text-blue-100 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> {survey.total} voto{survey.total === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>

        {/* Options */}
        {survey.opened && (
          <div className="bg-white/5 backdrop-blur rounded-2xl border border-white/10 p-4 sm:p-6 space-y-4">
            {!showCounts && (
              <p className="text-center text-blue-200/70 text-sm flex items-center justify-center gap-2">
                <EyeOff className="w-4 h-4" /> Os resultados são revelados quando a votação fechar.
              </p>
            )}
            {survey.options.map((o, i) => {
              const c = o.count ?? 0
              const pct = showCounts && survey.total > 0 ? Math.round((c / survey.total) * 100) : 0
              const widthPct = showCounts ? Math.max((c / maxCount) * 100, c > 0 ? 4 : 0) : 0
              return (
                <div key={o.id} className="space-y-1.5">
                  <div className="flex items-end justify-between gap-3">
                    <span className="text-white font-semibold text-sm sm:text-lg truncate">{o.label}</span>
                    {showCounts && (
                      <span className="text-blue-200 text-xs sm:text-base font-bold shrink-0 tabular-nums">
                        {c} <span className="text-blue-300/60 font-normal">({pct}%)</span>
                      </span>
                    )}
                  </div>
                  <div className="h-4 sm:h-6 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${BAR_COLORS[i % BAR_COLORS.length]} transition-all duration-700 ease-out`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!survey.opened && (
          <div className="bg-white/5 backdrop-blur rounded-2xl border border-white/10 p-8 text-center">
            <Lock className="w-10 h-10 text-blue-300/50 mx-auto mb-3" />
            <p className="text-blue-100 text-lg font-medium">A votação ainda não está aberta</p>
            <p className="text-blue-200/60 text-sm mt-1">Fica atento — será aberta pelo coordenador.</p>
          </div>
        )}

        {/* QR to vote (add ?qr=1 to the URL) */}
        {showQr && survey.is_open && voteUrl && (
          <div className="flex items-center justify-center gap-4">
            <div className="bg-white p-2.5 rounded-xl">
              <QRCodeSVG value={voteUrl} size={96} />
            </div>
            <p className="text-blue-100 text-sm sm:text-base font-medium">
              Vota no site!<br />
              <span className="text-blue-300/70 text-xs">{voteUrl.replace(/^https?:\/\//, '')}</span>
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
