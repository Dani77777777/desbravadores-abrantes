-- ============================================
-- MIGRAÇÃO: Auditoria — corrigir e apagar movimentos
-- ============================================
-- Até aqui a aba "Auditoria" só mostrava os movimentos; para corrigir um engano
-- (ex.: prémio do sorteio com o Ouro errado) era preciso ir ao SQL Editor.
--
--   • `audit_edit_movement`   — muda o XP e/ou o Ouro de um movimento.
--   • `audit_delete_movement` — apaga um movimento.
--   • `points_audit_events.reason` — motivo escrito por quem corrigiu (opcional).
--
-- Regras (iguais nas duas funções):
--   • Só o coordenador real.
--   • Movimentos da Loja, Transferências e Reset de época não se mexem: estão ligados
--     a outros registos (encomendas, o outro lado da transferência, o arquivo da época).
--   • A correção não pode deixar o membro com XP ou Ouro negativo (ex.: Ouro já gasto).
--   • Os totais do perfil são recalculados pelo trigger `on_points_log_change` e a
--     alteração fica em "Alterações e correções" pelo trigger `log_points_log_change`,
--     agora com o nome de quem a fez (antes, feita no SQL Editor, aparecia "Sistema").
--
-- Corre o ficheiro inteiro no SQL Editor do Supabase. É idempotente.
-- ============================================

ALTER TABLE public.points_audit_events ADD COLUMN IF NOT EXISTS reason text;


-- Valida o pedido e devolve o movimento (uso interno das duas funções abaixo).
CREATE OR REPLACE FUNCTION public.audit_get_editable_movement(p_log_id uuid, p_new_xp integer, p_new_gold integer)
RETURNS public.points_log
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_log public.points_log;
  v_category text;
  v_xp integer;
  v_gold integer;
  v_delta_xp integer;
  v_delta_gold integer;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Apenas a coordenação pode corrigir movimentos.';
  END IF;

  SELECT * INTO v_log FROM public.points_log WHERE id = p_log_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este movimento já não existe.';
  END IF;

  SELECT category INTO v_category FROM public.points_audit WHERE id = p_log_id;
  IF v_category IN ('loja', 'transferencia', 'reset') THEN
    RAISE EXCEPTION 'Movimentos da Loja, Transferências e Reset de época não podem ser alterados aqui.';
  END IF;

  -- Trancar o perfil para o saldo não mudar a meio (ex.: uma compra em simultâneo).
  PERFORM 1 FROM public.profiles WHERE id = v_log.target_user_id FOR UPDATE;

  SELECT COALESCE(SUM(amount_xp), 0), COALESCE(SUM(amount_gold), 0)
    INTO v_xp, v_gold
    FROM public.points_log WHERE target_user_id = v_log.target_user_id;

  v_delta_xp := p_new_xp - COALESCE(v_log.amount_xp, 0);
  v_delta_gold := p_new_gold - COALESCE(v_log.amount_gold, 0);

  IF v_delta_gold < 0 AND v_gold + v_delta_gold < 0 THEN
    RAISE EXCEPTION 'O membro ficaria com Ouro negativo (tem % e a correção tira %). Provavelmente já o gastou.', v_gold, -v_delta_gold;
  END IF;
  IF v_delta_xp < 0 AND v_xp + v_delta_xp < 0 THEN
    RAISE EXCEPTION 'O membro ficaria com XP negativo (tem % e a correção tira %).', v_xp, -v_delta_xp;
  END IF;

  RETURN v_log;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_get_editable_movement(uuid, integer, integer) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.audit_edit_movement(p_log_id uuid, p_xp integer, p_gold integer, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_log public.points_log;
BEGIN
  IF p_xp IS NULL OR p_gold IS NULL THEN
    RAISE EXCEPTION 'Indica o XP e o Ouro.';
  END IF;

  v_log := public.audit_get_editable_movement(p_log_id, p_xp, p_gold);

  IF p_xp = COALESCE(v_log.amount_xp, 0) AND p_gold = COALESCE(v_log.amount_gold, 0) THEN
    RAISE EXCEPTION 'Os valores são iguais aos que já lá estão.';
  END IF;

  UPDATE public.points_log SET amount_xp = p_xp, amount_gold = p_gold WHERE id = p_log_id;

  -- O trigger acabou de registar a alteração nesta transação (created_at = now()).
  UPDATE public.points_audit_events
     SET reason = NULLIF(btrim(p_reason), '')
   WHERE log_id = p_log_id AND action = 'UPDATE' AND created_at = now();
END;
$$;


CREATE OR REPLACE FUNCTION public.audit_delete_movement(p_log_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.audit_get_editable_movement(p_log_id, 0, 0);

  DELETE FROM public.points_log WHERE id = p_log_id;

  UPDATE public.points_audit_events
     SET reason = NULLIF(btrim(p_reason), '')
   WHERE log_id = p_log_id AND action = 'DELETE' AND created_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.audit_edit_movement(uuid, integer, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.audit_delete_movement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_edit_movement(uuid, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_delete_movement(uuid, text) TO authenticated;
