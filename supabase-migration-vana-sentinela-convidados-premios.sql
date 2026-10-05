-- ============================================
-- MIGRAÇÃO: VanaSentinela — convidados no ranking + XP/Gold dos membros
-- ============================================
-- Para quem já correu a primeira versão de supabase-setup-vana-sentinela.sql.
-- (Numa instalação de raiz basta o setup, que já inclui tudo isto.)
--
--   1. Convidados sem conta entram no ranking com uma alcunha (guest_id + guest_name).
--   2. O ranking passa a juntar membros e convidados (etiqueta "Convidado").
--   3. Membros ganham XP/Gold na primeira ronda do dia em cada pack, com o
--      multiplicador de pontos de Gestão → Jogos.
--
-- Requer: supabase-migration-game-points-multiplier.sql.
-- Corre no SQL Editor do Supabase. É idempotente.
-- ============================================

-- 1. Pontuações de convidados
ALTER TABLE public.vana_sentinela_scores ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.vana_sentinela_scores ADD COLUMN IF NOT EXISTS guest_id uuid;
ALTER TABLE public.vana_sentinela_scores ADD COLUMN IF NOT EXISTS guest_name text;

-- Cada linha é OU de um membro OU de um convidado (com alcunha de 2 a 20 caracteres).
ALTER TABLE public.vana_sentinela_scores DROP CONSTRAINT IF EXISTS vana_sentinela_scores_player_chk;
ALTER TABLE public.vana_sentinela_scores ADD CONSTRAINT vana_sentinela_scores_player_chk CHECK (
  (user_id IS NOT NULL AND guest_id IS NULL AND guest_name IS NULL)
  OR (user_id IS NULL AND guest_id IS NOT NULL AND char_length(guest_name) BETWEEN 2 AND 20)
);

CREATE INDEX IF NOT EXISTS idx_vana_sentinela_scores_guest_created ON public.vana_sentinela_scores (guest_id, created_at DESC);

-- 2. Ranking com membros e convidados (substitui a versão só de membros).
--    p_guest_id: o id anónimo do convidado que está a ver (para destacar a linha dele).
DROP FUNCTION IF EXISTS public.get_vana_sentinela_ranking(text, text, integer);
DROP FUNCTION IF EXISTS public.get_vana_sentinela_ranking(text, text, integer, uuid);
CREATE OR REPLACE FUNCTION public.get_vana_sentinela_ranking(
  p_pack text,
  p_period text DEFAULT 'sempre',
  p_limit integer DEFAULT 10,
  p_guest_id uuid DEFAULT NULL
)
RETURNS TABLE (
  score_id uuid,
  rank_position bigint,
  full_name text,
  avatar_url text,
  section text,
  is_guest boolean,
  points integer,
  correct integer,
  total integer,
  duration_ms integer,
  created_at timestamptz,
  is_me boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH since AS (
    SELECT CASE
      WHEN p_period = 'semana'
        -- A semana começa ao domingo (EXTRACT(DOW) dá 0 ao domingo).
        THEN ((now() AT TIME ZONE 'Europe/Lisbon')::date
              - EXTRACT(DOW FROM now() AT TIME ZONE 'Europe/Lisbon')::int)::timestamp AT TIME ZONE 'Europe/Lisbon'
      ELSE NULL
    END AS t
  ),
  best AS (
    SELECT DISTINCT ON (COALESCE(s.user_id, s.guest_id)) s.*
    FROM public.vana_sentinela_scores s, since
    WHERE s.pack = p_pack
      AND (since.t IS NULL OR s.created_at >= since.t)
    ORDER BY COALESCE(s.user_id, s.guest_id), s.points DESC, s.correct DESC, s.duration_ms ASC, s.created_at ASC
  ),
  ranked AS (
    SELECT b.*,
           row_number() OVER (ORDER BY b.points DESC, b.correct DESC, b.duration_ms ASC, b.created_at ASC) AS pos,
           CASE
             WHEN b.user_id IS NOT NULL THEN auth.uid() IS NOT NULL AND b.user_id = auth.uid()
             ELSE p_guest_id IS NOT NULL AND b.guest_id = p_guest_id
           END AS mine
    FROM best b
  )
  SELECT r.id, r.pos,
         COALESCE(p.full_name, r.guest_name), p.avatar_url, p.section::text,
         r.user_id IS NULL,
         r.points, r.correct, r.total, r.duration_ms, r.created_at,
         r.mine
  FROM ranked r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE (r.user_id IS NULL OR p.id IS NOT NULL)
    AND (r.pos <= LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50) OR r.mine)
  ORDER BY r.pos;
$$;

REVOKE ALL ON FUNCTION public.get_vana_sentinela_ranking(text, text, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vana_sentinela_ranking(text, text, integer, uuid) TO anon, authenticated;

-- 3. Prémio dos membros: XP e Gold (iguais) na PRIMEIRA ronda do dia em cada pack
--    (dia de Lisboa): 1 se < 11 certas, 2 se ≥ 11, 3 se ≥ 14. Com multiplicador.
--    Tem de bater certo com recompensaPorAcertos em utils/vana-sentinela/game.ts.
--    Chamada pela rota da API com a sessão do membro, logo depois de gravar a ronda.
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

  v_amount := CASE WHEN v_score.correct >= 14 THEN 3 WHEN v_score.correct >= 11 THEN 2 ELSE 1 END;
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

-- Confirmação
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'vana_sentinela_scores'
  AND column_name IN ('user_id', 'guest_id', 'guest_name');
