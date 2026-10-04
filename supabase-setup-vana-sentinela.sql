-- ============================================
-- VANASENTINELA — Verdade ou Distorção?
-- Jogo singleplayer de swipe sobre as pregações do Evangelista Jefferson Araújo.
-- Correr no SQL Editor do Supabase. É idempotente: pode voltar a correr-se por
-- cima de uma versão anterior deste ficheiro.
--
-- Qualquer pessoa joga e entra no ranking:
--   • membros com sessão → com o nome do perfil, e ganham XP/Gold na primeira
--     ronda do dia em cada pack;
--   • convidados sem conta → com uma alcunha (sem prémios).
-- As cartas vivem no repositório (utils/vana-sentinela/packs), não na BD.
--
-- Requer: supabase-migration-game-settings.sql e
--         supabase-migration-game-points-multiplier.sql (multiplicador de pontos).
-- ============================================

-- 1. Pontuações (uma linha por ronda acabada)
CREATE TABLE IF NOT EXISTS public.vana_sentinela_scores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack        text NOT NULL,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  guest_id    uuid,
  guest_name  text,
  points      integer NOT NULL CHECK (points >= 0),
  correct     integer NOT NULL CHECK (correct BETWEEN 0 AND 15),
  total       integer NOT NULL DEFAULT 15,
  max_combo   integer NOT NULL CHECK (max_combo BETWEEN 0 AND 15),
  duration_ms integer NOT NULL CHECK (duration_ms > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Para quem correu a primeira versão (só membros): abrir aos convidados.
ALTER TABLE public.vana_sentinela_scores ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.vana_sentinela_scores ADD COLUMN IF NOT EXISTS guest_id uuid;
ALTER TABLE public.vana_sentinela_scores ADD COLUMN IF NOT EXISTS guest_name text;

-- Cada linha é OU de um membro OU de um convidado (com alcunha de 2 a 20 caracteres).
ALTER TABLE public.vana_sentinela_scores DROP CONSTRAINT IF EXISTS vana_sentinela_scores_player_chk;
ALTER TABLE public.vana_sentinela_scores ADD CONSTRAINT vana_sentinela_scores_player_chk CHECK (
  (user_id IS NOT NULL AND guest_id IS NULL AND guest_name IS NULL)
  OR (user_id IS NULL AND guest_id IS NOT NULL AND char_length(guest_name) BETWEEN 2 AND 20)
);

CREATE INDEX IF NOT EXISTS idx_vana_sentinela_scores_pack_points ON public.vana_sentinela_scores (pack, points DESC);
CREATE INDEX IF NOT EXISTS idx_vana_sentinela_scores_user_created ON public.vana_sentinela_scores (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vana_sentinela_scores_guest_created ON public.vana_sentinela_scores (guest_id, created_at DESC);

-- 2. RLS
--    • Cada membro lê as suas próprias pontuações (recorde pessoal).
--    • Ninguém insere/altera diretamente: a rota /api/jogos/vana-sentinela/pontuacao
--      valida a ronda e grava com a service role.
--    • A coordenação pode ver e apagar pontuações (casos de batota ou alcunhas feias).
--    • O ranking (nomes incluídos) é lido só pela função abaixo.
ALTER TABLE public.vana_sentinela_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vana_sentinela_scores_select_own" ON public.vana_sentinela_scores;
CREATE POLICY "vana_sentinela_scores_select_own" ON public.vana_sentinela_scores
  FOR SELECT USING (auth.uid() = user_id);

-- (O DELETE ... WHERE id = … também precisa de ver a linha.)
DROP POLICY IF EXISTS "vana_sentinela_scores_select_coord" ON public.vana_sentinela_scores;
CREATE POLICY "vana_sentinela_scores_select_coord" ON public.vana_sentinela_scores
  FOR SELECT USING (public.get_my_role() = 'coordenador');

DROP POLICY IF EXISTS "vana_sentinela_scores_delete_coord" ON public.vana_sentinela_scores;
CREATE POLICY "vana_sentinela_scores_delete_coord" ON public.vana_sentinela_scores
  FOR DELETE USING (public.get_my_role() = 'coordenador');

-- 3. Ranking: melhor pontuação de cada jogador (membro ou convidado) no pack,
--    Top N + a linha de quem está a ver, se estiver fora do Top.
--    Público (anon incluído), mas só expõe o que o ranking precisa.
--    Desempate: mais acertos, depois menos tempo, depois a mais antiga.
--    p_period: 'semana' (desde segunda-feira, hora de Lisboa) ou 'sempre'.
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
        THEN date_trunc('week', now() AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon'
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

-- 4. Prémio dos membros: XP e Gold (iguais) na PRIMEIRA ronda do dia em cada pack
--    (dia de Lisboa): 1 se < 11 certas, 2 se ≥ 11, 3 se ≥ 14. Com multiplicador de
--    pontos (Gestão → Jogos). Tem de bater certo com recompensaPorAcertos em
--    utils/vana-sentinela/game.ts. Chamada pela rota da API com a sessão do membro,
--    logo a seguir a gravar a pontuação.
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

-- 5. Disponibilidade (Gestão → Jogos). Aberto a todos: é um jogo público.
--    Se preferires testá-lo primeiro só com a liderança, troca a linha por:
--      VALUES ('vana-sentinela', true, ARRAY['dirigente','coordenador']::text[], true)
INSERT INTO public.game_settings (game_id, enabled, allowed_roles, hidden)
VALUES ('vana-sentinela', true, ARRAY['desbravador', 'dirigente', 'coordenador']::text[], false)
ON CONFLICT (game_id) DO NOTHING;

-- Confirmação
SELECT game_id, enabled, allowed_roles, hidden FROM public.game_settings WHERE game_id = 'vana-sentinela';
