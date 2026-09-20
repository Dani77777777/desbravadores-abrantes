/**
 * Conteúdo único do "Como Jogar" do VanaTrilha.
 * Usado na página pública /jogos/vana-trilha/como-jogar e no modal dentro do jogo.
 * Escrever o texto duas vezes garante que um dia ficam diferentes — mudar só aqui.
 * (Sem hooks: funciona em Server e Client Components.)
 */

import { Hand, ListChecks, Footprints, Flag } from 'lucide-react'
import {
  VANATRILHA_BADGE_NAME,
  VANATRILHA_DAILY_LENGTH,
  VANATRILHA_DAILY_LIVES,
  VANATRILHA_MILAGRE_GOLD,
  VANATRILHA_PERFECT_BONUS_GOLD,
  VANATRILHA_PERFECT_BONUS_XP,
  VANATRILHA_REWARD_GOLD,
  VANATRILHA_REWARD_XP,
} from '@/types/vana-trilha'

export const HOW_TO_PLAY_STEPS = [
  {
    icon: Hand,
    title: 'Começa a etapa',
    text: (
      <>
        Abre o VanaTrilha e carrega em <strong>Começar Etapa</strong>.
      </>
    ),
  },
  {
    icon: ListChecks,
    title: 'Responde',
    text: <>Aparece uma pergunta com 4 opções. Escolhe uma.</>,
  },
  {
    icon: Footprints,
    title: 'Avança',
    text: (
      <>
        Se acertares, o teu peão <strong>avança uma casa</strong>. Se errares,{' '}
        <strong>perdes uma vida</strong> (tens {VANATRILHA_DAILY_LIVES}), ficas a saber a resposta certa e
        recebes outra pergunta.
      </>
    ),
  },
  {
    icon: Flag,
    title: 'Chega ao fim',
    text: (
      <>
        Chega ao fim das {VANATRILHA_DAILY_LENGTH} casas e <strong>completaste a etapa do dia</strong>!
      </>
    ),
  },
]

export const SPECIAL_TILES = [
  {
    emoji: '✨',
    name: 'Milagre',
    text: `Ganhas +${VANATRILHA_MILAGRE_GOLD} Gold extra, se completares a etapa.`,
    className: 'bg-yellow-50 border-yellow-200',
  },
  {
    emoji: '📜',
    name: 'Tábuas da Lei',
    text: 'Pergunta bónus de Verdadeiro ou Falso. Acertas? Avanças mais uma casa. Erras? Não perdes nada.',
    className: 'bg-violet-50 border-violet-200',
  },
  {
    emoji: '🌴',
    name: 'Fonte de Elim',
    text: 'Casa de descanso: se errares a pergunta a seguir, não perdes vida.',
    className: 'bg-teal-50 border-teal-200',
  },
]

export const REWARD_ROWS = [
  {
    label: 'Etapa completa',
    xp: VANATRILHA_REWARD_XP,
    gold: VANATRILHA_REWARD_GOLD,
  },
  {
    label: 'Sem nenhum erro (Jornada Perfeita)',
    xp: VANATRILHA_REWARD_XP + VANATRILHA_PERFECT_BONUS_XP,
    gold: VANATRILHA_REWARD_GOLD + VANATRILHA_PERFECT_BONUS_GOLD,
  },
  {
    label: 'Vidas esgotadas',
    xp: 0,
    gold: 0,
  },
]

export const FAQ = [
  {
    q: 'Posso jogar mais do que uma vez por dia?',
    a: 'Não — é uma etapa por dia. Amanhã há outra.',
  },
  {
    q: 'E se errar tudo?',
    a: 'Perdes as vidas e a etapa do dia fica por completar, mas amanhã podes tentar outra vez. E ficas a saber as respostas certas.',
  },
  {
    q: 'Preciso de saber a Bíblia toda?',
    a: 'Não. As perguntas são de coisas que aprendes no clube, e no fim de cada uma aparece a explicação com o versículo.',
  },
  {
    q: 'Posso parar a meio?',
    a: 'Podes. Se fechares a página, quando voltares continuas na mesma pergunta, com as mesmas vidas.',
  },
  {
    q: 'Onde vejo o meu XP?',
    a: 'No teu perfil, no site do clube.',
  },
]

export function HowToPlaySteps({ compact = false }: { compact?: boolean }) {
  return (
    <ol className={compact ? 'space-y-3' : 'grid gap-4 sm:grid-cols-2'}>
      {HOW_TO_PLAY_STEPS.map((step, i) => (
        <li
          key={step.title}
          className={`flex gap-3 rounded-2xl border border-amber-100 bg-white ${compact ? 'p-3' : 'p-4 shadow-sm'}`}
        >
          <div className="relative flex-shrink-0">
            <div
              className={`flex items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white ${
                compact ? 'h-10 w-10' : 'h-12 w-12'
              }`}
            >
              <step.icon className={compact ? 'h-5 w-5' : 'h-6 w-6'} />
            </div>
            <span className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#1E3A5F] text-[11px] font-black text-white">
              {i + 1}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-900">{step.title}</p>
            <p className="text-sm leading-relaxed text-slate-600">{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function SpecialTilesList({ compact = false }: { compact?: boolean }) {
  return (
    <ul className={compact ? 'space-y-2' : 'grid gap-3 sm:grid-cols-3'}>
      {SPECIAL_TILES.map((tile) => (
        <li key={tile.name} className={`flex items-start gap-3 rounded-2xl border p-3 ${tile.className}`}>
          <span className="text-2xl leading-none" aria-hidden>
            {tile.emoji}
          </span>
          <div>
            <p className="font-bold text-slate-900">{tile.name}</p>
            <p className="text-sm leading-snug text-slate-600">{tile.text}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function RewardsTable() {
  return (
    <div className="overflow-hidden rounded-2xl border border-amber-100 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-amber-50 text-left text-xs font-bold uppercase tracking-wider text-amber-800">
          <tr>
            <th className="px-3 py-2">Resultado</th>
            <th className="px-3 py-2 text-right">XP</th>
            <th className="px-3 py-2 text-right">Gold</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-50">
          {REWARD_ROWS.map((row) => (
            <tr key={row.label}>
              <td className="px-3 py-2.5 font-medium text-slate-700">{row.label}</td>
              <td className="px-3 py-2.5 text-right font-black text-indigo-600">{row.xp}</td>
              <td className="px-3 py-2.5 text-right font-black text-yellow-600">{row.gold}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function RewardsNotes() {
  return (
    <ul className="space-y-1.5 text-sm text-slate-600">
      <li>🪙 O Gold gasta-se na loja do clube.</li>
      <li>✨ A casa Milagre dá +{VANATRILHA_MILAGRE_GOLD} Gold extra nesse dia.</li>
      <li>
        🏅 Completa as 7 estações da viagem e ganhas a insígnia <strong>{VANATRILHA_BADGE_NAME}</strong>.
      </li>
    </ul>
  )
}
