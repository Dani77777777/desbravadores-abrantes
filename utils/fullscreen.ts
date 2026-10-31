/**
 * Põe a página em ecrã inteiro (projetores dos jogos ao vivo).
 *
 * Tem de ser chamado dentro de um gesto do utilizador (clique ou tecla) — é o
 * mesmo clique que desbloqueia o áudio. Fora de um gesto, ou num browser sem a
 * API (iPhone), o pedido falha em silêncio.
 *
 * `lockEscape`: prende a tecla Esc enquanto está em ecrã inteiro (Keyboard Lock,
 * Chrome/Edge/Brave). Assim um Esc sem querer já não sai: é preciso manter o Esc
 * carregado. Nos browsers sem a API fica o comportamento normal.
 */
export function enterFullscreen(opts: { lockEscape?: boolean } = {}) {
  if (typeof document === 'undefined') return
  const lock = () => {
    if (!opts.lockEscape) return
    const keyboard = (navigator as Navigator & { keyboard?: { lock?: (keys: string[]) => Promise<void> } }).keyboard
    keyboard?.lock?.(['Escape']).catch(() => {})
  }
  if (document.fullscreenElement) {
    lock()
    return
  }
  document.documentElement.requestFullscreen?.().then(lock).catch(() => {})
}

/**
 * A janela está a ocupar o ecrã todo? Conta o ecrã inteiro da página e também o
 * do próprio browser (F11), que não aparece em `document.fullscreenElement`.
 */
export function isWindowFullscreen(): boolean {
  if (typeof document === 'undefined') return true
  if (document.fullscreenElement) return true
  return window.innerHeight >= screen.height - 2 && window.innerWidth >= screen.width - 2
}
