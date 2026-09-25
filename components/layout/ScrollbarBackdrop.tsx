'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

// A trilha da scrollbar da página é transparente e mostra o fundo do <html>.
// Como cada página pinta o seu próprio fundo (claro, azul, gradientes…), este
// componente lê a cor que está junto à margem direita e aplica-a ao <html>,
// para a scrollbar se fundir com a página em vez de aparecer uma faixa branca.

const COLOR_RE = /(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)/g

function isOpaque(color: string) {
  if (!color || color === 'transparent') return false
  const slash = color.match(/\/\s*([\d.]+)(%?)\s*\)$/)
  if (slash) return parseFloat(slash[1]) / (slash[2] ? 100 : 1) >= 0.99
  const rgba = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)$/)
  if (rgba) return parseFloat(rgba[1]) >= 0.99
  return true
}

function edgeColor(): string | null {
  const root = document.documentElement
  const x = root.clientWidth - 1
  const y = Math.round(window.innerHeight / 2)
  const minWidth = root.clientWidth * 0.9

  for (const el of document.elementsFromPoint(x, y)) {
    if (el === root || el === document.body) break
    if (el.getBoundingClientRect().width < minWidth) continue
    const style = getComputedStyle(el)
    if (isOpaque(style.backgroundColor)) return style.backgroundColor
    if (style.backgroundImage.includes('gradient')) {
      const stops = (style.backgroundImage.match(COLOR_RE) ?? []).filter(isOpaque)
      // Margem direita a meia altura ≈ cor do meio do gradiente
      if (stops.length) return stops[Math.floor((stops.length - 1) / 2 + 0.5)]
    }
  }
  return null
}

export function ScrollbarBackdrop() {
  const pathname = usePathname()

  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        document.documentElement.style.backgroundColor = edgeColor() ?? ''
      })
    }

    update()
    // Os jogos trocam de ecrã sem mudar de rota, por isso vigiamos o DOM.
    let timeout: ReturnType<typeof setTimeout>
    const observer = new MutationObserver(() => {
      clearTimeout(timeout)
      timeout = setTimeout(update, 150)
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    window.addEventListener('resize', update)

    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timeout)
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [pathname])

  return null
}
