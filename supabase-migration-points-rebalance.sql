-- ============================================
-- MIGRAÇÃO: Reequilíbrio da economia de pontos
-- ============================================
-- A parte de base de dados do reequilíbrio (o resto está no código):
--
--   1. Jogos diários a pagar 5 vezes mais (XP e Gold):
--        • VANTUR         solo 1 → 5 · mix 2 → 10 · plex 4 → 20
--        • VanaCódigo     recruta 1 → 5 · explorador 2 → 10 · mestre 4 → 20
--        • VanaSentinela  1 / 2 / 3 → 5 / 10 / 15 (mesmos limiares: 11 e 14 certas)
--        • VanaTrilha     etapa 2 → 10 · Jornada Perfeita +1 → +5
--                         (o Milagre, 2 → 10 Gold, é gravado pelo servidor em bonus_gold)
--      Continua a pagar uma vez por modo (ou pack) por dia e o multiplicador das
--      campanhas aplica-se por cima, como antes. As descrições no points_log NÃO
--      mudam: a Auditoria e a analítica dependem delas.
--
--   2. Taxa do Gold da loja (get_gold_rate_info): o "Gold em circulação" passa a
--      somar só o Gold de desbravadores e dirigentes (cargo real), visíveis no
--      ranking e com pelo menos um movimento no points_log nos últimos 90 dias.
--
-- Os pontos já atribuídos não são recalculados: vale só daqui para a frente.
-- As verificações de permissão são à prova de NULL (auth.uid() IS NULL OR ... IS
-- DISTINCT FROM ...), para uma chamada sem sessão nunca passar.
--
-- Requer: supabase-migration-game-points-multiplier.sql,
--         supabase-setup-vana-sentinela.sql (ou a migração dos convidados/prémios),
--         supabase-migration-ranking-hide-tests.sql (is_hidden_from_ranking) e
--         supabase-migration-store-v2-euros.sql (store_settings).
-- Corre o ficheiro inteiro no SQL Editor do Supabase. É idempotente.
-- ============================================


-- 0. A TAXA ANTES DE MUDAR ---------------------------------------------------
-- Para comparar com a confirmação do fim. (Se correres o ficheiro uma segunda
-- vez, este "antes" já é o critério novo.)

SELECT 'antes' AS momento, public.get_gold_rate_info() AS taxa;


-- 1. VANATRILHA --------------------------------------------------------------
-- Tem de coincidir com dailyRewards (utils/vana-trilha.ts) e com as constantes
-- VANATRILHA_REWARD_* / VANATRILHA_PERFECT_BONUS_* de types/vana-trilha.ts.

CREATE OR REPLACE FUNCTION public.award_vanatrilha_daily_rewards(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.vanatrilha_daily_runs%ROWTYPE;
  v_xp integer := 0;
  v_gold integer := 0;
  v_perfect boolean := false;
  v_station_name text;
  v_desc text;
  v_multiplier numeric := 1;
BEGIN
  -- FOR UPDATE: dois pedidos em simultâneo não conseguem pagar duas vezes.
  SELECT * INTO v_run FROM public.vanatrilha_daily_runs WHERE id = p_run_id FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF auth.uid() IS NULL OR v_run.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  IF v_run.status IS DISTINCT FROM 'completed' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_completed'); END IF;
  IF v_run.rewards_awarded THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_awarded'); END IF;

  v_perfect := (v_run.mistakes = 0);
  -- 10 pela etapa, +5 pela Jornada Perfeita; o Milagre (bonus_gold) vem da corrida.
  -- Tem de coincidir com dailyRewards em utils/vana-trilha.ts.
  v_xp   := 10 + CASE WHEN v_perfect THEN 5 ELSE 0 END;
  v_gold := 10 + CASE WHEN v_perfect THEN 5 ELSE 0 END + COALESCE(v_run.bonus_gold, 0);

  v_station_name := CASE v_run.station
    WHEN 1 THEN 'Egito'
    WHEN 2 THEN 'Mar Vermelho'
    WHEN 3 THEN 'Deserto de Sin'
    WHEN 4 THEN 'Monte Sinai'
    WHEN 5 THEN 'Cades-Barneia'
    WHEN 6 THEN 'Rio Jordão'
    WHEN 7 THEN 'Terra Prometida'
    ELSE 'Etapa ' || v_run.station
  END;

  v_desc := 'VanaTrilha — ' || v_station_name ||
            CASE WHEN v_perfect THEN ' (Jornada Perfeita)' ELSE '' END ||
            CASE WHEN COALESCE(v_run.bonus_gold, 0) > 0 THEN ' + Milagre' ELSE '' END;

  -- Campanha de pontos a dobrar (Gestão → Jogos)
  v_multiplier := public.game_points_multiplier('vana-trilha');
  IF v_multiplier > 1 THEN
    v_xp   := public.apply_points_multiplier(v_xp, v_multiplier);
    v_gold := public.apply_points_multiplier(v_gold, v_multiplier);
    v_desc := v_desc || ' (pontos ' || public.points_multiplier_label(v_multiplier) || ')';
  END IF;

  INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
  VALUES (v_run.user_id, v_run.user_id, v_xp, v_gold, v_desc);

  UPDATE public.vanatrilha_daily_runs SET rewards_awarded = true WHERE id = p_run_id;

  INSERT INTO public.vanatrilha_station_progress (user_id, station)
  VALUES (v_run.user_id, v_run.station)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'xp', v_xp,
    'gold', v_gold,
    'perfect', v_perfect,
    'bonus_gold', COALESCE(v_run.bonus_gold, 0),
    'multiplier', v_multiplier
  );
