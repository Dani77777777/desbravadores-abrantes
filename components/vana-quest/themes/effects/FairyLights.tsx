/**
 * Fio de luzinhas de Natal ao longo do topo do ecrã, a piscar devagar.
 * Fica por trás do conteúdo (camada de efeitos), por isso nunca tapa nada.
 * A animação (vq-twinkle) desliga-se com "reduzir movimento" (themes.css).
 */
const HOOKS = 6 // pontos onde o fio está pendurado
const BULBS_PER_SPAN = 5
const SAG = 16 // quanto o fio desce entre ganchos (px, no viewBox de 40 de altura)
const BULB_COLORS = ['#fcd34d', '#4ade80', '#f8fafc', '#60a5fa', '#fb923c']

function sagY(frac: number) {
  return 4 + SAG * Math.sin(Math.PI * frac)
}

export function FairyLights() {
  const span = 1000 / HOOKS
  const wire = Array.from({ length: HOOKS }, (_, i) => {
    const x0 = i * span
    return `M ${x0} 4 Q ${x0 + span / 2} ${4 + SAG * 2} ${x0 + span} 4`
  }).join(' ')

  const bulbs: { left: number; top: number; color: string; delay: number }[] = []
  for (let i = 0; i < HOOKS; i++) {
    for (let j = 1; j <= BULBS_PER_SPAN; j++) {
      const frac = j / (BULBS_PER_SPAN + 1)
      const n = i * BULBS_PER_SPAN + j
      bulbs.push({
        left: ((i + frac) / HOOKS) * 100,
        top: sagY(frac),
        color: BULB_COLORS[n % BULB_COLORS.length],
        delay: (n * 0.73) % 3.2,
      })
    }
  }

  return (
    <div aria-hidden className="vq-fx-lights">
      <svg viewBox="0 0 1000 40" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <path d={wire} fill="none" stroke="rgba(20, 30, 20, 0.85)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      {bulbs.map((b, i) => (
        <span
          key={i}
          className="vq-bulb"
          style={{
            left: `${b.left}%`,
            top: `${(b.top / 40) * 100}%`,
            background: b.color,
            color: b.color,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
