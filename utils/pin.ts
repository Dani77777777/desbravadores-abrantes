/** PIN de 6 dígitos para entrar numa sessão de jogo (VanaQuest, VanaEspada). */
export function generatePin(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}
