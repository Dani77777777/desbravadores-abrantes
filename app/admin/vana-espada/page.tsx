import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight, History, Play, Sword, Users } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { isAdminRole } from '@/utils/permissions'
import { GameAvailabilityBanner } from '../components/GameAvailabilityBanner'
import { VerseBankClient, type VerseRow } from './VerseBankClient'
import { DeleteSessionButton } from '@/components/vana-espada/DeleteSessionButton'
import { ESPADA_STATUS_LABELS } from '@/utils/vana-espada-labels'
import type { EspadaStatus } from '@/types/vana-espada'

export default async function VanaEspadaAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!isAdminRole(profile)) redirect('/')

  const [{ data: verses }, { data: sessions }] = await Promise.all([
    supabase
      .from('vanaespada_verses')
      .select('*')
      .order('book_id')
      .order('chapter')
      .order('verse_start'),
    supabase
      .from('vanaespada_sessions')
      .select('id, pin, status, total_rounds, created_at, vanaespada_players(count)')
      .order('created_at', { ascending: false })
      .limit(15),
  ])

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin?tab=games" className="text-gray-500 hover:text-gray-900 transition-colors" title="Voltar aos Jogos">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <img src="/images/VanaEspada.jpeg" alt="VanaEspada" className="w-10 h-10 object-contain" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">VanaEspada</h1>
              <p className="text-sm text-gray-500">Banco de versículos do &quot;Onde Está?&quot;</p>
            </div>
          </div>
        </div>

        <GameAvailabilityBanner gameId="vana-espada" />

        <Link
          href="/jogos/vana-espada/nova"
          className="bg-gradient-to-r from-slate-800 via-sky-800 to-amber-500 text-white rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:opacity-95 transition-opacity"
        >
          <div className="p-3 bg-white/15 rounded-xl">
            <Sword className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p className="font-bold">Criar sessão rápida</p>
            <p className="text-white/70 text-sm">Sorteia as rondas e abre a sala com PIN e QR code.</p>
          </div>
          <Play className="w-5 h-5" />
        </Link>

        <VerseBankClient verses={(verses ?? []) as VerseRow[]} />

        {/* Sessões recentes */}
        <div>
          <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <History className="w-4 h-4 text-blue-600" /> Sessões recentes
          </h2>
          {!sessions?.length ? (
            <div className="bg-white rounded-2xl border shadow-sm p-8 text-center text-gray-400 text-sm">
              Ainda não houve nenhuma sessão.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border shadow-sm divide-y">
              {sessions.map((s) => {
                const playerCount = (s.vanaespada_players as unknown as { count: number }[])?.[0]?.count ?? 0
                const live = s.status !== 'finished'
                return (
                  <div key={s.id} className="pr-3 flex items-center gap-2 hover:bg-gray-50 transition-colors">
                    <Link
                      href={`/admin/vana-espada/sessions/${s.id}`}
                      className="flex-1 min-w-0 flex items-center gap-4 p-4"
                      title="Ver o relatório da sessão"
                    >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-gray-900">{s.pin}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                          live ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {ESPADA_STATUS_LABELS[s.status as EspadaStatus] ?? s.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-3">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {playerCount}</span>
                        <span>{s.total_rounds} rondas</span>
                        <span>{new Date(s.created_at).toLocaleDateString('pt-PT')}</span>
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    </Link>
                    {live && (
                      <Link
                        href={`/jogos/vana-espada/${s.id}/control`}
                        className="text-sm font-bold text-blue-700 hover:underline flex-shrink-0"
                      >
                        Retomar →
                      </Link>
                    )}
                    <DeleteSessionButton sessionId={s.id} pin={s.pin} live={live} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
