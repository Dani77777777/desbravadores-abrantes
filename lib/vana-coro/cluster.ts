// Agrupamento com IA (camada 2, §6.2).
//
// Para a IA vão só textos e contagens: nunca ids de pessoas, nomes ou guest_ids.
// As respostas chegam já juntas pela camada 1 (autoGroup), por isso cada "item" é
// um texto com quantas vezes apareceu. A IA devolve grupos de itens; aqui valida-se
// tudo com zod e cada item acaba num só grupo:
//   • um item em vários grupos fica no primeiro;
//   • itens desconhecidos ignoram-se;
//   • itens esquecidos ficam num grupo próprio.

import { z } from 'zod'
import { autoGroup, capitalize, type GroupableAnswer } from '@/utils/vana-coro/normalize'
import { chatJson } from './ai'

/** Acima disto parte-se em lotes e faz-se uma 2.ª passagem só com os nomes dos grupos. */
export const MAX_ITEMS_PER_CALL = 300

export interface ClusterItem {
  /** "i1", "i2"… (só existe dentro do pedido) */
  id: string
  text: string
  count: number
  answerIds: string[]
}

export interface ExistingGroup {
  /** "g1", "g2"… (só existe dentro do pedido) */
  alias: string
  id: string
  label: string
}

export interface ClusteredGroup {
  label: string
  emoji: string
  inappropriate: boolean
  itemIds: string[]
  /** Id real de um grupo que já existe ("agrupar as novas"). */
  existingGroupId?: string
}

const ResponseSchema = z.object({
  groups: z.array(
    z.object({
      label: z.string().optional().default(''),
      emoji: z.string().optional().default(''),
      item_ids: z.array(z.string()).default([]),
      inappropriate: z.boolean().optional().default(false),
      existing_group_id: z.string().nullish(),
    }),
  ),
})

/** Respostas → itens (camada 1), do mais dado para o menos dado. */
export function buildItems(answers: GroupableAnswer[]): ClusterItem[] {
  return autoGroup(answers).map((g, i) => ({
    id: `i${i + 1}`,
    text: g.label,
    count: g.answerIds.length,
    answerIds: g.answerIds,
  }))
}

export function buildPrompt(question: string, items: ClusterItem[], existing: ExistingGroup[] = []): string {
  const lines = [
    'És o assistente de um jogo estilo "Family Feud" para um grupo de jovens adventistas em Portugal.',
    'Recebes respostas a uma pergunta. Agrupa as que **querem dizer a mesma coisa** (sinónimos, variações, erros de escrita,',
    'a mesma ideia por outras palavras). **Não** juntes coisas apenas relacionadas (ex.: "Moisés" e "Arão" são diferentes;',
    '"tenda" e "saco-cama" são diferentes). Para cada grupo dá um nome curto em português de Portugal (1–3 palavras,',
    'com maiúscula inicial) e um emoji. Marca `inappropriate: true` em grupos ofensivos, com palavrões, ou sem sentido.',
    '',
    `Pergunta: «${question}»`,
  ]
  if (existing.length) {
    lines.push(
      '',
      'Já existem estes grupos. Se um item quer dizer o mesmo que um deles, põe-no num grupo com `existing_group_id`',
      'igual ao id desse grupo (e repete o nome dele). Se não, cria um grupo novo sem `existing_group_id`.',
      `Grupos existentes (JSON): ${JSON.stringify(existing.map((g) => ({ id: g.alias, label: g.label })))}`,
    )
  }
  lines.push(
    `Respostas (JSON): ${JSON.stringify(items.map((i) => ({ id: i.id, text: i.text, count: i.count })))}`,
    '',
    'Responde **só** com JSON: `{ "groups": [ { "label": "", "emoji": "", "item_ids": [""], "inappropriate": false'
      + (existing.length ? ', "existing_group_id": null' : '')
      + ' } ] }`',
  )
  return lines.join('\n')
}

