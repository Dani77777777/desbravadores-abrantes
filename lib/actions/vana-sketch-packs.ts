'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { normalizeText } from '@/utils/text-normalization'
import { isAdminRole } from '@/utils/permissions'
import type { VanaSketchPack } from '@/types/vana-sketch'

// Packs de palavras do VanaSketch (Admin → VanaSketch). A RLS das tabelas só
// deixa a liderança ler e escrever; a verificação aqui dá uma mensagem clara.

export interface PackWord { id: string; word: string }
export type PackWithWords = VanaSketchPack & { words: PackWord[] }

export interface AddPackWordsResult {
  added: string[]
  existing: string[]
  invalid: string[]
  error?: string
}

async function adminClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role, helper_role').eq('id', user.id).single()
  return isAdminRole(profile) ? supabase : null
}

function done() {
  revalidatePath('/admin/vana-sketch')
}

// ── Leitura ───────────────────────────────────────────────────
// null = tabelas por criar (migração supabase-migration-vana-sketch-packs.sql por correr)
export async function getVanaSketchPacks(): Promise<VanaSketchPack[] | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('vanasketch_packs')
    .select('id, name, emoji, description, is_default, sort_order, vanasketch_pack_words(count)')
    .order('sort_order')
    .order('name')
  if (error) return null
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    emoji: p.emoji,
    description: p.description,
    is_default: p.is_default,
    sort_order: p.sort_order,
    word_count: (p.vanasketch_pack_words as unknown as { count: number }[])?.[0]?.count ?? 0,
  }))
}

export async function getVanaSketchPacksWithWords(): Promise<PackWithWords[] | null> {
  const supabase = await adminClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('vanasketch_packs')
    .select('id, name, emoji, description, is_default, sort_order, vanasketch_pack_words(id, word)')
    .order('sort_order')
    .order('name')
  if (error) return null
  return (data ?? []).map((p) => {
    const words = ((p.vanasketch_pack_words ?? []) as PackWord[])
      .slice()
      .sort((a, b) => a.word.localeCompare(b.word, 'pt-PT'))
    return {
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      description: p.description,
      is_default: p.is_default,
      sort_order: p.sort_order,
      word_count: words.length,
      words,
    }
  })
}

// ── Packs ─────────────────────────────────────────────────────
export async function createVanaSketchPack(input: {
  name: string
  emoji: string
  description?: string
}): Promise<{ error?: string }> {
  const supabase = await adminClient()
  if (!supabase) return { error: 'Sem permissão.' }
  const name = input.name.trim().slice(0, 40)
  if (!name) return { error: 'Dá um nome ao pack.' }

  const { data: last } = await supabase
    .from('vanasketch_packs').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()

  const { error } = await supabase.from('vanasketch_packs').insert({
    name,
    emoji: input.emoji.trim().slice(0, 8) || '🎨',
    description: input.description?.trim().slice(0, 120) || null,
    sort_order: (last?.sort_order ?? 0) + 1,
  })
  if (error) return { error: error.code === '23505' ? `Já existe um pack chamado "${name}".` : error.message }
  done()
  return {}
}

export async function updateVanaSketchPack(
  id: string,
  fields: { name?: string; emoji?: string; description?: string | null; is_default?: boolean },
): Promise<{ error?: string }> {
  const supabase = await adminClient()
  if (!supabase) return { error: 'Sem permissão.' }
  const patch: Record<string, unknown> = {}
  if (fields.name !== undefined) {
    const name = fields.name.trim().slice(0, 40)
    if (!name) return { error: 'O nome não pode ficar vazio.' }
    patch.name = name
  }
  if (fields.emoji !== undefined) patch.emoji = fields.emoji.trim().slice(0, 8) || '🎨'
  if (fields.description !== undefined) patch.description = fields.description?.trim().slice(0, 120) || null
  if (fields.is_default !== undefined) patch.is_default = fields.is_default

  const { error } = await supabase.from('vanasketch_packs').update(patch).eq('id', id)
  if (error) return { error: error.code === '23505' ? 'Já existe um pack com esse nome.' : error.message }
  done()
  return {}
}

export async function deleteVanaSketchPack(id: string): Promise<{ error?: string }> {
  const supabase = await adminClient()
  if (!supabase) return { error: 'Sem permissão.' }
  const { error } = await supabase.from('vanasketch_packs').delete().eq('id', id)
  if (error) return { error: error.message }
  done()
  return {}
}

// ── Palavras ──────────────────────────────────────────────────
// Uma por linha ou separadas por vírgulas — aqui as palavras podem ter espaços
// ("Arca de Noé"), por isso o espaço não separa.
export async function addVanaSketchPackWords(packId: string, raw: string): Promise<AddPackWordsResult> {
  const result: AddPackWordsResult = { added: [], existing: [], invalid: [] }
  const supabase = await adminClient()
  if (!supabase) return { ...result, error: 'Sem permissão.' }

  const seen = new Set<string>()
  const words: string[] = []
  for (const part of raw.split(/[\n,;]+/)) {
    const w = part.normalize('NFC').replace(/\s+/g, ' ').trim()
    if (!w) continue
    const key = normalizeText(w)
    if (seen.has(key)) continue
    seen.add(key)
    words.push(w.charAt(0).toLocaleUpperCase('pt-PT') + w.slice(1))
  }
  if (!words.length) return { ...result, error: 'Escreve pelo menos uma palavra.' }

  const { data: current } = await supabase.from('vanasketch_pack_words').select('word').eq('pack_id', packId)
  const known = new Set((current ?? []).map((r) => normalizeText(r.word)))

  const toInsert: string[] = []
  for (const w of words) {
    // Letras, espaços e hífens; entre 2 e 30 caracteres (igual ao CHECK da tabela)
    if (w.length < 2 || w.length > 30 || !/^[\p{L}][\p{L} '-]*$/u.test(w)) result.invalid.push(w)
    else if (known.has(normalizeText(w))) result.existing.push(w)
    else toInsert.push(w)
  }

  if (toInsert.length) {
    const { error } = await supabase
      .from('vanasketch_pack_words')
      .insert(toInsert.map((word) => ({ pack_id: packId, word })))
    if (error) return { ...result, error: error.message }
    result.added = toInsert
    done()
  }
  return result
}

export async function deleteVanaSketchPackWord(id: string): Promise<{ error?: string }> {
  const supabase = await adminClient()
  if (!supabase) return { error: 'Sem permissão.' }
  const { error } = await supabase.from('vanasketch_pack_words').delete().eq('id', id)
  if (error) return { error: error.message }
  done()
  return {}
}
