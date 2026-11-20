import type { VanaQuestTheme } from './types'

/**
 * Tema por omissão: o VanaQuest tal como sempre foi. Não tem `skin` nem `Backdrop`,
 * por isso o VanaQuestThemeScope não acrescenta nada à página.
 * É também o fallback de todos os sons dos outros temas — tem de ter TODOS os sons.
 */
export const normalTheme = {
  id: 'normal',
  name: 'Normal',
  emoji: '🎯',
  description: 'O VanaQuest de sempre.',
  preview: {
    background: 'linear-gradient(135deg, #172554 0%, #1e3a8a 55%, #312e81 100%)',
    swatches: ['#1e3a8a', '#7dd3fc', '#facc15'],
  },
  sounds: {
    lobby: 'VanaQuest - Lobby Theme.mp3',
    thinkFast: 'VanaQuest - Think Fast.mp3',
    standings: 'VanaQuest - Standings.mp3',
    podiumIntro: 'VanaQuest - Podium Intro.mp3',
    victory: 'VanaQuest - Victory Celebration.mp3',
    answered: 'player-answered.mp3',
    lightning: 'lightning - x2 and x3 points.mp3',
    earning: 'earning points.mp3',
    end: 'theend.mp3',
  },
} satisfies VanaQuestTheme & { sounds: Required<VanaQuestTheme['sounds']> }
