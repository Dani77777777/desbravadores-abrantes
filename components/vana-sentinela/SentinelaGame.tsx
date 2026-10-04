'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX, Flame, Play, ArrowLeft, ArrowRight } from 'lucide-react'
import type { Carta, Pack } from '@/utils/vana-sentinela/types'
import {
  CARTAS_POR_RONDA,
  ESTADO_INICIAL,
  SOM_KEY,
  TEMPO_CARTA_MS,
  recordeLocalKey,
  formatarPontos,
  multiplicadorCombo,
  responder,
  sortearRonda,
  type EstadoRonda,
  type Jogada,
  type Resposta,
} from '@/utils/vana-sentinela/game'
import SwipeCard, { type Lado, type Saida } from './SwipeCard'
import Results from './Results'
import { playSentinelaSound, unlockSentinelaSound } from './sound'
import { guardar, useGuardado, useNumeroGuardado, useReducedMotion } from './storage'
import './VanaSentinela.css'

type Fase = 'pronto' | 'jogar' | 'feedback' | 'fim'

/** Tempo do selo nos acertos (os erros esperam pelo "Continuar"). */
const FEEDBACK_ACERTO_MS = 1200

function seloTexto(j: Jogada): string {
  if (j.certa) return j.carta.verdade ? '✓ Verdade!' : '✓ Bem apanhada, é distorção!'
  if (j.resposta === 'tempo') return j.carta.verdade ? '⏱ Tempo! Era Verdade' : '⏱ Tempo! Era distorção'
  return j.carta.verdade ? '✗ Afinal era Verdade' : '✗ Era distorção'
}

