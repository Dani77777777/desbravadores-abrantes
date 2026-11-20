import type { VanaQuestSurface, VanaQuestTheme } from './types'
import { Snowfall } from './effects/Snowfall'
import { FairyLights } from './effects/FairyLights'
import { TwinklingStars } from './effects/TwinklingStars'
import { SantaHat } from './effects/SantaHat'

const BACKGROUND = 'linear-gradient(160deg, #7a0f1a 0%, #5c0b16 45%, #3d0610 100%)'

/** Camadas por trás do conteúdo: estrelas, luzinhas (só no projetor) e neve. */
function NatalBackdrop({ surface }: { surface: VanaQuestSurface }) {
  const projector = surface === 'projector'
  return (
    <>
      <TwinklingStars count={projector ? 12 : 6} />
      {projector && <FairyLights />}
      <Snowfall flakes={projector ? 110 : 45} maxDpr={projector ? 2 : 1.5} />
    </>
  )
}

export const natalTheme: VanaQuestTheme = {
  id: 'natal',
  name: 'Natal',
  emoji: '🎄',
  description: 'Vermelho, dourado, neve e luzinhas.',
  preview: {
    background: BACKGROUND,
    swatches: ['#7a0f1a', '#fcd34d', '#f8fafc'],
  },
  skin: {
    '--vq-bg': BACKGROUND,
    '--vq-panel': 'linear-gradient(135deg, #4a0812 0%, #6b0f1a 60%, #3d0610 100%)',
    '--vq-title': '#fcd34d',
    '--vq-number': '#fde68a',
    '--vq-number-shadow': '0 2px 14px rgba(0, 0, 0, 0.45)',
    // Os textos de destaque azul-céu do jogo passam a dourado (as cores A/B/C/D não usam "sky").
    '--color-sky-200': '#fef3c7',
    '--color-sky-300': '#fde68a',
    '--color-sky-400': '#fcd34d',
    '--vq-counter-bg': 'linear-gradient(135deg, #b91c1c 0%, #7f1d1d 100%)',
    '--vq-option-ring': 'rgba(252, 211, 77, 0.95)',
    '--vq-option-ornament': '"❄"',
    '--vq-card-border': 'rgba(252, 211, 77, 0.35)',
    '--vq-card-ornament': '"❄"',
  },
  Backdrop: NatalBackdrop,
  titleOrnament: <SantaHat />,
  podium: {
    ringOffsetClassName: 'ring-offset-[#4a0812]',
    celebration: {
      colors: ['#fde68a', '#fcd34d', '#f59e0b', '#ffffff', '#fef3c7'],
      shapes: ['star'],
      textShapes: ['❄'],
      scalar: 1.3,
    },
  },
  shareCard: {
    background: BACKGROUND,
    accent: '#fcd34d',
    titleEmoji: '🎄',
    captureBackground: '#3d0610',
  },
  // lightning, earning e end não têm versão de Natal de propósito → tocam os normais.
  sounds: {
    lobby: 'VanaQuest - Lobby Theme - Natal.mp3',
    thinkFast: 'VanaQuest - Think Fast - Natal.mp3',
    standings: 'VanaQuest - Standings - Natal.mp3',
    podiumIntro: 'VanaQuest - Podium Intro - Natal.mp3',
    victory: 'VanaQuest - Victory Celebration - Natal.mp3',
    answered: 'player-answered-natal.mp3',
  },
}
