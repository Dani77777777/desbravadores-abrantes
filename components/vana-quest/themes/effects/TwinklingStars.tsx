/**
 * Estrelas douradas espalhadas pelas margens do ecrã, a cintilar devagar.
 * Posições fixas (iguais em todos os ecrãs e sem Math.random no render).
 */
const STARS: { top: number; left: number; size: number; delay: number }[] = [
  { top: 9, left: 4, size: 22, delay: 0 },
  { top: 18, left: 93, size: 18, delay: 1.2 },
  { top: 34, left: 2, size: 14, delay: 2.1 },
  { top: 47, left: 97, size: 20, delay: 0.6 },
  { top: 63, left: 5, size: 16, delay: 1.7 },
  { top: 78, left: 94, size: 14, delay: 2.6 },
  { top: 90, left: 8, size: 20, delay: 0.9 },
  { top: 94, left: 88, size: 16, delay: 3.1 },
  { top: 12, left: 30, size: 12, delay: 2.3 },
  { top: 8, left: 70, size: 14, delay: 1.4 },
  { top: 96, left: 45, size: 12, delay: 0.3 },
  { top: 92, left: 66, size: 12, delay: 2.9 },
]

export function TwinklingStars({ count = STARS.length }: { count?: number }) {
  return (
    <div aria-hidden className="vq-fx-layer">
      {STARS.slice(0, count).map((s, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className="vq-star"
          style={{ top: `${s.top}%`, left: `${s.left}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s` }}
        >
          <path d="M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z" fill="currentColor" />
        </svg>
      ))}
    </div>
  )
}
