/**
 * Gorro de Natal pousado no fim do nome do quiz (enfeite de título).
 * Tamanho em `em`, por isso acompanha o tamanho do título onde está.
 */
export function SantaHat() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 64 56"
      className="pointer-events-none absolute"
      style={{ width: '0.95em', height: '0.85em', top: '-0.5em', right: '-0.6em', transform: 'scaleX(-1) rotate(-20deg)' }}
    >
      <path d="M8 42 C 14 18, 34 4, 52 10 C 46 16, 44 26, 50 40 Z" fill="#dc2626" />
      <path d="M52 10 C 46 16, 44 26, 50 40 L 44 40 C 40 28, 42 18, 52 10 Z" fill="#991b1b" opacity="0.55" />
      <rect x="4" y="38" width="50" height="12" rx="6" fill="#f8fafc" />
      <circle cx="54" cy="10" r="7" fill="#f8fafc" />
    </svg>
  )
}
