-- ============================================
-- MIGRAÇÃO: Multiplicador de pontos nos jogos de um jogador
-- ============================================
-- Campanhas do género "este fim de semana o VanaTrilha dá pontos a dobrar",
-- para dar um empurrão a quem ainda não joga.
--
--   • points_multiplier      → 1 (normal), 1.5, 2, 3, 5 ou 10
--   • multiplier_starts_at   → quando a campanha começou
--   • multiplier_ends_at     → quando acaba (acaba sozinha, sem ninguém desligar)
--
-- Fora da janela o valor fica guardado mas NÃO se aplica: quem chega atrasado
-- ganha os pontos normais. A conta é feita no momento do prémio, por isso quem
-- ganhou antes da campanha não é afetado.
--
-- Só faz sentido nos jogos de um jogador (Vantur, VanaTrilha, VanaCódigo): nos
-- jogos ao vivo é o anfitrião que paga no fim da sessão, com valores fixos.
--
-- Requer: supabase-migration-game-settings.sql (tabela game_settings e RLS),
--         supabase-setup-vana-trilha.sql e supabase-setup-vana-codigo.sql.
-- Corre no SQL Editor do Supabase. É idempotente — se já correste uma versão
-- anterior deste ficheiro (teto de 3×, sem o Vantur), volta a corrê-lo inteiro.
-- ============================================


-- 1. COLUNAS -----------------------------------------------------------------

ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS points_multiplier numeric(4,2) NOT NULL DEFAULT 1;

ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS multiplier_starts_at timestamptz;

ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS multiplier_ends_at timestamptz;

-- Teto de 10× (a primeira versão tinha 3×: recria-se a restrição).
ALTER TABLE public.game_settings
  DROP CONSTRAINT IF EXISTS game_settings_multiplier_range;

ALTER TABLE public.game_settings
  ADD CONSTRAINT game_settings_multiplier_range
  CHECK (points_multiplier >= 1 AND points_multiplier <= 10);


-- 2. FUNÇÕES DE APOIO --------------------------------------------------------

-- O que multiplica os pontos deste jogo AGORA (1 = pontuação normal).
-- Janela aberta: sem data de início conta como já começada, sem data de fim
-- conta como sem fim à vista.
CREATE OR REPLACE FUNCTION public.game_points_multiplier(p_game_id text)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT gs.points_multiplier
    FROM public.game_settings gs
    WHERE gs.game_id = p_game_id
      AND gs.points_multiplier > 1
      AND (gs.multiplier_starts_at IS NULL OR gs.multiplier_starts_at <= now())
      AND (gs.multiplier_ends_at IS NULL OR gs.multiplier_ends_at > now())
  ), 1);
$$;

GRANT EXECUTE ON FUNCTION public.game_points_multiplier(text) TO anon, authenticated;

-- Arredonda para cima: com ×1,5, 1 ponto passa a 2 e não a 1.
CREATE OR REPLACE FUNCTION public.apply_points_multiplier(p_amount integer, p_multiplier numeric)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_amount <= 0 OR p_multiplier <= 1 THEN p_amount
    ELSE ceil(p_amount * p_multiplier)::integer
  END;
$$;

-- "×2" / "×1,5" para colar na descrição do histórico de pontos.
CREATE OR REPLACE FUNCTION public.points_multiplier_label(p_multiplier numeric)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT '×' || replace(rtrim(rtrim(p_multiplier::text, '0'), '.'), '.', ',');
$$;


-- 3. VANATRILHA --------------------------------------------------------------
-- Igual à versão do supabase-setup-vana-trilha.sql, com o multiplicador
-- aplicado no fim. O prémio continua a ser pago uma única vez (rewards_awarded).

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
  IF auth.uid() IS NULL OR v_run.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  IF v_run.status <> 'completed' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_completed'); END IF;
  IF v_run.rewards_awarded THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_awarded'); END IF;

  v_perfect := (v_run.mistakes = 0);
  v_xp   := 2 + CASE WHEN v_perfect THEN 1 ELSE 0 END;
  v_gold := 2 + CASE WHEN v_perfect THEN 1 ELSE 0 END + COALESCE(v_run.bonus_gold, 0);

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


-- 4. VANACÓDIGO --------------------------------------------------------------
-- Atenção à verificação de "já recebeu hoje": tem de olhar para a descrição SEM
-- o sufixo do multiplicador, senão ligar a campanha a meio do dia deixava
-- receber duas vezes o mesmo modo.

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
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Não autorizado.';
  END IF;

  v_amount := CASE p_mode
    WHEN 'recruta' THEN 1
    WHEN 'explorador' THEN 2
    WHEN 'mestre' THEN 4
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


-- 5. VANTUR ------------------------------------------------------------------
-- A versão antiga foi criada à mão no Supabase e nunca esteve no repositório;
-- esta substitui-a, mantendo o que o jogo espera:
--   • chamada como rpc('award_vantur_rewards', { user_id, mode })
--   • 1/2/4 XP e Gold para Solo/Mix/Plex, uma vez por modo por dia
--   • descrição "Vantur (Solo) - Vitória" (a Auditoria e a Analítica leem-na)
--   • devolve { message } para o toast
-- E passa também a confirmar que a vitória existe mesmo na sessão de hoje
-- (antes bastava chamar a função para receber os pontos).
--
-- DROP antes do CREATE: o tipo de retorno (e a ordem dos argumentos) da versão
-- antiga não são conhecidos e o CREATE OR REPLACE falha se forem diferentes.

DROP FUNCTION IF EXISTS public.award_vantur_rewards(uuid, text);
DROP FUNCTION IF EXISTS public.award_vantur_rewards(text, uuid);

CREATE FUNCTION public.award_vantur_rewards(user_id uuid, mode text)
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
  IF v_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Não autorizado.';
  END IF;

  v_amount := CASE v_mode
    WHEN 'solo' THEN 1
    WHEN 'mix' THEN 2
    WHEN 'plex' THEN 4
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


-- 6. CONFIRMAÇÃO -------------------------------------------------------------

SELECT game_id, enabled, points_multiplier, multiplier_starts_at, multiplier_ends_at
FROM public.game_settings
ORDER BY game_id;
