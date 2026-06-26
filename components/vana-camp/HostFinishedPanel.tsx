'use client'

import { useEffect, useRef, useState } from 'react'
import { Trophy, Bot, Coins, Sparkles, Check, AlertCircle, User, Share2, Download } from 'lucide-react'
import {
  previewRewards,
  awardRewards,
  getVictoryCardData,
  type VanaCampPlayerReward,
} from '@/lib/actions/vana-camp'
import type { VanaCampSide } from '@/types/vana-camp'
import { VanaCampVictoryCard } from './VanaCampVictoryCard'

interface Props {
  sessionId: string
  winnerSide: VanaCampSide | null
}

export function HostFinishedPanel({ sessionId, winnerSide }: Props) {
  const [rewards, setRewards] = useState<VanaCampPlayerReward[]>([])
  const [alreadyAwarded, setAlreadyAwarded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [awarding, setAwarding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [card, setCard] = useState<Awaited<ReturnType<typeof getVictoryCardData>> | null>(null)
  const [sharing, setSharing] = useState(false)
  const [shareToast, setShareToast] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { getVictoryCardData(sessionId).then(setCard) }, [sessionId])

  async function handleShare() {
    if (sharing || !cardRef.current) return
    setSharing(true); setShareToast(null)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true })
      const fileName = `vanacamp-${winnerSide ?? 'fim'}-${Date.now()}.png`
      const date = new Date().toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })
      const text = isInfWin
        ? `🕵️ VanaCamp — ${date}\n\nOs INFILTRADOS venceram! Enganaram o acampamento e não foram descobertos a tempo.\n\nSerás tu a descobri-los no próximo jogo? 🔦`
        : `🏕️ VanaCamp — ${date}\n\nOs DESBRAVADORES venceram! Descobriram todos os Infiltrados e salvaram o acampamento. 🎉\n\nJunta-te ao próximo jogo!`
      try {
        const res = await fetch(dataUrl)
        const blob = await res.blob()
        const file = new File([blob], fileName, { type: 'image/png' })
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Resultado VanaCamp', text })
          setShareToast('Partilhado!')
          return
        }
      } catch { /* sem Web Share — faz download */ }
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = fileName
      link.click()
      setShareToast('Imagem transferida!')
    } catch {
      setShareToast('Erro ao gerar imagem')
    } finally {
      setSharing(false)
      setTimeout(() => setShareToast(null), 3000)
    }
  }

  async function load() {
    setLoading(true)
    const r = await previewRewards(sessionId)
    if (r.error) setError(r.error)
    else {
      setRewards(r.rewards)
      setAlreadyAwarded(r.already_awarded)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [sessionId])

  async function handleAward() {
    if (!confirm('Atribuir XP e Gold a todos os jogadores? Esta ação não pode ser desfeita.')) return
    setAwarding(true)
    setError(null)
    const r = await awardRewards(sessionId)
    setAwarding(false)
    if (r.error) {
      setError(r.error)
    } else {
      setSuccess(`✓ Prémios atribuídos a ${r.awarded ?? 0} jogador(es).` +
        (r.skipped_bots ? ` ${r.skipped_bots} bot(s) ignorados.` : ''))
      await load()
    }
  }

  const isInfWin = winnerSide === 'infiltrators'
  const totalXp = rewards.reduce((s, r) => s + (r.is_bot ? 0 : r.xp), 0)
  const totalGold = rewards.reduce((s, r) => s + (r.is_bot ? 0 : r.gold), 0)

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-5">
      <header className="text-center space-y-3 py-6">
        <Trophy className={`w-20 h-20 mx-auto drop-shadow-lg ${isInfWin ? 'text-red-300' : 'text-amber-300'}`} />
        <h1 className="text-4xl font-black text-amber-100">
          {isInfWin ? 'Vitória dos Infiltrados' : 'Vitória dos Desbravadores'}
        </h1>
        <p className="text-amber-300/70">
          {isInfWin
            ? 'Os Infiltrados não foram descobertos a tempo.'
            : 'Os Infiltrados foram todos descobertos.'}
        </p>
      </header>

      <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-amber-200 font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5" /> Atribuir XP e Gold
          </h2>
          {alreadyAwarded && (
            <span className="text-emerald-300 text-sm flex items-center gap-1 font-semibold">
              <Check className="w-4 h-4" /> Já atribuído
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-stone-400 text-sm">A calcular prémios…</p>
        ) : (
          <>
            <div className="flex items-center gap-4 text-sm bg-stone-900/60 rounded p-3">
              <div className="flex items-center gap-1.5 text-amber-200">
                <Sparkles className="w-4 h-4" />
                <span className="font-bold">{totalXp}</span> XP total
              </div>
              <div className="flex items-center gap-1.5 text-amber-300">
                <Coins className="w-4 h-4" />
                <span className="font-bold">{totalGold}</span> gold total
              </div>
            </div>

            <ul className="space-y-1.5 max-h-96 overflow-y-auto">
              {rewards.map((r) => (
                <li
                  key={r.player_id}
                  className={`bg-stone-900/60 rounded p-3 ${r.is_bot ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-stone-100 font-medium">
                      {r.is_bot ? <Bot className="w-4 h-4 text-purple-300" /> : <User className="w-4 h-4 text-stone-400" />}
                      {r.display_name}
                      {r.is_bot && (
                        <span className="text-[10px] uppercase tracking-wider bg-purple-900/60 text-purple-200 px-1.5 py-0.5 rounded">bot</span>
                      )}
                    </span>
                    {r.is_bot ? (
                      <span className="text-stone-500 text-xs italic">não recebe prémios</span>
                    ) : (
                      <span className="flex items-center gap-3 text-sm">
                        <span className="text-amber-200"><strong>+{r.xp}</strong> XP</span>
                        <span className="text-amber-300"><strong>+{r.gold}</strong> gold</span>
                      </span>
                    )}
                  </div>
                  {r.reasons.length > 0 && (
                    <ul className="text-xs text-stone-400 mt-1 ml-6 list-disc list-inside">
                      {r.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {error && (
          <div className="bg-red-950/50 border border-red-700 text-red-200 rounded p-3 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}
        {success && (
          <div className="bg-emerald-950/50 border border-emerald-700 text-emerald-200 rounded p-3 text-sm">
            {success}
          </div>
        )}

        {!alreadyAwarded && rewards.length > 0 && (
          <button
            onClick={handleAward}
            disabled={awarding || loading}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-stone-700 disabled:text-stone-500 text-white font-bold py-3 rounded transition flex items-center justify-center gap-2"
          >
            <Sparkles className="w-5 h-5" /> {awarding ? 'A atribuir…' : 'Atribuir XP e Gold'}
          </button>
        )}
      </section>

      {/* Partilhar imagem de vitória */}
      {card?.winner_side && (card.winners?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <button
            onClick={handleShare}
            disabled={sharing}
            className="w-full bg-stone-800 hover:bg-stone-700 disabled:opacity-50 border border-amber-700/40 text-amber-100 font-bold py-3 rounded transition flex items-center justify-center gap-2"
          >
            {sharing ? 'A gerar imagem…' : (<><Share2 className="w-5 h-5" /> Partilhar resultado</>)}
          </button>
          {shareToast && (
            <div className="bg-amber-950/40 border border-amber-700/40 text-amber-200 rounded p-3 text-sm text-center flex items-center justify-center gap-2">
              <Download className="w-4 h-4" /> {shareToast}
            </div>
          )}
          {/* Card escondido (off-screen) para captura */}
          <div style={{ position: 'fixed', left: '-99999px', top: 0, pointerEvents: 'none' }} aria-hidden="true">
            <VanaCampVictoryCard ref={cardRef} winnerSide={card.winner_side} winners={card.winners ?? []} />
          </div>
        </section>
      )}
    </div>
  )
}
