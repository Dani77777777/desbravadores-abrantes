'use server'

import { headers } from 'next/headers'
import { createClient } from '@/utils/supabase/server'

export type ClientErrorReport = {
  message?: string | null
  stack?: string | null
  digest?: string | null
  /** Só o caminho (sem query string). */
  url?: string | null
  game?: string | null
  sessionId?: string | null
}

function clip(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text.slice(0, max) : null
}

/**
 * Guarda um erro do browser em client_error_logs (migração
 * supabase-migration-client-errors.sql). Os ecrãs de erro (GameErrorScreen e
 * global-error) chegam aqui por POST /api/client-error e não diretamente:
 * ver components/game-error/report-client-error.ts.
 *
 * Nunca lança exceção: registar um erro não pode provocar outro nem atrasar a
 * recuperação do ecrã. Os tamanhos são cortados aqui e validados na tabela.
 */
export async function logClientError(report: ClientErrorReport): Promise<void> {
  try {
    const supabase = await createClient()

    let userId: string | null = null
    try {
      const { data } = await supabase.auth.getUser()
      userId = data.user?.id ?? null
    } catch {
      // sem sessão: fica como convidado
    }

    let userAgent: string | null = null
    try {
      userAgent = clip((await headers()).get('user-agent'), 400)
    } catch {
      // sem cabeçalhos: fica vazio
    }

    const row = {
      user_id: userId,
      // Só o caminho: a query string pode ter tokens.
      url: clip(report?.url?.split(/[?#]/)[0], 500),
      game: clip(report?.game, 50),
      session_id: clip(report?.sessionId, 100),
      message: clip(report?.message, 500),
      stack: clip(report?.stack, 4000),
      digest: clip(report?.digest, 100),
      user_agent: userAgent,
    }

    // Sem .select(): quem insere não tem permissão de leitura.
    const { error } = await supabase.from('client_error_logs').insert(row)
    // Conta sem perfil (FK) ou sessão caducada: tenta como convidado.
    if (error && userId) {
      await supabase.from('client_error_logs').insert({ ...row, user_id: null })
    }
  } catch (err) {
    console.error('[logClientError] não foi possível registar o erro', err)
  }
}
