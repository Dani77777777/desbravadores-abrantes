import { describe, expect, test } from 'bun:test'
import { normalizeAnswer } from '@/utils/vana-coro/normalize'
import { buildItems, buildPrompt, clusterItems, parseClusterResponse, MAX_ITEMS_PER_CALL, type ClusterItem } from './cluster'

const item = (n: number, text: string, count = 1): ClusterItem => ({ id: `i${n}`, text, count, answerIds: [`a${n}`] })
const items = [item(1, 'Lanterna', 5), item(2, 'Frontal', 2), item(3, 'Tenda', 3), item(4, 'asdf')]

describe('buildItems', () => {
  test('junta primeiro pela camada 1 e numera do mais dado para o menos', () => {
    const a = (id: string, text: string) => ({ id, text, normalized: normalizeAnswer(text) })
    const built = buildItems([a('1', 'tenda'), a('2', 'Lanterna'), a('3', 'lanterna'), a('4', 'Lanternas')])
    expect(built.map((i) => [i.id, i.text, i.count])).toEqual([
      ['i1', 'Lanterna', 3],
      ['i2', 'Tenda', 1],
    ])
  })
})

describe('buildPrompt', () => {
  test('leva só textos e contagens', () => {
    const prompt = buildPrompt('O que levas?', items)
    expect(prompt).toContain('«O que levas?»')
    expect(prompt).toContain('{"id":"i1","text":"Lanterna","count":5}')
    expect(prompt).not.toContain('a1')
  })
})

describe('parseClusterResponse', () => {
  test('cada item num só grupo: repetidos ficam no primeiro, desconhecidos ignoram-se, esquecidos ficam sozinhos', () => {
    const raw = JSON.stringify({
      groups: [
        { label: 'lanterna', emoji: '🔦', item_ids: ['i1', 'i2', 'i99'] },
        { label: 'Luz', emoji: '💡', item_ids: ['i2'] },
        { label: 'Tenda', emoji: '⛺', item_ids: ['i3'], inappropriate: false },
      ],
    })
    expect(parseClusterResponse(raw, items)).toEqual([
      { label: 'Lanterna', emoji: '🔦', inappropriate: false, itemIds: ['i1', 'i2'], existingGroupId: undefined },
      { label: 'Tenda', emoji: '⛺', inappropriate: false, itemIds: ['i3'], existingGroupId: undefined },
      { label: 'asdf', emoji: '', inappropriate: false, itemIds: ['i4'] },
    ])
  })

  test('grupos impróprios e grupos que já existem', () => {
    const raw = JSON.stringify({
      groups: [
        { label: 'Lixo', emoji: '🗑️', item_ids: ['i4'], inappropriate: true },
        { label: 'Lanterna', emoji: '🔦', item_ids: ['i1'], existing_group_id: 'g1' },
      ],
    })
    const groups = parseClusterResponse(raw, items, [{ alias: 'g1', id: 'uuid-real', label: 'Lanterna' }])!
    expect(groups[0].inappropriate).toBe(true)
    expect(groups[1].existingGroupId).toBe('uuid-real')
  })

  test('JSON inválido → null', () => {
    expect(parseClusterResponse('não é json', items)).toBeNull()
    expect(parseClusterResponse('{"grupos": []}', items)).toBeNull()
  })
})

describe('clusterItems', () => {
  test('tenta mais uma vez se o JSON vier mal', async () => {
    const answers = ['lixo', JSON.stringify({ groups: [{ label: 'Luz', emoji: '🔦', item_ids: ['i1', 'i2'] }] })]
    let calls = 0
    const groups = await clusterItems('?', items, [], async () => answers[calls++])
    expect(calls).toBe(2)
    expect(groups[0].itemIds).toEqual(['i1', 'i2'])
  })

  test('falha duas vezes → erro', async () => {
    await expect(clusterItems('?', items, [], async () => 'lixo')).rejects.toThrow()
  })

  test('muitos itens: lotes e 2.ª passagem só com os nomes', async () => {
    const many = Array.from({ length: MAX_ITEMS_PER_CALL + 2 }, (_, i) => item(i + 1, i % 2 ? 'Lanterna' : 'Tenda'))
    const prompts: string[] = []
    const groups = await clusterItems('?', many, [], async (prompt) => {
      prompts.push(prompt)
      const ids = [...prompt.matchAll(/"id":"(i\d+)","text":"(\w+)"/g)]
      // Junta tudo pelo texto
      const byText = new Map<string, string[]>()
      for (const [, id, text] of ids) byText.set(text, [...(byText.get(text) ?? []), id])
      return JSON.stringify({ groups: [...byText].map(([label, item_ids]) => ({ label, emoji: '', item_ids })) })
    })
    expect(prompts).toHaveLength(3) // 2 lotes + 2.ª passagem
    expect(groups.map((g) => g.label).sort()).toEqual(['Lanterna', 'Tenda'])
    expect(groups.reduce((s, g) => s + g.itemIds.length, 0)).toBe(many.length)
  })
})