/**
 * Valida a resposta da IA e garante que cada item fica em exatamente um grupo.
 * null se o JSON não for válido (para tentar outra vez).
 */
export function parseClusterResponse(
  raw: string,
  items: ClusterItem[],
  existing: ExistingGroup[] = [],
): ClusteredGroup[] | null {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }
  const parsed = ResponseSchema.safeParse(json)
  if (!parsed.success) return null

  const known = new Map(items.map((i) => [i.id, i]))
  const existingByAlias = new Map(existing.map((g) => [g.alias, g]))
  const used = new Set<string>()
  const groups: ClusteredGroup[] = []

  for (const g of parsed.data.groups) {
    const itemIds = g.item_ids.filter((id) => known.has(id) && !used.has(id))
    if (itemIds.length === 0) continue
    itemIds.forEach((id) => used.add(id))
    const target = g.existing_group_id ? existingByAlias.get(g.existing_group_id) : undefined
    const label = capitalize(g.label.trim()).slice(0, 40) || target?.label || known.get(itemIds[0])!.text
    groups.push({
      label,
      emoji: [...g.emoji.trim()].slice(0, 4).join(''),
      inappropriate: g.inappropriate,
      itemIds,
      existingGroupId: target?.id,
    })
  }

  for (const item of items) {
    if (!used.has(item.id)) groups.push({ label: item.text, emoji: '', inappropriate: false, itemIds: [item.id] })
  }
  return groups
}

/** Uma chamada à IA, com mais uma tentativa se o JSON vier mal. */
async function clusterOnce(
  question: string,
  items: ClusterItem[],
  existing: ExistingGroup[],
  ask: (prompt: string) => Promise<string>,
): Promise<ClusteredGroup[]> {
  const prompt = buildPrompt(question, items, existing)
  for (let attempt = 0; attempt < 2; attempt++) {
    const groups = parseClusterResponse(await ask(prompt), items, existing)
    if (groups) return groups
  }
  throw new Error('A IA não devolveu grupos válidos. Tenta outra vez ou agrupa à mão.')
}

const defaultAsk = (prompt: string) => chatJson([{ role: 'user', content: prompt }])

/**
 * Agrupa os itens com a IA. Com muitos itens, agrupa por lotes e depois junta os
 * grupos dos lotes numa 2.ª passagem (só com os nomes).
 */
export async function clusterItems(
  question: string,
  items: ClusterItem[],
  existing: ExistingGroup[] = [],
  ask: (prompt: string) => Promise<string> = defaultAsk,
): Promise<ClusteredGroup[]> {
  if (items.length === 0) return []
  if (items.length <= MAX_ITEMS_PER_CALL) return clusterOnce(question, items, existing, ask)

  const firstPass: ClusteredGroup[] = []
  for (let i = 0; i < items.length; i += MAX_ITEMS_PER_CALL) {
    firstPass.push(...(await clusterOnce(question, items.slice(i, i + MAX_ITEMS_PER_CALL), existing, ask)))
  }

  // 2.ª passagem: cada grupo do 1.º passo vira um "item" com o nome do grupo.
  const count = new Map(items.map((i) => [i.id, i.count]))
  const groupItems: ClusterItem[] = firstPass.map((g, i) => ({
    id: `i${i + 1}`,
    text: g.label,
    count: g.itemIds.reduce((s, id) => s + (count.get(id) ?? 0), 0),
    answerIds: [],
  }))
  const merged = await clusterOnce(question, groupItems, existing, ask)
  return merged.map((m) => {
    const parts = m.itemIds.map((id) => firstPass[Number(id.slice(1)) - 1])
    return {
      label: m.label,
      emoji: m.emoji || parts.find((p) => p.emoji)?.emoji || '',
      inappropriate: m.inappropriate || parts.some((p) => p.inappropriate),
      itemIds: parts.flatMap((p) => p.itemIds),
      existingGroupId: m.existingGroupId ?? parts.find((p) => p.existingGroupId)?.existingGroupId,
    }
  })
}
