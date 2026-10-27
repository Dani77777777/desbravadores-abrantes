'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { normalizeText } from '@/utils/text-normalization'
import { isAdminRole } from '@/utils/permissions'

// Gestão dos dicionários do VANTUR (Admin → Vantur). A RLS das duas tabelas já
// só deixa a liderança escrever; a verificação aqui é para dar uma mensagem clara.

export interface AddWordsResult {
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

// Aceita várias palavras de uma vez (espaços, vírgulas, ponto e vírgula ou
// mudanças de linha). Devolve-as em maiúsculas, sem repetições.
function splitWords(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(/[\s,;]+/)) {
    const w = part.normalize('NFC').trim().toUpperCase()
    if (!w) continue
    const key = normalizeText(w)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(w)
  }
  return out
}

// O jogo só usa palavras de 5 letras, sem hífens nem números (acentos e Ç contam como letra)
function isFiveLetters(word: string): boolean {
  return /^\p{L}+$/u.test(word) && /^[a-z]{5}$/.test(normalizeText(word))
}

// ── Palavras bíblicas (as palavras secretas) ──────────────────
export async function addBiblicalWords(raw: string): Promise<AddWordsResult> {
  const result: AddWordsResult = { added: [], existing: [], invalid: [] }
  const supabase = await adminClient()
  if (!supabase) return { ...result, error: 'Sem permissão.' }

  const words = splitWords(raw)
  if (!words.length) return { ...result, error: 'Escreve pelo menos uma palavra.' }

  // "GRAÇA" e "GRACA" são a mesma palavra no jogo — comparar sem acentos
  const { data: current } = await supabase.from('vantur_dictionary').select('word')
  const known = new Set((current ?? []).map((r) => normalizeText(r.word)))

  const toInsert: string[] = []
  for (const w of words) {
    if (!isFiveLetters(w)) result.invalid.push(w)
    else if (known.has(normalizeText(w))) result.existing.push(w)
    else toInsert.push(w)
  }

  if (toInsert.length) {
    const { error } = await supabase.from('vantur_dictionary').insert(toInsert.map((word) => ({ word })))
    if (error) return { ...result, error: error.message }
    result.added = toInsert
    revalidatePath('/admin/vantur')
  }
  return result
}

export async function deleteBiblicalWord(id: string): Promise<{ error?: string }> {
  const supabase = await adminClient()
  if (!supabase) return { error: 'Sem permissão.' }
  const { error } = await supabase.from('vantur_dictionary').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/vantur')
  return {}
}

// ── Dicionário geral (reserva do sorteio) ─────────────────────
export async function addGeneralWords(raw: string): Promise<AddWordsResult> {
  const result: AddWordsResult = { added: [], existing: [], invalid: [] }
  const supabase = await adminClient()
  if (!supabase) return { ...result, error: 'Sem permissão.' }

  const words = splitWords(raw)
  if (!words.length) return { ...result, error: 'Escreve pelo menos uma palavra.' }

  const valid = words.filter((w) => {
    if (isFiveLetters(w)) return true
    result.invalid.push(w)
    return false
  })
  if (!valid.length) return result

  const rows = valid.map((display) => ({ word_clean: normalizeText(display).toUpperCase(), word_display: display }))
  const { data: current } = await supabase
    .from('portuguese_words')
    .select('word_clean')
    .in('word_clean', rows.map((r) => r.word_clean))
  const known = new Set((current ?? []).map((r) => r.word_clean))

  const toInsert = rows.filter((r) => {
    if (!known.has(r.word_clean)) return true
    result.existing.push(r.word_display)
    return false
  })

  if (toInsert.length) {
    const { error } = await supabase.from('portuguese_words').insert(toInsert)
    if (error) return { ...result, error: error.message }
    result.added = toInsert.map((r) => r.word_display)
    revalidatePath('/admin/vantur')
  }
  return result
}

export async function deleteGeneralWord(wordClean: string): Promise<{ error?: string }> {
  const supabase = await adminClient()
  if (!supabase) return { error: 'Sem permissão.' }
  const { error } = await supabase.from('portuguese_words').delete().eq('word_clean', wordClean)
  if (error) return { error: error.message }
  revalidatePath('/admin/vantur')
  return {}
}
