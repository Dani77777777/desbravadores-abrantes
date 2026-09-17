'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ChevronLeft, Clock, ListOrdered, Sparkles, Sword } from 'lucide-react'
import { createQuickSession } from '@/lib/actions/vana-espada'
import { ESPADA_DIFFICULTY_LABELS } from '@/utils/vana-espada-labels'
import type { EspadaDifficulty } from '@/types/vana-espada'

type Difficulty = EspadaDifficulty | 'any'

const ROUND_OPTIONS = [5, 10, 15]
const TIME_OPTIONS = [20, 30, 45]
const DIFFICULTY_OPTIONS: Difficulty[] = ['any', 'easy', 'medium', 'hard']

interface Props {
  /** Versículos ativos COM excerto, por dificuldade (só esses servem no Modo A). */
  verseCounts: Record<Difficulty, number>
}

export function NewSessionForm({ verseCounts }: Props) {
  const router = useRouter()
  const [rounds, setRounds] = useState(10)
  const [difficulty, setDifficulty] = useState<Difficulty>('any')
  const [timeSeconds, setTimeSeconds] = useState(30)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const available = verseCounts[difficulty] ?? 0

  async function handleCreate() {
    setCreating(true)
    setError('')
    const result = await createQuickSession({ rounds, difficulty, timeSeconds })
    if ('error' in result) {
      setError(result.error)
      setCreating(false)
      return
    }
    router.push(`/jogos/vana-espada/${result.sessionId}/control`)
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-5">
      <Link
        href="/jogos/vana-espada"
        className="inline-flex items-center gap-1.5 text-sky-300 hover:text-white text-sm font-bold transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="text-center">
        <img src="/images/VanaEspada.jpeg" alt="" className="w-20 h-20 object-contain mx-auto mb-3" />
        <h1 className="text-3xl font-black text-white">Nova sessão</h1>
        <p className="text-sky-200 text-sm mt-1">
          &quot;Onde Está?&quot; — aparece um excerto e cada um adivinha a referência.
        </p>
      </div>

      <Field icon={<ListOrdered className="w-3.5 h-3.5" />} label="Rondas">
        <div className="grid grid-cols-3 gap-2">
          {ROUND_OPTIONS.map((n) => (
            <Choice key={n} active={rounds === n} onClick={() => setRounds(n)}>
              {n}
            </Choice>
          ))}
        </div>
      </Field>

      <Field icon={<Sparkles className="w-3.5 h-3.5" />} label="Dificuldade">
        <div className="grid grid-cols-2 gap-2">
          {DIFFICULTY_OPTIONS.map((d) => (
            <Choice key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>
              <span className="flex items-center justify-center gap-1.5">
                {d === 'any' ? 'Todas' : ESPADA_DIFFICULTY_LABELS[d]}
                <span className={`text-[10px] font-bold ${difficulty === d ? 'text-slate-900/50' : 'text-white/40'}`}>
                  {verseCounts[d] ?? 0}
                </span>
              </span>
            </Choice>
          ))}
        </div>
      </Field>

      <Field icon={<Clock className="w-3.5 h-3.5" />} label="Tempo por ronda">
        <div className="grid grid-cols-3 gap-2">
          {TIME_OPTIONS.map((s) => (
            <Choice key={s} active={timeSeconds === s} onClick={() => setTimeSeconds(s)}>
              {s}s
            </Choice>
          ))}
        </div>
      </Field>

      {available < rounds && (
        <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-400/30 rounded-2xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
          <p className="text-amber-100 text-sm">
            Só há <strong>{available}</strong> versículo{available === 1 ? '' : 's'} com excerto neste nível.
            Escolhe menos rondas ou acrescenta versículos em{' '}
            <Link href="/admin/vana-espada" className="underline font-bold">Gestão → VanaEspada</Link>.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/20 border border-red-400/30 rounded-2xl px-4 py-3 text-red-200 text-sm font-medium">
          {error}
        </div>
      )}

      <button
        onClick={handleCreate}
        disabled={creating || available === 0}
        className="w-full bg-amber-400 text-slate-900 font-black text-lg py-4 rounded-2xl hover:bg-amber-300 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2 shadow-xl"
      >
        <Sword className="w-5 h-5" />
        {creating ? 'A preparar...' : 'Criar sessão'}
      </button>

      <p className="text-sky-300/60 text-xs text-center">
        A sessão abre numa sala de espera com PIN e QR code. As rondas ficam
        congeladas no arranque — editar o banco a meio não a afeta.
      </p>
    </div>
  )
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/10 rounded-3xl p-4 border border-white/10 space-y-2.5">
      <p className="text-sky-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
        {icon} {label}
      </p>
      {children}
    </div>
  )
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`py-3 rounded-xl font-black text-sm transition-all active:scale-95 ${
        active ? 'bg-amber-400 text-slate-900 shadow-lg' : 'bg-white/10 text-white/70 hover:bg-white/15'
      }`}
    >
      {children}
    </button>
  )
}
