/**
 * Formata um nome completo para apresentação compacta nos jogos
 * (VanaQuest, VanaCamp, leaderboards in-game).
 *
 * Regra: devolve apenas o PRIMEIRO e o ÚLTIMO nome.
 *   "João Pedro Silva Costa"  → "João Costa"
 *   "Maria da Silva"          → "Maria Silva"
 *   "João"                    → "João"
 *   null / "" / "   "         → fallback (default: "Jogador")
 *
 * Notas:
 *   - Espaços extra são colapsados antes de partir.
 *   - Partículas comuns ("da", "de", "do", "dos", "das", "e") não contam
 *     como "último nome" — saltamos para trás até encontrar uma palavra real.
 *     "Ana de Sousa"  → "Ana Sousa"   (não "Ana de")
 *     "Pedro da Silva e Costa" → "Pedro Costa"
 */
const PARTICLES = new Set(['da', 'de', 'do', 'dos', 'das', 'e', 'di', 'du'])

export function shortDisplayName(fullName: string | null | undefined, fallback = 'Jogador'): string {
  if (!fullName) return fallback
  const tokens = fullName.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return fallback
  if (tokens.length === 1) return tokens[0]

  const first = tokens[0]

  // Encontra o último token que não seja uma partícula
  let lastIdx = tokens.length - 1
  while (lastIdx > 0 && PARTICLES.has(tokens[lastIdx].toLowerCase())) {
    lastIdx--
  }

  // Se calhar não há "último" válido (ex: nome só com partículas) — devolve o primeiro
  if (lastIdx === 0) return first

  return `${first} ${tokens[lastIdx]}`
}
