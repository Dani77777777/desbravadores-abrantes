'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function redeemCode(code: string) {
  const supabase = await createClient()

  // 1. Verificar autenticação
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/')
  }

  // 2. Procurar o código
  const { data: qrCode, error: qrError } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('code', code.toUpperCase())
    .single()

  if (qrError || !qrCode) {
    return { error: 'Código inválido ou não encontrado.' }
  }

  // 3. Verificar se o user já resgatou
  const { data: existingScan } = await supabase
    .from('qr_scans')
    .select('*')
    .eq('qr_code_id', qrCode.id)
    .eq('user_id', user.id)
    .single()

  if (existingScan) {
    return { 
      error: 'Já utilizaste este código anteriormente.',
      qrCode,
      alreadyRedeemed: true
    }
  }

  // 4. Verificar limite global
  if (qrCode.max_uses_global !== null) {
    const { count } = await supabase
      .from('qr_scans')
      .select('*', { count: 'exact', head: true })
      .eq('qr_code_id', qrCode.id)

    if (count !== null && count >= qrCode.max_uses_global) {
      return { error: 'Este código já atingiu o limite de utilizações.' }
    }
  }

  // 5. Se auto_claim, atribuir pontos agora
  if (qrCode.auto_claim) {
    // Registar scan
    const { error: scanError } = await supabase
      .from('qr_scans')
      .insert({
        qr_code_id: qrCode.id,
        user_id: user.id,
        points_awarded: true
      })

    if (scanError) return { error: 'Erro ao registar a leitura.' }

    // Atribuir pontos (XP e Gold) via points_log
    if (qrCode.xp_reward > 0 || qrCode.gold_reward > 0) {
      const { error: logError } = await supabase
        .from('points_log')
        .insert({
          target_user_id: user.id,
          amount_xp: qrCode.xp_reward,
          amount_gold: qrCode.gold_reward,
          description: `Resgate de código: ${qrCode.title}`,
          awarded_by_user_id: user.id
        })
      if (logError) console.error('Error awarding points:', logError)
    }

    revalidatePath('/')
    revalidatePath('/points-history')
    return { success: true, qrCode, message: 'Pontos recebidos com sucesso!' }
  }

  // Se não for auto_claim, apenas retornamos os dados para a página mostrar o conteúdo
  return { success: true, qrCode, needsManualClaim: true }
}

export async function claimManualReward(qrCodeId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autorizado')

  // 1. Obter dados do código
  const { data: qrCode, error: qrError } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('id', qrCodeId)
    .single()

  if (qrError || !qrCode) throw new Error('Código não encontrado')

  // 2. Verificar se já resgatou
  const { data: existingScan } = await supabase
    .from('qr_scans')
    .select('*')
    .eq('qr_code_id', qrCodeId)
    .eq('user_id', user.id)
    .single()

  if (existingScan && existingScan.points_awarded) {
    throw new Error('Já reclamaste esta recompensa.')
  }

  // 3. Registar ou atualizar scan
  if (existingScan) {
    await supabase.from('qr_scans').update({ points_awarded: true }).eq('id', existingScan.id)
  } else {
    // Verificar limite global antes de inserir
    if (qrCode.max_uses_global !== null) {
      const { count } = await supabase
        .from('qr_scans')
        .select('*', { count: 'exact', head: true })
        .eq('qr_code_id', qrCodeId)

      if (count !== null && count >= qrCode.max_uses_global) {
        throw new Error('Este código já atingiu o limite de utilizações.')
      }
    }

    await supabase.from('qr_scans').insert({
      qr_code_id: qrCodeId,
      user_id: user.id,
      points_awarded: true
    })
  }

  // 4. Atribuir pontos
  if (qrCode.xp_reward > 0 || qrCode.gold_reward > 0) {
    await supabase.from('points_log').insert({
      target_user_id: user.id,
      amount_xp: qrCode.xp_reward,
      amount_gold: qrCode.gold_reward,
      description: `Resgate de código (Manual): ${qrCode.title}`,
      awarded_by_user_id: user.id
    })
  }

  revalidatePath('/')
  revalidatePath('/points-history')
  return { success: true }
}
