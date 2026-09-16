-- ============================================
-- MIGRAÇÃO: Reset de pontos (fim de época) + arquivo de classificações
-- ============================================
-- Como funciona o reset:
--   • NÃO apaga histórico. Para cada membro com saldo, insere em `points_log` um
--     movimento de compensação (ex.: −1013 XP / −635 Ouro, "Reset de pontos: Época 2026").
--     Os totais ficam a 0 pelo trigger normal, e a Auditoria continua completa.
--   • O valor compensado é a soma do histórico (não o total do perfil), por isso o
--     resultado é sempre exatamente 0.
--   • Antes do reset, guarda a classificação final em `points_seasons` /
--     `points_season_standings` (arquivo de épocas).
--   • Só o coordenador REAL, e exige a palavra de confirmação "RESETAR".
--
-- Requer: supabase-migration-points-security-audit.sql (corre esse primeiro).
-- Corre no SQL Editor do Supabase. É idempotente.
-- ============================================

-- 1. ARQUIVO DE ÉPOCAS ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.points_seasons (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  label text NOT NULL,
  reset_xp boolean NOT NULL,
  reset_gold boolean NOT NULL,
  performed_by uuid,
  performed_by_name text,
  members_count integer NOT NULL DEFAULT 0,
  total_xp_removed integer NOT NULL DEFAULT 0,
  total_gold_removed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.points_season_standings (
  season_id uuid NOT NULL REFERENCES public.points_seasons(id) ON DELETE CASCADE,
  user_id uuid,                 -- sem FK: o arquivo sobrevive a contas apagadas
  full_name text,
  avatar_url text,
  section text,
  role text,
  xp integer NOT NULL,
  gold integer NOT NULL,
  rank integer,                 -- posição no ranking (só desbravadores, por XP)
  PRIMARY KEY (season_id, user_id)
);

ALTER TABLE public.points_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_season_standings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coordinators can view seasons" ON public.points_seasons;
CREATE POLICY "Coordinators can view seasons" ON public.points_seasons FOR SELECT USING (
  public.get_my_real_role() = 'coordenador'
);
DROP POLICY IF EXISTS "Coordinators can view season standings" ON public.points_season_standings;
CREATE POLICY "Coordinators can view season standings" ON public.points_season_standings FOR SELECT USING (
  public.get_my_real_role() = 'coordenador'
);
-- Sem políticas de escrita: só a RPC.

-- 2. SALDOS A PARTIR DO HISTÓRICO (uso interno) -----------------------------------------
CREATE OR REPLACE FUNCTION public.points_balances_from_log()
RETURNS TABLE (user_id uuid, full_name text, avatar_url text, section text, role text, xp integer, gold integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.avatar_url, p.section::text, p.role::text,
         COALESCE(SUM(pl.amount_xp), 0)::int,
         COALESCE(SUM(pl.amount_gold), 0)::int
  FROM public.profiles p
  LEFT JOIN public.points_log pl ON pl.target_user_id = p.id
  GROUP BY p.id;
$$;
-- Não é para ser chamada pela API (exporia saldos de todos).
REVOKE EXECUTE ON FUNCTION public.points_balances_from_log() FROM PUBLIC, anon, authenticated;

-- 3. PRÉ-VISUALIZAÇÃO ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_points_reset()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result json;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Apenas a coordenação pode fazer reset de pontos.';
  END IF;

  SELECT json_build_object(
    'members_with_xp',   count(*) FILTER (WHERE b.xp <> 0),
    'members_with_gold', count(*) FILTER (WHERE b.gold <> 0),
    'total_xp',   COALESCE(SUM(b.xp), 0),
    'total_gold', COALESCE(SUM(b.gold), 0)
  ) INTO v_result
  FROM public.points_balances_from_log() b;

  RETURN v_result;
END;
$$;

-- 4. RESET -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_all_points(
  p_label text,
  p_reset_xp boolean,
  p_reset_gold boolean,
  p_confirm text
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_label text := btrim(COALESCE(p_label, ''));
  v_me_name text;
  v_season_id uuid;
  v_members integer;
  v_xp integer;
  v_gold integer;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Apenas a coordenação pode fazer reset de pontos.';
  END IF;
  IF p_confirm IS DISTINCT FROM 'RESETAR' THEN
    RAISE EXCEPTION 'Confirmação inválida.';
  END IF;
  IF NOT COALESCE(p_reset_xp, false) AND NOT COALESCE(p_reset_gold, false) THEN
    RAISE EXCEPTION 'Escolhe XP, Ouro ou ambos.';
  END IF;
  IF v_label = '' THEN
    RAISE EXCEPTION 'Dá um nome à época (ex.: Época 2026).';
  END IF;

  -- Evita dois resets seguidos por engano (duplo clique, dois coordenadores ao mesmo tempo).
  PERFORM pg_advisory_xact_lock(hashtext('reset_all_points'));
  IF EXISTS (SELECT 1 FROM public.points_seasons WHERE created_at > now() - interval '1 minute') THEN
    RAISE EXCEPTION 'Foi feito um reset há menos de um minuto.';
  END IF;

  SELECT full_name INTO v_me_name FROM public.profiles WHERE id = auth.uid();

  -- Saldos atuais a partir do histórico (fonte de verdade).
  SELECT count(*) FILTER (WHERE (p_reset_xp AND xp <> 0) OR (p_reset_gold AND gold <> 0)),
         COALESCE(SUM(xp) FILTER (WHERE p_reset_xp), 0),
         COALESCE(SUM(gold) FILTER (WHERE p_reset_gold), 0)
    INTO v_members, v_xp, v_gold
    FROM public.points_balances_from_log();

  IF v_members = 0 THEN
    RAISE EXCEPTION 'Não há pontos para fazer reset.';
  END IF;

  -- 1. Arquivo da época
  INSERT INTO public.points_seasons (label, reset_xp, reset_gold, performed_by, performed_by_name, members_count, total_xp_removed, total_gold_removed)
  VALUES (v_label, p_reset_xp, p_reset_gold, auth.uid(), v_me_name, v_members, v_xp, v_gold)
  RETURNING id INTO v_season_id;

  INSERT INTO public.points_season_standings (season_id, user_id, full_name, avatar_url, section, role, xp, gold, rank)
  SELECT v_season_id, b.user_id, b.full_name, b.avatar_url, b.section, b.role, b.xp, b.gold,
         CASE WHEN b.role = 'desbravador'
              THEN rank() OVER (PARTITION BY (b.role = 'desbravador') ORDER BY b.xp DESC) END
  FROM public.points_balances_from_log() b
  WHERE b.xp <> 0 OR b.gold <> 0;

  -- 2. Movimentos de compensação (o trigger on_points_log_change põe os totais a 0)
  INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
  SELECT b.user_id, auth.uid(),
         CASE WHEN p_reset_xp THEN -b.xp ELSE 0 END,
         CASE WHEN p_reset_gold THEN -b.gold ELSE 0 END,
         'Reset de pontos: ' || v_label
  FROM public.points_balances_from_log() b
  WHERE (p_reset_xp AND b.xp <> 0) OR (p_reset_gold AND b.gold <> 0);

  RETURN json_build_object('season_id', v_season_id, 'members', v_members, 'xp', v_xp, 'gold', v_gold);
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_points_reset() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_all_points(text, boolean, boolean, text) TO authenticated;
