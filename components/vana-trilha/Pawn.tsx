interface Props {
  className?: string
}

/** Peão do VanaTrilha — um peregrino simpático com cajado. */
export default function Pawn({ className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 40 48"
      className={`drop-shadow-md ${className}`}
      aria-hidden
    >
      {/* sombra */}
      <ellipse cx="20" cy="45" rx="11" ry="2.5" fill="rgba(0,0,0,0.18)" />
      {/* base */}
      <path d="M8 43 Q20 36 32 43 Z" fill="#1E3A5F" />
      {/* corpo / manto */}
      <path d="M12 42 L15 22 Q20 18 25 22 L28 42 Z" fill="#F59E0B" stroke="#B45309" strokeWidth="1.2" />
      {/* faixa */}
      <path d="M14.2 30 Q20 32.5 25.8 30" fill="none" stroke="#1E3A5F" strokeWidth="2" strokeLinecap="round" />
      {/* cabeça */}
      <circle cx="20" cy="14" r="7" fill="#FDE7C8" stroke="#B45309" strokeWidth="1.2" />
      {/* lenço */}
      <path d="M12.6 13 Q20 4 27.4 13 Q24 9.5 20 9.5 Q16 9.5 12.6 13 Z" fill="#FBBF24" stroke="#B45309" strokeWidth="1" />
      {/* olhos */}
      <circle cx="17.6" cy="15" r="1" fill="#1E3A5F" />
      <circle cx="22.4" cy="15" r="1" fill="#1E3A5F" />
      <path d="M18 18 Q20 19.4 22 18" fill="none" stroke="#1E3A5F" strokeWidth="0.9" strokeLinecap="round" />
      {/* cajado */}
      <path d="M31 42 L31 14 Q31 9 35 9.5" fill="none" stroke="#78350F" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}