export default function SentinelaGame({
  pack,
  isMember,
  isCoordinator,
  recordeInicial,
}: {
  pack: Pack
  /** Membro com sessão: grava no ranking e o recorde vem do Supabase. */
  isMember: boolean
  isCoordinator: boolean
  /** Melhor pontuação do membro neste pack (null = ainda não jogou / visitante). */
  recordeInicial: number | null
}) {
  const reducedMotion = useReducedMotion()
  const [fase, setFase] = useState<Fase>('pronto')
  const [ronda, setRonda] = useState<Carta[]>([])
  const [rondaId, setRondaId] = useState(0)
  const [indice, setIndice] = useState(0)
  const [estado, setEstado] = useState<EstadoRonda>(ESTADO_INICIAL)
  const [saida, setSaida] = useState<Saida>(null)
  const [ultima, setUltima] = useState<Jogada | null>(null)
  const [pulso, setPulso] = useState(0)
  const som = useGuardado(SOM_KEY) === '1'
  const [anuncio, setAnuncio] = useState('')

  // Refs para os temporizadores não lerem estado antigo
  const estadoRef = useRef(estado)
  const faseRef = useRef(fase)
  const indiceRef = useRef(indice)
  const somRef = useRef(som)
  useEffect(() => {
    estadoRef.current = estado
    faseRef.current = fase
    indiceRef.current = indice
    somRef.current = som
  })
  const inicioCarta = useRef(0)
  const timers = useRef<number[]>([])
  const continuarRef = useRef<HTMLButtonElement>(null)

  // Recorde pessoal: do Supabase para membros, do localStorage (só este browser) para visitantes.
  const [recordeMembro, setRecordeMembro] = useState<number | null>(recordeInicial)
  const recordeLocal = useNumeroGuardado(recordeLocalKey(pack.slug))
  const recorde = isMember ? recordeMembro : recordeLocal

  const novoRecorde = useCallback(
    (pontos: number) => {
      if (isMember) setRecordeMembro(pontos)
      else guardar(recordeLocalKey(pack.slug), String(pontos))
    },
    [isMember, pack.slug],
  )

  const limparTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  useEffect(() => limparTimers, [])

  const tocar = (s: Parameters<typeof playSentinelaSound>[0]) => {
    if (somRef.current) playSentinelaSound(s)
  }

  const alternarSom = () => {
    const novo = !som
    if (novo) {
      unlockSentinelaSound()
      playSentinelaSound('acerto')
    }
    guardar(SOM_KEY, novo ? '1' : '0')
  }

  const comecar = useCallback(() => {
    limparTimers()
    if (somRef.current) unlockSentinelaSound()
    setRonda(sortearRonda(pack.cartas))
    setRondaId((r) => r + 1)
    setIndice(0)
    setEstado(ESTADO_INICIAL)
    setUltima(null)
    setSaida(null)
    setAnuncio('')
    setFase('jogar')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [pack.cartas])

  const avancar = useCallback(() => {
    limparTimers()
    setSaida(null)
    setUltima(null)
    const proximo = indiceRef.current + 1
    if (proximo >= ronda.length) {
      setFase('fim')
    } else {
      setIndice(proximo)
      setFase('jogar')
    }
  }, [ronda.length])

  const responderCarta = useCallback(
    (resposta: Resposta) => {
      if (faseRef.current !== 'jogar') return
      const carta = ronda[indice]
      if (!carta) return
      limparTimers()
      faseRef.current = 'feedback'

      const antes = estadoRef.current
      const tempo = performance.now() - inicioCarta.current
      const depois = responder(antes, carta, resposta, tempo)
      const jogada = depois.jogadas[depois.jogadas.length - 1]

      setEstado(depois)
      setUltima(jogada)
      setSaida(resposta)
      setFase('feedback')
      setAnuncio(`${seloTexto(jogada)}${jogada.certa ? ` Mais ${jogada.pontos} pontos.` : ` ${carta.explicacao}`}`)

      const subiuNivel = multiplicadorCombo(depois.combo) > multiplicadorCombo(antes.combo)
      if (subiuNivel) setPulso((p) => p + 1)
      tocar(jogada.certa ? (subiuNivel ? 'combo' : 'acerto') : 'erro')

      if (jogada.certa) timers.current.push(window.setTimeout(avancar, FEEDBACK_ACERTO_MS))
    },
    [ronda, indice, avancar],
  )

  // Relógio de cada carta: 8 s; não corre durante o feedback.
  useEffect(() => {
    if (fase !== 'jogar') return
    inicioCarta.current = performance.now()
    const t = window.setTimeout(() => responderCarta('tempo'), TEMPO_CARTA_MS)
    return () => window.clearTimeout(t)
  }, [fase, indice, rondaId, responderCarta])

  // Nos erros, o foco vai para o "Continuar" (Enter/Espaço avançam).
  useEffect(() => {
    if (fase === 'feedback' && ultima && !ultima.certa) continuarRef.current?.focus()
  }, [fase, ultima])

  // Teclado: ← distorção, → verdade, Enter/Espaço para começar/continuar.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const alvo = e.target as HTMLElement | null
      const emControlo = !!alvo?.closest('button, a, input, textarea, select, [contenteditable="true"]')
      const confirmar = e.key === 'Enter' || e.key === ' '
      if (fase === 'jogar') {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          responderCarta('distorcao')
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          responderCarta('verdade')
        }
      } else if (confirmar && !emControlo) {
        if (fase === 'pronto') {
          e.preventDefault()
          comecar()
        } else if (fase === 'feedback' && ultima && !ultima.certa) {
          e.preventDefault()
          avancar()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fase, ultima, responderCarta, comecar, avancar])

  const decidir = (lado: Lado) => responderCarta(lado)

  const carta = ronda[indice]
  const total = ronda.length || CARTAS_POR_RONDA
  const multiplicador = multiplicadorCombo(estado.combo)

  // ── Cabeçalho ──────────────────────────────────────────────
  const cabecalho = (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-yellow-300">{pack.cidade}</p>
        <h1 className="truncate text-base font-extrabold text-white sm:text-lg">{pack.titulo}</h1>
      </div>
      <button
        type="button"
        onClick={alternarSom}
        aria-pressed={som}
        aria-label={som ? 'Desligar sons' : 'Ligar sons'}
        title={som ? 'Desligar sons' : 'Ligar sons'}
        className="shrink-0 rounded-full bg-white/10 p-2.5 text-white ring-1 ring-inset ring-white/15 transition hover:bg-white/20"
      >
        {som ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
      </button>
    </header>
  )

  if (fase === 'fim') {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-5">
        {cabecalho}
        <Results
          key={rondaId}
          pack={pack}
          estado={estado}
          isMember={isMember}
          isCoordinator={isCoordinator}
          recordeAnterior={recorde}
          onNovoRecorde={novoRecorde}
          somAtivo={som}
          onReplay={comecar}
        />
      </div>
    )
  }

  if (fase === 'pronto') {
    return (
      <div className="mx-auto w-full max-w-md space-y-5">
        {cabecalho}
        <div className="vs-fade-up rounded-[2rem] bg-white/[0.06] p-6 text-center text-white ring-1 ring-inset ring-white/10">
          <img src="/images/VanaSentinela.jpeg" alt="" className="mx-auto h-24 w-24 rounded-3xl object-cover shadow-xl" />
          <h2 className="mt-4 text-3xl font-black">Verdade ou Distorção?</h2>
          <p className="mt-2 text-blue-100/80">
            {CARTAS_POR_RONDA} cartas, {TEMPO_CARTA_MS / 1000} segundos cada. Foi isto que a pregação disse, ou está torcido?
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm font-bold">
            <div className="rounded-2xl bg-orange-500/15 p-3 text-orange-200 ring-1 ring-inset ring-orange-400/40">
              <ArrowLeft className="mx-auto mb-1 h-5 w-5" />✗ Distorção
            </div>
            <div className="rounded-2xl bg-emerald-500/15 p-3 text-emerald-200 ring-1 ring-inset ring-emerald-400/40">
              <ArrowRight className="mx-auto mb-1 h-5 w-5" />✓ Verdade
            </div>
          </div>
          <p className="mt-4 text-sm text-blue-100/60">Acertos seguidos multiplicam os pontos até ×4. Responder depressa dá bónus.</p>
          <button
            type="button"
            onClick={comecar}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-yellow-400 py-4 text-lg font-black text-blue-950 shadow-[0_12px_30px_-12px_rgba(250,204,21,.7)] transition hover:bg-yellow-300 active:scale-[0.98]"
          >
            <Play className="h-5 w-5 fill-current" /> Começar
          </button>
        </div>
      </div>
    )
  }

  // ── A jogar / feedback ─────────────────────────────────────
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4" style={{ touchAction: 'pan-y' }}>
      {cabecalho}

      <div className="grid grid-cols-3 gap-2 text-center text-white">
        <div className="rounded-2xl bg-white/[0.07] px-2 py-2 ring-1 ring-inset ring-white/10">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-blue-100/60">Carta</p>
          <p className="text-lg font-black tabular-nums">
            {Math.min(indice + 1, total)}/{total}
          </p>
        </div>
        <div className="rounded-2xl bg-white/[0.07] px-2 py-2 ring-1 ring-inset ring-white/10">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-blue-100/60">Pontos</p>
          <p className="text-lg font-black tabular-nums text-yellow-300">{formatarPontos(estado.pontos)}</p>
        </div>
        <div
          className={`rounded-2xl px-2 py-2 ring-1 ring-inset ${
            multiplicador > 1 ? 'bg-orange-500/20 ring-orange-400/50' : 'bg-white/[0.07] ring-white/10'
          }`}
        >
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-blue-100/60">Combo</p>
          <p key={pulso} className={`flex items-center justify-center gap-1 text-lg font-black tabular-nums ${pulso ? 'vs-pulse' : ''}`}>
            <Flame className={`h-4 w-4 ${multiplicador > 1 ? 'fill-orange-400 text-orange-400' : 'text-blue-100/50'}`} />
            {estado.combo} <span className="text-sm text-orange-300">×{multiplicador}</span>
          </p>
        </div>
      </div>

      {/* Área da carta */}
      <div className="relative h-[min(58vh,26rem)] min-h-[19rem]">
        {/* Carta de baixo (decorativa) */}
        {indice + 1 < total && (
          <div aria-hidden className="absolute inset-x-4 bottom-0 top-3 translate-y-2 rounded-[2rem] bg-white/15" />
        )}
        {carta && (
          <div className="absolute inset-0">
            <SwipeCard
              key={`${rondaId}-${carta.id}`}
              carta={carta}
              numero={indice + 1}
              total={total}
              ativa={fase === 'jogar'}
              saida={saida}
              reducedMotion={reducedMotion}
              onDecidir={decidir}
            />
          </div>
        )}

        {/* Feedback */}
        {fase === 'feedback' && ultima && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-2">
            <div
              className={`vs-seal rounded-3xl border-4 px-6 py-4 text-center text-2xl font-black shadow-2xl sm:text-3xl ${
                ultima.certa
                  ? 'border-emerald-300 bg-emerald-500 text-white'
                  : 'border-orange-300 bg-orange-600 text-white'
              }`}
            >
              {seloTexto(ultima)}
              {ultima.certa && (
                <span className="mt-1 block text-base font-extrabold text-emerald-50">
                  +{ultima.pontos} pontos{ultima.multiplicador > 1 ? ` (×${ultima.multiplicador})` : ''}
                </span>
              )}
            </div>
            {!ultima.certa && (
              <div className="vs-fade-up w-full rounded-3xl bg-white p-5 text-slate-900 shadow-2xl">
                <p className="text-sm font-semibold text-slate-500">&ldquo;{ultima.carta.afirmacao}&rdquo;</p>
                <p className="mt-2 text-lg font-bold leading-snug">{ultima.carta.explicacao}</p>
                {ultima.carta.referencia && (
                  <p className="mt-2 text-sm font-bold text-indigo-700">📖 {ultima.carta.referencia}</p>
                )}
                <button
                  ref={continuarRef}
                  type="button"
                  onClick={avancar}
                  className="mt-4 w-full rounded-2xl bg-blue-950 py-3.5 text-lg font-black text-white transition hover:bg-blue-900 active:scale-[0.98]"
                >
                  Continuar
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Botões (obrigatórios para quem não arrasta) */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => responderCarta('distorcao')}
          disabled={fase !== 'jogar'}
          className="flex items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 text-lg font-black text-white shadow-lg shadow-orange-950/30 transition hover:bg-orange-400 active:scale-[0.97] disabled:opacity-40"
        >
          <ArrowLeft className="h-5 w-5" /> Distorção
        </button>
        <button
          type="button"
          onClick={() => responderCarta('verdade')}
          disabled={fase !== 'jogar'}
          className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-lg font-black text-white shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-400 active:scale-[0.97] disabled:opacity-40"
        >
          Verdade <ArrowRight className="h-5 w-5" />
        </button>
      </div>
      <p className="hidden text-center text-xs text-blue-100/50 sm:block">Teclado: ← Distorção · → Verdade · Enter para continuar</p>

      <div aria-live="polite" className="sr-only">
        {anuncio}
      </div>
    </div>
  )
}
