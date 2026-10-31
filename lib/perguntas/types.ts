// Tipos da "Pergunta da Semana" partilhados entre o servidor e a página.

/** Uma pergunta aberta como chega ao browser: só as respostas da própria pessoa. */
export interface PublicQuestion {
  id: string
  prompt: string
  closes_at: string
  answers: { id: string; text: string }[]
}