END;
$$;

REVOKE ALL ON FUNCTION public.award_vanatrilha_daily_rewards(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_vanatrilha_daily_rewards(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.award_vanatrilha_daily_rewards(uuid) TO authenticated;


-- 2. VANACÓDIGO --------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.award_vana_codigo_rewards(p_user_id uuid, p_mode text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount integer;
  v_desc text;
  v_desc_base text;
  v_mode_label text;
  v_multiplier numeric := 1;
BEGIN
  -- Só o próprio pode reclamar as suas recompensas
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Não autorizado.';
  END IF;

  v_amount := CASE p_mode
    WHEN 'recruta' THEN 5
    WHEN 'explorador' THEN 10
    WHEN 'mestre' THEN 20
    ELSE NULL
  END;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'Modo inválido.';
  END IF;

  v_mode_label := initcap(p_mode);
  v_desc_base := 'VanaCódigo — Desafio Diário (' || v_mode_label || ')';
  v_desc := v_desc_base;

  -- A vitória tem de existir na sessão de hoje
  IF NOT EXISTS (
    SELECT 1 FROM public.vana_codigo_sessions
    WHERE user_id = p_user_id
      AND mode = p_mode
      AND is_finished = true
      AND is_won = true
      AND updated_at >= public.vana_codigo_day_start()
  ) THEN
    RETURN jsonb_build_object('awarded', false, 'message', null);
  END IF;

  -- Uma recompensa por modo por dia (o sufixo do multiplicador não conta)
  IF EXISTS (
    SELECT 1 FROM public.points_log
    WHERE target_user_id = p_user_id
      AND description LIKE v_desc_base || '%'
      AND created_at >= public.vana_codigo_day_start()
  ) THEN
    RETURN jsonb_build_object(
      'awarded', false,
      'message', 'Já recebeste as recompensas deste modo hoje!'
    );
  END IF;

  -- Campanha de pontos a dobrar (Gestão → Jogos)
  v_multiplier := public.game_points_multiplier('vana-codigo');
  IF v_multiplier > 1 THEN
    v_amount := public.apply_points_multiplier(v_amount, v_multiplier);
    v_desc := v_desc || ' (pontos ' || public.points_multiplier_label(v_multiplier) || ')';
  END IF;

  INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
  VALUES (p_user_id, p_user_id, v_amount, v_amount, v_desc);

  RETURN jsonb_build_object(
    'awarded', true,
    'multiplier', v_multiplier,
    'message', 'Mensagem decifrada! Ganhaste ' || v_amount || ' XP e ' || v_amount || ' Gold 🪙'
      || CASE WHEN v_multiplier > 1 THEN ' (' || public.points_multiplier_label(v_multiplier) || '!)' ELSE '' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_vana_codigo_rewards(uuid, text) TO authenticated;


-- 3. VANTUR ------------------------------------------------------------------
-- Mesma assinatura e mesmo tipo de retorno da versão do multiplicador: basta
-- CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.award_vantur_rewards(user_id uuid, mode text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Os nomes dos parâmetros colidem com colunas: usam-se só por aqui.
  v_user_id uuid := $1;
  v_mode text := $2;
  v_day_start timestamptz := ((now() AT TIME ZONE 'Europe/Lisbon')::date)::timestamp AT TIME ZONE 'Europe/Lisbon';
  v_amount integer;
  v_desc text;
  v_desc_base text;
  v_multiplier numeric := 1;
BEGIN
  -- Só o próprio pode reclamar as suas recompensas
  IF auth.uid() IS NULL OR v_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Não autorizado.';
  END IF;

  v_amount := CASE v_mode
    WHEN 'solo' THEN 5
    WHEN 'mix' THEN 10
    WHEN 'plex' THEN 20
    ELSE NULL
  END;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'Modo inválido.';
  END IF;

  v_desc_base := 'Vantur (' || initcap(v_mode) || ') - Vitória';
  v_desc := v_desc_base;

  -- A vitória tem de existir na sessão de hoje: terminada e com todas as
  -- palavras acertadas.
  IF NOT EXISTS (
    SELECT 1 FROM public.vantur_sessions s
    WHERE s.user_id = v_user_id
      AND s.mode = v_mode
      AND s.is_finished = true
      AND s.updated_at >= v_day_start
      AND cardinality(s.secret_words) > 0
      AND cardinality(s.completed_indices) >= cardinality(s.secret_words)
  ) THEN
    RETURN jsonb_build_object('awarded', false, 'message', null);
  END IF;

  -- Uma recompensa por modo por dia (o sufixo do multiplicador não conta)
  IF EXISTS (
    SELECT 1 FROM public.points_log
    WHERE target_user_id = v_user_id
      AND description LIKE v_desc_base || '%'
      AND created_at >= v_day_start
  ) THEN
    RETURN jsonb_build_object(
      'awarded', false,
      'message', 'Já recebeste as recompensas deste modo hoje!'
    );
  END IF;

  -- Campanha de pontos multiplicados (Gestão → Jogos)
  v_multiplier := public.game_points_multiplier('vantur');
  IF v_multiplier > 1 THEN
    v_amount := public.apply_points_multiplier(v_amount, v_multiplier);
    v_desc := v_desc || ' (pontos ' || public.points_multiplier_label(v_multiplier) || ')';
  END IF;

  INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
  VALUES (v_user_id, v_user_id, v_amount, v_amount, v_desc);

  RETURN jsonb_build_object(
    'awarded', true,
    'multiplier', v_multiplier,
    'message', 'Vitória! Ganhaste ' || v_amount || ' XP e ' || v_amount || ' Gold 🪙'
      || CASE WHEN v_multiplier > 1 THEN ' (' || public.points_multiplier_label(v_multiplier) || '!)' ELSE '' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.award_vantur_rewards(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_vantur_rewards(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.award_vantur_rewards(uuid, text) TO authenticated;


-- 4. VANASENTINELA -----------------------------------------------------------
-- Tem de bater certo com recompensaPorAcertos em utils/vana-sentinela/game.ts.

CREATE OR REPLACE FUNCTION public.award_vana_sentinela_rewards(p_score_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score public.vana_sentinela_scores%ROWTYPE;
  v_day_start timestamptz := ((now() AT TIME ZONE 'Europe/Lisbon')::date)::timestamp AT TIME ZONE 'Europe/Lisbon';
  v_city text;
  v_desc_base text;
  v_desc text;
  v_amount integer;
  v_multiplier numeric := 1;
BEGIN
  SELECT * INTO v_score FROM public.vana_sentinela_scores WHERE id = p_score_id;
  IF NOT FOUND OR auth.uid() IS NULL OR v_score.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Não autorizado.';
  END IF;

  -- Só rondas de hoje
  IF v_score.created_at < v_day_start THEN
    RETURN jsonb_build_object('awarded', false, 'message', null);
  END IF;

  v_city := CASE v_score.pack
    WHEN 'abrantes' THEN 'Abrantes'
    WHEN 'entroncamento' THEN 'Entroncamento'
    WHEN 'ourem' THEN 'Ourém'
    WHEN 'tomar' THEN 'Tomar'
    ELSE initcap(v_score.pack)
  END;
  v_desc_base := 'VanaSentinela — ' || v_city;

  -- Um prémio por pack por dia (o sufixo das certas/multiplicador não conta)
  IF EXISTS (
    SELECT 1 FROM public.points_log
    WHERE target_user_id = v_score.user_id
      AND description LIKE v_desc_base || '%'
      AND created_at >= v_day_start
  ) THEN
    RETURN jsonb_build_object(
      'awarded', false,
      'message', 'Já recebeste o prémio de hoje neste pack. Volta amanhã!'
    );
  END IF;

  v_amount := CASE WHEN v_score.correct >= 14 THEN 15 WHEN v_score.correct >= 11 THEN 10 ELSE 5 END;
  v_desc := v_desc_base || ' (' || v_score.correct || '/' || v_score.total || ' certas)';

  v_multiplier := public.game_points_multiplier('vana-sentinela');
  IF v_multiplier > 1 THEN
    v_amount := public.apply_points_multiplier(v_amount, v_multiplier);
    v_desc := v_desc || ' (pontos ' || public.points_multiplier_label(v_multiplier) || ')';
  END IF;

  INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
  VALUES (v_score.user_id, v_score.user_id, v_amount, v_amount, v_desc);

  RETURN jsonb_build_object(
    'awarded', true,
    'xp', v_amount,
    'gold', v_amount,
    'multiplier', v_multiplier,
    'message', 'Ganhaste ' || v_amount || ' XP e ' || v_amount || ' Gold 🪙'
      || CASE WHEN v_multiplier > 1 THEN ' (' || public.points_multiplier_label(v_multiplier) || '!)' ELSE '' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.award_vana_sentinela_rewards(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_vana_sentinela_rewards(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.award_vana_sentinela_rewards(uuid) TO authenticated;


-- 5. TAXA DO GOLD DA LOJA ----------------------------------------------------
-- gold_per_euro = base * clamp(gold_total / gold_referência, min, max)
-- Muda só o gold_total. A função é chamada em cada visita à loja e em cada compra,
-- por isso o índice abaixo evita percorrer o points_log inteiro por perfil.

CREATE INDEX IF NOT EXISTS idx_points_log_target_created
  ON public.points_log (target_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_gold_rate_info()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_base numeric := 100;
  v_ref numeric := 10000;
  v_min numeric := 0.5;
  v_max numeric := 3;
  v_total numeric := 0;
  v_mult numeric;
  v_rate integer;
BEGIN
  SELECT base_gold_per_euro, reference_total_gold, min_rate_multiplier, max_rate_multiplier
  INTO v_base, v_ref, v_min, v_max
  FROM public.store_settings WHERE id = true;

  IF NOT FOUND THEN
    v_base := 100; v_ref := 10000; v_min := 0.5; v_max := 3;
  END IF;

  -- Só conta o Gold de quem participa: desbravadores e dirigentes (cargo REAL, não o
  -- de ajudante), visíveis no ranking e com pelo menos um movimento de pontos nos
  -- últimos 90 dias. Coordenadores, contas de teste e contas paradas ficam de fora.
  SELECT COALESCE(SUM(p.current_gold), 0) INTO v_total
  FROM public.profiles p
  WHERE p.role IN ('desbravador', 'dirigente')
    AND NOT public.is_hidden_from_ranking(p.full_name)
    AND EXISTS (
      SELECT 1 FROM public.points_log pl
      WHERE pl.target_user_id = p.id
        AND pl.created_at >= now() - interval '90 days'
    );

  v_mult := LEAST(v_max, GREATEST(v_min, v_total / NULLIF(v_ref, 0)));
  v_rate := GREATEST(1, CEIL(v_base * COALESCE(v_mult, 1)))::integer;

  RETURN jsonb_build_object(
    'gold_per_euro', v_rate,
    'total_gold', v_total,
    'base_gold_per_euro', v_base,
    'reference_total_gold', v_ref,
    'multiplier', round(COALESCE(v_mult, 1), 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_gold_rate_info() TO anon, authenticated;


-- 6. CONFIRMAÇÃO -------------------------------------------------------------
-- A taxa com o critério novo, ao lado do total antigo (todos os perfis). Se a taxa
-- tiver mudado mais do que queres, ajusta store_settings.reference_total_gold em
-- Gestão → Loja → Economia do Gold.

SELECT
  'depois' AS momento,
  public.get_gold_rate_info() AS taxa,
  (SELECT COALESCE(SUM(current_gold), 0) FROM public.profiles) AS gold_de_todos_os_perfis;
