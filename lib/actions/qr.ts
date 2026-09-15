'use server'

import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { normalizeText } from '../../utils/text-normalization'

export async function redeemCode(code: string) {
  try {
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

    const alreadyRedeemed = !!existingScan

    if (existingScan) {
      return { 
        error: 'Já utilizaste este código anteriormente.',
        qrCode,
        alreadyRedeemed
      }
    }

    // 4. Verificar limite global
    if (qrCode.max_uses_global !== null) {
      const { count, error: countError } = await supabase
        .from('qr_scans')
        .select('*', { count: 'exact', head: true })
        .eq('qr_code_id', qrCode.id)

      if (countError) return { error: 'Erro ao verificar limites.' }

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

      if (scanError) {
        if (scanError.code === '23505') return { error: 'Já reclamaste esta recompensa.' }
        return { error: 'Erro ao registar a leitura.' }
      }

      // Atribuir pontos (XP e Gold) via points_log
      if (qrCode.xp_reward > 0 || qrCode.gold_reward > 0) {
        const { error: logError } = await createServiceClient() // pontos só pelo servidor (RLS não deixa o membro inserir)
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

    // Se for uma questão, retornamos os dados para mostrar o formulário
    if (qrCode.is_question) {
      return { success: true, qrCode, isQuestion: true, alreadyRedeemed }
    }

    // Se não for auto_claim (Manual), apenas retornamos os dados para a página mostrar o conteúdo
    return { success: true, qrCode, needsManualClaim: true }
  } catch (err) {
    console.error('Error in redeemCode:', err)
    return { error: 'Ocorreu um erro inesperado.' }
  }
}

export async function claimManualReward(qrCodeId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autorizado' }

    // 1. Obter dados do código
    const { data: qrCode, error: qrError } = await supabase
      .from('qr_codes')
      .select('*')
      .eq('id', qrCodeId)
      .single()

    if (qrError || !qrCode) return { error: 'Código não encontrado' }
    if (qrCode.is_question) return { error: 'Esta recompensa exige responder à questão.' }

    // 2. Verificar se já resgatou
    const { data: existingScan } = await supabase
      .from('qr_scans')
      .select('*')
      .eq('qr_code_id', qrCodeId)
      .eq('user_id', user.id)
      .single()

    if (existingScan && existingScan.points_awarded) {
      return { error: 'Já reclamaste esta recompensa.' }
    }

    // 3. Registar ou atualizar scan
    if (existingScan) {
      // Condicional em points_awarded=false: dois pedidos em simultâneo não dão pontos a dobrar.
      const { data: updated, error: updateError } = await createServiceClient()
        .from('qr_scans')
        .update({ points_awarded: true })
        .eq('id', existingScan.id)
        .eq('points_awarded', false)
        .select('id')
      if (updateError) return { error: 'Erro ao atualizar recompensa.' }
      if (!updated?.length) return { error: 'Já reclamaste esta recompensa.' }
    } else {
      // Verificar limite global antes de inserir
      if (qrCode.max_uses_global !== null) {
        const { count, error: countError } = await supabase
          .from('qr_scans')
          .select('*', { count: 'exact', head: true })
          .eq('qr_code_id', qrCodeId)

        if (countError) return { error: 'Erro ao verificar limites.' }

        if (count !== null && count >= qrCode.max_uses_global) {
          return { error: 'Este código já atingiu o limite de utilizações.' }
        }
      }

      const { error: insertError } = await supabase.from('qr_scans').insert({
        qr_code_id: qrCodeId,
        user_id: user.id,
        points_awarded: true
      })
      
      if (insertError) {
        if (insertError.code === '23505') return { error: 'Já reclamaste esta recompensa.' }
        return { error: 'Erro ao registar recompensa.' }
      }
    }

    // 4. Atribuir pontos
    if (qrCode.xp_reward > 0 || qrCode.gold_reward > 0) {
      const { error: pointsError } = await createServiceClient().from('points_log').insert({
        target_user_id: user.id,
        amount_xp: qrCode.xp_reward,
        amount_gold: qrCode.gold_reward,
        description: `Resgate de código (Manual): ${qrCode.title}`,
        awarded_by_user_id: user.id
      })
      if (pointsError) console.error('Error awarding points:', pointsError)
    }

    revalidatePath('/')
    revalidatePath('/points-history')
    return { success: true }
  } catch (error) {
    console.error('Error in claimManualReward:', error)
    return { error: 'Ocorreu um erro inesperado.' }
  }
}

export async function submitQuestAnswer(qrCodeId: string, answer: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autorizado' }

    // 1. Obter dados do código
    const { data: qrCode, error: qrError } = await supabase
      .from('qr_codes')
      .select('*')
      .eq('id', qrCodeId)
      .single()

    if (qrError || !qrCode) return { error: 'Código não encontrado' }
    if (!qrCode.is_question) return { error: 'Este código não é uma questão' }

    // 2. Verificar se já resgatou
    const { data: existingScan } = await supabase
      .from('qr_scans')
      .select('*')
      .eq('qr_code_id', qrCodeId)
      .eq('user_id', user.id)
      .single()

    if (existingScan && existingScan.points_awarded) {
      return { error: 'Já respondeste corretamente e recebeste a recompensa.' }
    }

    // 3. Validar Resposta
    const normalizedUserInput = normalizeText(answer)
    const isCorrect = qrCode.correct_answers?.some((correct: string) => 
      normalizeText(correct) === normalizedUserInput
    )

    if (!isCorrect) {
      return { error: 'Resposta incorreta. Tenta novamente!' }
    }

    // 4. Verificar limite global (Apenas para quem responder CORRETAMENTE)
    if (qrCode.max_uses_global !== null) {
      const { count, error: countError } = await supabase
        .from('qr_scans')
        .select('*', { count: 'exact', head: true })
        .eq('qr_code_id', qrCodeId)
        .eq('points_awarded', true) // Apenas contamos quem já levou os pontos

      if (countError) return { error: 'Erro ao verificar limites.' }

      if (count !== null && count >= qrCode.max_uses_global) {
        return { error: 'Infelizmente, o limite de vencedores para esta questão já foi atingido.' }
      }
    }

    // 5. Registar ou atualizar scan como ganho
    if (existingScan) {
      const { data: updated, error: updateError } = await createServiceClient()
        .from('qr_scans')
        .update({ points_awarded: true })
        .eq('id', existingScan.id)
        .eq('points_awarded', false)
        .select('id')
      if (updateError) return { error: 'Erro ao atualizar recompensa.' }
      if (!updated?.length) return { error: 'Já respondeste corretamente e recebeste a recompensa.' }
    } else {
      const { error: insertError } = await supabase
        .from('qr_scans')
        .insert({
          qr_code_id: qrCodeId,
          user_id: user.id,
          points_awarded: true
        })
      if (insertError) {
        if (insertError.code === '23505') return { error: 'Já respondeste a esta questão.' }
        return { error: 'Erro ao registar recompensa.' }
      }
    }

    // 6. Atribuir pontos
    if (qrCode.xp_reward > 0 || qrCode.gold_reward > 0) {
      const { error: pointsError } = await createServiceClient().from('points_log').insert({
        target_user_id: user.id,
        amount_xp: qrCode.xp_reward,
        amount_gold: qrCode.gold_reward,
        description: `Questão resolvida: ${qrCode.title}`,
        awarded_by_user_id: user.id
      })
      if (pointsError) console.error('Error awarding points:', pointsError)
    }

    revalidatePath('/')
    revalidatePath('/points-history')
    return { success: true, message: 'Resposta correta! Recompensa atribuída.' }
  } catch (error) {
    console.error('Error in submitQuestAnswer:', error)
    return { error: 'Ocorreu um erro inesperado.' }
  }
}
