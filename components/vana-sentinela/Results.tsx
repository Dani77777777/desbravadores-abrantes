'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { RotateCcw, Trophy, Share2, CheckCircle2, Loader2, AlertCircle, PlayCircle, Sparkles, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import type { Pack } from '@/utils/vana-sentinela/types'
import {
  classificacao,
  formatarDuracao,
  formatarPontos,
  linkMinuto,
  type EstadoRonda,
} from '@/utils/vana-sentinela/game'
import Ranking from './Ranking'
import { playSentinelaSound } from './sound'

type Gravacao = { estado: 'a-gravar' } | { estado: 'gravado' } | { estado: 'erro'; mensagem: string }

async function celebrar() {
  const confetti = (await import('canvas-confetti')).default
  const colors = ['#34d399', '#facc15', '#fb923c', '#818cf8']
  confetti({ particleCount: 120, spread: 80, origin: { y: 0.55 }, colors, disableForReducedMotion: true })
  setTimeout(() => {
    confetti({ particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors, disableForReducedMotion: true })
    confetti({ particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors, disableForReducedMotion: true })
  }, 250)
}

export default function Results({
  pack,
  estado,
  isMember,
  isCoordinator,
  recordeAnterior,
  onNovoRecorde,
  somAtivo,
  onReplay,
}: {
  pack: Pack
  estado: EstadoRonda
  isMember: boolean
  isCoordinator: boolean
  /** Recorde antes desta ronda (Supabase para membros, localStorage para visitantes). */
  recordeAnterior: number | null
  onNovoRecorde: (pontos: number) => void
  somAtivo: boolean
  onReplay: () => void
}) {
  const total = estado.jogadas.length
  const classe = classificacao(estado.acertos, total)
  const erradas = estado.jogadas.filter((j) => !j.certa)
  const [recorde] = useState(recordeAnterior)
  const bateuRecorde = estado.pontos > 0 && (recorde === null || estado.pontos > recorde)

  const [gravacao, setGravacao] = useState<Gravacao | null>(isMember ? { estado: 'a-gravar' } : null)
  const [rankingKey, setRankingKey] = useState(0)
  const feito = useRef(false)

  useEffect(() => {
    if (feito.current) return
    feito.current = true

    if (bateuRecorde) {
      onNovoRecorde(estado.pontos)
      celebrar()
      if (somAtivo) playSentinelaSound('recorde')
    }

    // Só os membros com sessão gravam. Visitantes: nenhum pedido à API.
    if (!isMember) return
    fetch('/api/jogos/vana-sentinela/pontuacao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pack: pack.slug,
        pontos: estado.pontos,
        acertos: estado.acertos,
        total,
        comboMax: estado.comboMax,
        duracaoMs: estado.duracaoMs,
      }),
    })
      .then(async (res) => {
        if (res.ok) {
          setGravacao({ estado: 'gravado' })
          setRankingKey((k) => k + 1)
          return
        }
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setGravacao({ estado: 'erro', mensagem: body?.error ?? 'Não foi possível gravar a pontuação.' })
      })
      .catch(() => setGravacao({ estado: 'erro', mensagem: 'Sem ligação: a pontuação não foi gravada.' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function partilhar() {
    const url = `${window.location.origin}/jogos/vana-sentinela`
    const texto = `Fiz ${formatarPontos(estado.pontos)} pontos no VanaSentinela: Verdade ou Distorção — ${pack.cidade}! Consegues fazer melhor?`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'VanaSentinela', text: texto, url })
        return
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(`${texto} ${url}`)
      toast.success('Texto copiado! Agora é só colar.')
    } catch {
      toast.error('Não foi possível partilhar.')
    }
  }

  const verRanking = () => document.getElementById('ranking')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const loginHref = `/login?next=${encodeURIComponent(`/jogos/vana-sentinela/${pack.slug}`)}`

  return (
    <div className="space-y-5">
      {/* Pontuação */}
      <section className="vs-fade-up overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-indigo-800 to-blue-950 p-6 text-center text-white shadow-2xl ring-1 ring-inset ring-white/10">
        <p className="text-5xl" aria-hidden>{classe.emoji}</p>
        <p className="mt-2 text-sm font-extrabold uppercase tracking-[0.2em] text-yellow-300">{classe.titulo}</p>
        <p className="mt-3 text-6xl font-black tabular-nums tracking-tight">{formatarPontos(estado.pontos)}</p>
        <p className="text-sm font-semibold text-indigo-100">pontos</p>

        {bateuRecorde ? (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-yellow-400 px-4 py-1.5 text-sm font-black text-blue-950">
            <Sparkles className="h-4 w-4" /> Novo recorde pessoal!
          </p>
        ) : (
          recorde !== null && (
            <p className="mt-3 text-sm font-semibold text-indigo-100">
              O teu recorde: <span className="font-black text-white">{formatarPontos(recorde)}</span>
              {!isMember && ' (neste browser)'}
            </p>
          )
        )}

        <dl className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-white/10 p-3">
            <dt className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-100">Certas</dt>
            <dd className="text-2xl font-black tabular-nums">
              {estado.acertos}/{total}
            </dd>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <dt className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-100">Maior combo</dt>
            <dd className="text-2xl font-black tabular-nums">{estado.comboMax}</dd>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <dt className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-100">Tempo</dt>
            <dd className="text-2xl font-black tabular-nums">{formatarDuracao(estado.duracaoMs)}</dd>
          </div>
        </dl>

        {/* Estado do ranking */}
        <div className="mt-5 text-sm">
          {gravacao?.estado === 'a-gravar' && (
            <p className="inline-flex items-center gap-2 text-indigo-100">
              <Loader2 className="h-4 w-4 animate-spin" /> A gravar no ranking…
            </p>
          )}
          {gravacao?.estado === 'gravado' && (
            <p className="inline-flex items-center gap-2 font-bold text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> Gravado no ranking!
            </p>
          )}
          {gravacao?.estado === 'erro' && (
            <p className="inline-flex items-center gap-2 font-semibold text-orange-200">
              <AlertCircle className="h-4 w-4 shrink-0" /> {gravacao.mensagem}
            </p>
          )}
          {!isMember && (
            <p className="mx-auto max-w-sm text-indigo-100/80">
              O ranking é só para membros do clube. Se és desbravador,{' '}
              <Link href={loginHref} className="inline-flex items-center gap-1 font-bold text-yellow-300 underline-offset-2 hover:underline">
                <LogIn className="h-3.5 w-3.5" /> inicia sessão
              </Link>{' '}
              para a tua pontuação contar.
            </p>
          )}
        </div>
      </section>

      {/* Botões */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={onReplay}
          className="flex items-center justify-center gap-2 rounded-2xl bg-yellow-400 py-3.5 font-black text-blue-950 shadow-[0_12px_30px_-12px_rgba(250,204,21,.7)] transition hover:bg-yellow-300 active:scale-[0.98]"
        >
          <RotateCcw className="h-5 w-5" /> Jogar outra vez
        </button>
        <button
          type="button"
          onClick={verRanking}
          className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 py-3.5 font-bold text-white ring-1 ring-inset ring-white/20 transition hover:bg-white/20"
        >
          <Trophy className="h-5 w-5" /> Ver ranking
        </button>
        <button
          type="button"
          onClick={partilhar}
          className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 py-3.5 font-bold text-white ring-1 ring-inset ring-white/20 transition hover:bg-white/20"
        >
          <Share2 className="h-5 w-5" /> Partilhar
        </button>
      </div>

      {/* Frase-chave */}
      {pack.fraseChave && (
        <figure className="rounded-[1.75rem] border-l-4 border-yellow-400 bg-white/[0.06] p-5 text-white">
          <blockquote className="text-lg font-semibold leading-relaxed">&ldquo;{pack.fraseChave}&rdquo;</blockquote>
          <figcaption className="mt-2 text-sm text-blue-100/60">
            {pack.orador} · {pack.cidade}
          </figcaption>
        </figure>
      )}

      {/* Revisão das erradas */}
      {erradas.length > 0 ? (
        <section aria-labelledby="revisao" className="space-y-3">
          <h2 id="revisao" className="text-xl font-extrabold text-white">
            Para rever ({erradas.length})
          </h2>
          {erradas.map((j) => {
            const link = linkMinuto(pack.videoUrl, j.carta.minuto)
            return (
              <article key={j.carta.id} className="rounded-3xl bg-white p-5 text-slate-900 shadow-lg">
                <p className="text-lg font-bold leading-snug">{j.carta.afirmacao}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-black uppercase tracking-wider">
                  <span
                    className={`rounded-full px-3 py-1 ${j.carta.verdade ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800'}`}
                  >
                    Certo: {j.carta.verdade ? '✓ Verdade' : '✗ Distorção'}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                    {j.resposta === 'tempo' ? '⏱ Tempo esgotado' : `Respondeste ${j.resposta === 'verdade' ? 'Verdade' : 'Distorção'}`}
                  </span>
                </div>
                <p className="mt-3 leading-relaxed text-slate-700">{j.carta.explicacao}</p>
                {j.carta.citacao && (
                  <blockquote className="mt-3 border-l-4 border-indigo-200 pl-3 italic text-slate-600">
                    &ldquo;{j.carta.citacao}&rdquo;
                  </blockquote>
                )}
                {(j.carta.referencia || j.carta.minuto) && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold">
                    {j.carta.referencia && <span className="text-indigo-700">📖 {j.carta.referencia}</span>}
                    {j.carta.minuto &&
                      (link ? (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-rose-600 hover:underline">
                          <PlayCircle className="h-4 w-4" /> Ver no vídeo ({j.carta.minuto})
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <PlayCircle className="h-4 w-4" /> Minuto {j.carta.minuto}
                        </span>
                      ))}
                  </div>
                )}
              </article>
            )
          })}
        </section>
      ) : (
        <p className="rounded-3xl bg-emerald-500/15 p-5 text-center font-bold text-emerald-200 ring-1 ring-inset ring-emerald-400/40">
          Ronda perfeita: não falhaste nenhuma! 🔥
        </p>
      )}

      <div id="ranking" className="scroll-mt-24">
        <Ranking pack={pack.slug} cidade={pack.cidade} refreshKey={rankingKey} isCoordinator={isCoordinator} />
      </div>
    </div>
  )
}
