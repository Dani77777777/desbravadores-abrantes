/**
 * Põe a página em ecrã inteiro (projetores dos jogos ao vivo).
 *
 * Tem de ser chamado dentro de um gesto do utilizador (clique ou tecla) — é o
 * mesmo clique que desbloqueia o áudio. Fora de um gesto, ou num browser sem a
 * API (iPhone), o pedido falha em silêncio.
 */
export function enterFullscreen() {
  if (typeof document === 'undefined' || document.fullscreenElement) return
  document.documentElement.requestFullscreen?.().catch(() => {})
}
