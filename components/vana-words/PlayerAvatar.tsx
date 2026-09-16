'use client'

import { useState } from 'react'

interface Props {
  avatarUrl: string | null | undefined
  name: string
  className?: string
  fallbackClassName?: string
}

/**
 * Avatar de jogador com fallback para inicial quando a imagem não existe
 * ou falha a carregar (evita o ícone de imagem partida do browser).
 */
export function PlayerAvatar({ avatarUrl, name, className, fallbackClassName }: Props) {
  const [broken, setBroken] = useState(false)

  if (!avatarUrl || broken) {
    return (
      <span className={fallbackClassName}>
        {name.charAt(0).toUpperCase()}
      </span>
    )
  }

  return (
    <img
      src={avatarUrl}
      alt=""
      className={className}
      onError={() => setBroken(true)}
    />
  )
}
