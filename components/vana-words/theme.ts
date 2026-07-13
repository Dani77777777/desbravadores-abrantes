import { Newsreader, Source_Sans_3 } from 'next/font/google'
import type { TeamId, WordTeam } from '@/types/vana-words'

// Tipografia do design (Claude Design: VanaWords.dc.html)
export const vwSerif = Newsreader({ subsets: ['latin'], weight: ['500', '600'], style: ['normal', 'italic'] })
export const vwSans = Source_Sans_3({ subsets: ['latin'], weight: ['400', '600', '700', '800'] })

// Fundo do ecrã (gradientes radiais + linear, tradução directa de --screen no mockup)
export const VW_SCREEN_STYLE: React.CSSProperties = {
  background: [
    'radial-gradient(1200px 620px at 16% -12%, rgba(63,140,255,.13), transparent 60%)',
    'radial-gradient(1100px 560px at 90% -6%, rgba(245,166,35,.12), transparent 55%)',
    'linear-gradient(168deg,#0d1533,#0a1022 58%,#0b1126)',
  ].join(', '),
  color: '#eef1f8',
}

// Cores base (--ink, --mut, --amber, --blue, --gold, --panel, --pline)
export const VW = {
  ink: '#eef1f8',
  mut: '#93a0bd',
  amber: '#f5a623',
  blue: '#3f8cff',
  gold: '#d8b25f',
  panel: 'rgba(255,255,255,.045)',
  pline: 'rgba(255,255,255,.09)',
} as const

// Paleta dos cartões por equipa — tradução directa do objecto `pal` do mockup
type CardTeam = WordTeam extends infer T ? Exclude<T, null> : never
export const TEAM_CARD_PALETTE: Record<CardTeam, { fill: string; text: string; ring: string }> = {
  a: { fill: 'linear-gradient(162deg,#ffb43e,#ef9016)', text: '#1e1305', ring: 'rgba(245,166,35,.55)' },
  b: { fill: 'linear-gradient(162deg,#5a9cff,#2c72ec)', text: '#f5f9ff', ring: 'rgba(63,140,255,.55)' },
  neutral: { fill: 'linear-gradient(162deg,#ece1c9,#dccfb1)', text: '#332c1a', ring: 'rgba(230,220,198,.5)' },
  black: { fill: 'linear-gradient(162deg,#1c0a0e,#0b0305)', text: '#ff5b4e', ring: 'rgba(217,58,47,.75)' },
}

// Gradiente âmbar/azul usado nos avatares e botões de equipa
export const TEAM_GRADIENT: Record<'a' | 'b', string> = {
  a: 'linear-gradient(160deg,#ffc65b,#f0951b)',
  b: 'linear-gradient(160deg,#6ea8ff,#2f77ef)',
}

// Painel neutro (fundo translúcido + borda subtil) — tradução de --panel/--pline
export const VW_PANEL_STYLE: React.CSSProperties = { background: VW.panel, borderColor: VW.pline }

// Painel destacado com a cor da equipa (badges, banners de turno)
export function teamPanelStyle(team: TeamId, opts?: { strong?: boolean }): React.CSSProperties {
  const rgb = team === 'a' ? '245,166,35' : '63,140,255'
  return {
    background: opts?.strong
      ? `linear-gradient(90deg, rgba(${rgb},.18), rgba(${rgb},.03))`
      : `rgba(${rgb},.08)`,
    borderColor: `rgba(${rgb},${opts?.strong ? '.42' : '.35'})`,
  }
}

// Aplica no painel do turno activo (pulsar suave à volta do painel)
export const VW_SOFT_PULSE: React.CSSProperties = { animation: 'vw-softPulse 2.8s ease-in-out infinite' }
