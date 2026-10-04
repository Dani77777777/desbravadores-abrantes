'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Play, Lock, Timer, Flame, Zap, Trophy, MapPin } from 'lucide-react'
import type { Pack } from '@/utils/vana-sentinela/types'
import { CARTAS_POR_RONDA, TEMPO_CARTA_MS, formatarPontos, recordeLocalKey } from '@/utils/vana-sentinela/game'
import Ranking from './Ranking'
import { useNumeroGuardado } from './storage'

/** Só o que o ecrã inicial precisa de cada pack (sem as cartas). */
export type PackResumo = Pick<Pack, 'slug' | 'cidade' | 'titulo' | 'orador' | 'disponivel'> & { numCartas: number }

const REGRAS = [
  { icon: MapPin, texto: 'Escolhe a cidade da pregação.' },
  { icon: Play, texto: `${CARTAS_POR_RONDA} cartas: arrasta para a direita se é VERDADE, para a esquerda se é DISTORÇÃO (ou usa os botões / as setas).` },
  { icon: Timer, texto: `${TEMPO_CARTA_MS / 1000} segundos por carta. Se o tempo acabar, conta como errada.` },
  { icon: Zap, texto: 'Cada acerto vale 100 pontos, mais um bónus até +50 por rapidez.' },
  { icon: Flame, texto: 'Acertos seguidos multiplicam: 3 → ×2, 6 → ×3, 10 → ×4.' },
]

export default function PackLobby({
  packs,
  recordes,
  isMember,
  isCoordinator,
}: {
  packs: PackResumo[]
  /** Melhor pontuação do membro por pack (vazio para visitantes). */
  recordes: Record<string, number>
  isMember: boolean
  isCoordinator: boolean
}) {
  const [selecionado, setSelecionado] = useState(() => packs.find((p) => p.disponivel)?.slug ?? packs[0]?.slug)
  const pack = packs.find((p) => p.slug === selecionado)

  // Visitantes: recorde guardado neste browser.
  const recordeLocal = useNumeroGuardado(recordeLocalKey(pack?.slug ?? ''))
  const recorde = pack ? (isMember ? recordes[pack.slug] : recordeLocal ?? undefined) : undefined

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-6">
        {/* Seletor de pack */}
        <section aria-labelledby="escolher-pack">
          <h2 id="escolher-pack" className="mb-3 text-sm font-extrabold uppercase tracking-[0.18em] text-yellow-300">
            Escolhe a pregação
          </h2>
          <div role="radiogroup" aria-labelledby="escolher-pack" className="grid grid-cols-2 gap-3">
            {packs.map((p) => {
              const ativo = p.slug === selecionado
              return (
                <button
                  key={p.slug}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  disabled={!p.disponivel}
                  onClick={() => setSelecionado(p.slug)}
                  className={`relative rounded-3xl p-4 text-left transition ${
                    !p.disponivel
                      ? 'cursor-not-allowed bg-white/[0.03] text-blue-100/40 ring-1 ring-inset ring-white/5'
                      : ativo
                        ? 'bg-yellow-400 text-blue-950 shadow-[0_12px_30px_-12px_rgba(250,204,21,.7)]'
                        : 'bg-white/[0.07] text-white ring-1 ring-inset ring-white/15 hover:bg-white/[0.12]'
                  }`}
                >
                  <p className="text-lg font-black">{p.cidade}</p>
                  <p className={`mt-0.5 line-clamp-2 text-xs font-semibold ${ativo ? 'text-blue-950/70' : 'opacity-70'}`}>
                    {p.disponivel ? p.titulo : 'Em breve'}
                  </p>
                  {!p.disponivel && (
                    <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">
                      <Lock className="h-3 w-3" /> Em breve
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>

        {/* Pack escolhido + Jogar */}
        {pack?.disponivel && (
          <section className="rounded-[1.75rem] bg-white/[0.06] p-6 text-white ring-1 ring-inset ring-white/10">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-yellow-300">{pack.cidade}</p>
            <h3 className="mt-1 text-2xl font-black leading-tight">{pack.titulo}</h3>
            <p className="mt-1 text-sm text-blue-100/70">
              {pack.orador} · {pack.numCartas} cartas
            </p>
            {recorde !== undefined && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm font-bold">
                <Trophy className="h-4 w-4 text-yellow-300" /> O teu recorde: {formatarPontos(recorde)}
                {!isMember && <span className="font-normal text-blue-100/60"> (neste browser)</span>}
              </p>
            )}
            <Link
              href={`/jogos/vana-sentinela/${pack.slug}`}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-yellow-400 py-4 text-lg font-black text-blue-950 shadow-[0_12px_30px_-12px_rgba(250,204,21,.7)] transition hover:bg-yellow-300 active:scale-[0.98]"
            >
              <Play className="h-5 w-5 fill-current" /> Jogar
            </Link>
            {!isMember && (
              <p className="mt-3 text-center text-xs text-blue-100/60">
                Podes jogar sem conta. O ranking é só para membros do clube com sessão iniciada.
              </p>
            )}
          </section>
        )}

        {/* Regras */}
        <section aria-labelledby="regras" className="rounded-[1.75rem] bg-white/[0.04] p-6 ring-1 ring-inset ring-white/10">
          <h2 id="regras" className="text-lg font-extrabold text-white">
            Como se joga
          </h2>
          <ul className="mt-3 space-y-2.5">
            {REGRAS.map(({ icon: Icon, texto }) => (
              <li key={texto} className="flex gap-3 text-blue-100/85">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-yellow-300" />
                <span>{texto}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-blue-100/60">
            No fim vês as que falhaste, com a explicação e o minuto da pregação. Chegas a <strong className="text-white">Sentinela do Santuário</strong>?
          </p>
        </section>
      </div>

      {pack?.disponivel && (
        <div>
          <Ranking pack={pack.slug} cidade={pack.cidade} isCoordinator={isCoordinator} />
        </div>
      )}
    </div>
  )
}
