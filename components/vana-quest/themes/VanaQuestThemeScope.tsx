'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { getVanaQuestTheme, normalTheme, type VanaQuestSurface, type VanaQuestTheme } from './index'
import './themes.css'

const ThemeContext = createContext<VanaQuestTheme>(normalTheme)

/** Tema do VanaQuest em jogo (por omissão: normal). */
export function useVanaQuestTheme() {
  return useContext(ThemeContext)
}

/**
 * Aplica o tema a todo o ecrã do jogo (apresentação ou telemóvel).
 *
 * - Tema sem `skin` (o normal): só disponibiliza o tema por contexto — a página fica
 *   exatamente igual, sem nenhum elemento a mais.
 * - Tema com `skin`: envolve o jogo num `data-vq-skin` com as variáveis CSS do tema,
 *   pinta o fundo por trás de tudo e põe as camadas do tema (neve, luzinhas...) entre
 *   o fundo e o conteúdo — por isso os efeitos nunca tapam perguntas nem respostas.
 *   As regras que usam as variáveis estão em themes.css.
 */
export function VanaQuestThemeScope({
  themeId,
  surface,
  children,
}: {
  themeId: string | null | undefined
  surface: VanaQuestSurface
  children: ReactNode
}) {
  const theme = getVanaQuestTheme(themeId)

  if (!theme.skin) {
    return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  }

  const Backdrop = theme.Backdrop
  return (
    <ThemeContext.Provider value={theme}>
      <div data-vq-skin={theme.id} data-vq-surface={surface} style={theme.skin}>
        <div aria-hidden className="vq-skin-bg" />
        {Backdrop && <Backdrop surface={surface} />}
        <div className="vq-skin-content">{children}</div>
      </div>
    </ThemeContext.Provider>
  )
}

/** Nome do quiz com o enfeite do tema (ex.: gorro de Natal). Sem enfeite, devolve só o texto. */
export function ThemedTitle({ children }: { children: ReactNode }) {
  const { titleOrnament } = useVanaQuestTheme()
  if (!titleOrnament) return <>{children}</>
  return (
    <span className="relative inline-block">
      {titleOrnament}
      {children}
    </span>
  )
}
