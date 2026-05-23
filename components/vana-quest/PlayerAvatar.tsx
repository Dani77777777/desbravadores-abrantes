/**
 * Avatar reutilizável para o VanaQuest.
 * Mostra a foto se existir, senão mostra a primeira letra do nome no fundo dado.
 */
interface Props {
  name: string
  avatarUrl?: string | null
  className?: string  // ex.: "w-12 h-12"
  textClassName?: string // ex.: "text-xl"
  fallbackBg?: string // ex.: "bg-purple-500/40"
}

export function PlayerAvatar({
  name,
  avatarUrl,
  className = 'w-10 h-10',
  textClassName = 'text-sm',
  fallbackBg = 'bg-blue-500/40',
}: Props) {
  const letter = (name?.[0] || '?').toUpperCase()

  if (avatarUrl) {
    return (
      <div className={`${className} rounded-full overflow-hidden flex-shrink-0 bg-white/10`}>
        <img
          src={avatarUrl}
          alt={name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      </div>
    )
  }

  return (
    <div className={`${className} ${fallbackBg} rounded-full flex items-center justify-center text-white font-black flex-shrink-0 ${textClassName}`}>
      {letter}
    </div>
  )
}
