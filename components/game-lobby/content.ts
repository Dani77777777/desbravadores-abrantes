// Conteúdo da sala de espera dos jogos ao vivo (VanaQuest + VanaEspada):
// emojis que os telemóveis podem enviar, cores e o carrossel "Sabias que…?".

export type LobbyGame = 'vana-quest' | 'vana-espada'

export interface LobbyTip {
  icon: string
  title: string
  text: string
}

/** Tópico de broadcast da sala: os telemóveis só ENVIAM, só o projetor o subscreve. */
export function lobbyTopic(game: LobbyGame, sessionId: string) {
  return `lobby-hype-${game}-${sessionId}`
}

/**
 * Emojis do teclado de reações. O telemóvel envia o ÍNDICE, não o emoji: assim o
 * projetor só mostra o que está nesta lista, e ninguém consegue pôr texto no ecrã.
 */
export const LOBBY_EMOJIS: Record<LobbyGame, string[]> = {
  'vana-quest': ['🔥', '😂', '👏', '🙌', '🤩', '⚡'],
  'vana-espada': ['🔥', '😂', '👏', '🙌', '⚔️', '📖'],
}

/** Classes completas (o Tailwind só gera o que aparece escrito por inteiro). */
export const LOBBY_THEMES: Record<LobbyGame, { accent: string; avatarBg: string; card: string }> = {
  'vana-quest': { accent: 'text-sky-300', avatarBg: 'bg-blue-500/40', card: 'bg-white/10 border-white/20' },
  'vana-espada': { accent: 'text-amber-300', avatarBg: 'bg-amber-500/40', card: 'bg-white/10 border-white/20' },
}

const BIBLE_FACTS: LobbyTip[] = [
  { icon: '📚', title: 'Sabias que…?', text: 'A Bíblia tem 66 livros: 39 no Antigo Testamento e 27 no Novo.' },
  { icon: '✂️', title: 'Sabias que…?', text: 'O Salmo 117 é o capítulo mais curto da Bíblia — só tem 2 versículos.' },
  { icon: '📜', title: 'Sabias que…?', text: 'O Salmo 119 é o capítulo mais longo: 176 versículos!' },
  { icon: '💧', title: 'Sabias que…?', text: 'Um dos versículos mais curtos da Bíblia é João 11:35 — "Jesus chorou."' },
  { icon: '👴', title: 'Sabias que…?', text: 'Matusalém foi o homem que mais viveu na Bíblia: 969 anos (Génesis 5:27).' },
  { icon: '🌍', title: 'Sabias que…?', text: 'A Bíblia foi escrita em três línguas: hebraico, aramaico e grego.' },
  { icon: '🎵', title: 'Sabias que…?', text: 'Salmos é o livro com mais capítulos: 150.' },
  { icon: '🤏', title: 'Sabias que…?', text: 'Obadias é o livro mais curto do Antigo Testamento: 1 capítulo, 21 versículos.' },
  { icon: '🐋', title: 'Sabias que…?', text: 'Jonas esteve três dias e três noites no ventre do grande peixe (Jonas 1:17).' },
  { icon: '🪨', title: 'Sabias que…?', text: 'Os Dez Mandamentos estão em Êxodo 20 e repetem-se em Deuteronómio 5.' },
  { icon: '🖨️', title: 'Sabias que…?', text: 'O primeiro grande livro impresso por Gutenberg, por volta de 1455, foi a Bíblia.' },
  { icon: '🚢', title: 'Sabias que…?', text: 'A arca de Noé media 300 côvados de comprimento — mais de 130 metros (Génesis 6:15).' },
]

const GAME_TIPS: Record<LobbyGame, LobbyTip[]> = {
  'vana-quest': [
    { icon: '⚡', title: 'Dica', text: 'Quanto mais rápido respondes, mais pontos ganhas.' },
    { icon: '🔥', title: 'Dica', text: 'Acerta seguidas: com 3 certas seguidas os pontos dobram, com 5 triplicam!' },
    { icon: '✖️', title: 'Dica', text: 'Atenção às perguntas ×2 e ×3 — são anunciadas antes de aparecerem.' },
    { icon: '🪙', title: 'Dica', text: 'No fim, os teus pontos transformam-se em XP e Gold.' },
    { icon: '📱', title: 'Dica', text: 'A pergunta aparece no ecrã grande — no telemóvel só tocas na cor certa.' },
  ],
  'vana-espada': [
    { icon: '📖', title: 'Dica', text: 'Acertar o livro vale 600 pontos. Se não, a mesma secção da Bíblia ainda vale 200.' },
    { icon: '🎯', title: 'Dica', text: 'Com o livro certo, quanto mais perto do capítulo, mais pontos (até 250).' },
    { icon: '🔎', title: 'Dica', text: 'Acertaste o capítulo? O versículo vale até mais 100 pontos.' },
    { icon: '⏱️', title: 'Dica', text: 'Responder depressa dá até 50 pontos extra.' },
    { icon: '🤔', title: 'Dica', text: 'Não sabes o capítulo? Podes responder só com o livro.' },
    { icon: '🪙', title: 'Dica', text: 'Cada 10 pontos valem 1 Gold no fim do jogo.' },
  ],
}

/** Dicas do jogo intercaladas com curiosidades bíblicas (dica, curiosidade, dica…). */
export function lobbyTips(game: LobbyGame): LobbyTip[] {
  const tips = GAME_TIPS[game]
  const out: LobbyTip[] = []
  const len = Math.max(tips.length, BIBLE_FACTS.length)
  for (let i = 0; i < len; i++) {
    if (i < tips.length) out.push(tips[i])
    if (i < BIBLE_FACTS.length) out.push(BIBLE_FACTS[i])
  }
  return out
}
