'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Trophy, Trash2, Loader2, Crown } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { shortDisplayName } from '@/utils/display-name'
import { formatarDuracao, formatarPontos } from '@/utils/vana-sentinela/game'
import { deleteVanaSentinelaScore } from '@/lib/actions/vana-sentinela'

type Periodo = 'semana' | 'sempre'

type Linha = {
  score_id: string
  rank_position: number
  full_name: string | null
  avatar_url: string | null
  is_guest: boolean
  points: number
  correct: number
  total: number
  duration_ms: number
  is_me: boolean
}

const MEDALHAS = ['bg-yellow-400 text-yellow-950', 'bg-slate-300 text-slate-900', 'bg-amber-600 text-amber-50']

/**
 * Top 10 do pack (melhor pontuação de cada membro), "Esta semana" / "Sempre".
 * Visitantes veem-no igual, só sem linha própria. `refreshKey` muda depois de gravar.
 */
export default function Ranking({
  pack,
  cidade,
  refreshKey = 0,
  isCoordinator = false,
  convidadoId = null,
}: {
  pack: string
  cidade: string
  refreshKey?: number
  isCoordinator?: boolean
  /** Id anónimo do convidado que está a ver (para destacar a linha dele). */
  convidadoId?: string | null
}) {
  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const [reload, setReload] = useState(0)
  const [apagando, startApagar] = useTransition()
  // O resultado guarda o pedido a que responde: se não bater certo, está a carregar.
  const chave = `${pack}|${periodo}|${refreshKey}|${reload}|${convidadoId ?? ''}`
  const [resultado, setResultado] = useState<{ chave: string; linhas: Linha[]; erro: boolean } | null>(null)

  useEffect(() => {
    let cancel = false
    createClient()
      .rpc('get_vana_sentinela_ranking', { p_pack: pack, p_period: periodo, p_limit: 10, p_guest_id: convidadoId })
      .then(({ data, error }) => {
        if (cancel) return
        if (error) console.error('VanaSentinela: erro no ranking', error)
        setResultado({
          chave,
          erro: !!error,
          linhas: ((data ?? []) as Linha[]).map((l) => ({ ...l, rank_position: Number(l.rank_position) })),
        })
      })
    return () => {
      cancel = true
    }
  }, [chave, pack, periodo, convidadoId])

  const linhas = resultado?.chave === chave ? resultado.linhas : null
  const erro = resultado?.chave === chave && resultado.erro

  const apagar = useCallback(
    (linha: Linha) => {
      if (!confirm(`Apagar a pontuação de ${linha.full_name ?? 'este jogador'} (${linha.points} pts)?`)) return
      startApagar(async () => {
        const res = await deleteVanaSentinelaScore(linha.score_id)
        if (res.error) toast.error(res.error)
        else {
          toast.success('Pontuação apagada.')
          setReload((r) => r + 1)
        }
      })
    },
    [],
  )

  const top = linhas?.filter((l) => l.rank_position <= 10) ?? []
  const eu = linhas?.find((l) => l.is_me && l.rank_position > 10)

  const linhaEl = (l: Linha) => (
    <li
      key={l.score_id}
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
        l.is_me ? 'bg-yellow-400/15 ring-2 ring-inset ring-yellow-400' : 'bg-white/[0.04]'
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${
          MEDALHAS[l.rank_position - 1] ?? 'bg-white/10 text-white'
        }`}
      >
        {l.rank_position}
      </span>
      {l.avatar_url ? (
        <img src={l.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-sm font-bold text-white">
          {(l.full_name ?? '?').trim().charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-white">
          {l.is_guest ? l.full_name ?? 'Convidado' : shortDisplayName(l.full_name)}
          {l.is_me && <span className="ml-1.5 text-xs font-black uppercase text-yellow-300">(tu)</span>}
          {l.is_guest && (
            <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 align-middle text-[10px] font-extrabold uppercase tracking-wider text-blue-100/70">
              Convidado
            </span>
          )}
        </p>
        <p className="text-xs text-blue-100/60">
          {l.correct}/{l.total} certas · {formatarDuracao(l.duration_ms)}
        </p>
      </div>
      <span className="text-right font-black tabular-nums text-yellow-300">{formatarPontos(l.points)}</span>
      {isCoordinator && (
        <button
          type="button"
          onClick={() => apagar(l)}
          disabled={apagando}
          className="rounded-lg p-1.5 text-blue-100/40 transition hover:bg-red-500/20 hover:text-red-300"
          aria-label={`Apagar pontuação de ${l.full_name ?? 'jogador'}`}
          title="Apagar pontuação (só coordenação)"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  )

  return (
    <section aria-labelledby={`ranking-${pack}`} className="rounded-[1.75rem] bg-white/[0.06] p-5 ring-1 ring-inset ring-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`ranking-${pack}`} className="flex items-center gap-2 text-xl font-extrabold text-white">
          <Trophy className="h-5 w-5 text-yellow-300" /> Ranking · {cidade}
        </h2>
        <div role="tablist" aria-label="Período do ranking" className="flex rounded-full bg-black/30 p-1">
          {(['semana', 'sempre'] as const).map((p) => (
            <button
              key={p}
              role="tab"
              type="button"
              aria-selected={periodo === p}
              onClick={() => setPeriodo(p)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold transition ${
                periodo === p ? 'bg-yellow-400 text-blue-950' : 'text-blue-100/70 hover:text-white'
              }`}
            >
              {p === 'semana' ? 'Esta semana' : 'Sempre'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {linhas === null ? (
          <div className="flex justify-center py-8 text-blue-100/60">
            <Loader2 className="h-6 w-6 animate-spin" aria-label="A carregar ranking" />
          </div>
        ) : erro ? (
          <p className="py-6 text-center text-sm text-blue-100/60">Não foi possível carregar o ranking.</p>
        ) : top.length === 0 ? (
          <div className="py-6 text-center text-blue-100/70">
            <Crown className="mx-auto mb-2 h-8 w-8 text-yellow-300/60" />
            <p className="font-semibold">
              {periodo === 'semana' ? 'Ainda ninguém jogou esta semana.' : 'Ainda ninguém está no ranking.'}
            </p>
            <p className="text-sm text-blue-100/50">O primeiro lugar está à tua espera!</p>
          </div>
        ) : (
          <ol className="space-y-2">
            {top.map(linhaEl)}
            {eu && (
              <>
                <li aria-hidden className="py-0.5 text-center text-blue-100/40">⋯</li>
                {linhaEl(eu)}
              </>
            )}
          </ol>
        )}
      </div>
    </section>
  )
}
