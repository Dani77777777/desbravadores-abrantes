import { Caveat, Source_Sans_3 } from 'next/font/google'

// Tipografia: sans para UI + manuscrita para títulos/palavras (ar de rabisco)
export const vsSans = Source_Sans_3({ subsets: ['latin'], weight: ['400', '600', '700', '800'] })
export const vsHand = Caveat({ subsets: ['latin'], weight: ['500', '700'] })

// Fundo do ecrã — índigo escuro com brilhos coral/âmbar (irmão do VanaWords)
export const VS_SCREEN_STYLE: React.CSSProperties = {
  background: [
    'radial-gradient(1200px 620px at 14% -12%, rgba(255,93,162,.14), transparent 60%)',
    'radial-gradient(1100px 560px at 90% -6%, rgba(255,170,60,.12), transparent 55%)',
    'linear-gradient(168deg,#141032,#0d0a22 58%,#120e2a)',
  ].join(', '),
  color: '#f3eefb',
}

export const VS = {
  ink: '#f3eefb',
  mut: '#a89cc8',
  pink: '#ff5da2',
  amber: '#ffb347',
  teal: '#3ecfb2',
  panel: 'rgba(255,255,255,.05)',
  pline: 'rgba(255,255,255,.1)',
} as const

export const VS_PANEL_STYLE: React.CSSProperties = { background: VS.panel, borderColor: VS.pline }
