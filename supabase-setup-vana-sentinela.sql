-- ============================================
-- VANASENTINELA — Verdade ou Distorção?
-- Jogo singleplayer de swipe sobre as pregações do Evangelista Jefferson Araújo.
-- Correr no SQL Editor do Supabase. É idempotente.
--
-- Qualquer pessoa joga (sem conta), mas só os membros com sessão gravam
-- pontuações e aparecem no ranking. As cartas vivem no repositório
-- (utils/vana-sentinela/packs), não na base de dados.
-- ============================================

-- 1. Pontuações (uma linha por ronda acabada de um membro)
CREATE TABLE IF NOT EXISTS public.vana_sentinela_scores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack        text NOT NULL,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points      integer NOT NULL CHECK (points >= 0),
  correct     integer NOT NULL CHECK (correct BETWEEN 0 AND 15),
  total       integer NOT NULL DEFAULT 15,
  max_combo   integer NOT NULL CHECK (max_combo BETWEEN 0 AND 15),
  duration_ms integer NOT NULL CHECK (duration_ms > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vana_sentinela_scores_pack_points ON public.vana_sentinela_scores (pack, points DESC);
CREATE INDEX IF NOT EXISTS idx_vana_sentinela_scores_user_created ON public.vana_sentinela_scores (user_id, created_at DESC);

-- 2. RLS
--    • Cada membro lê as suas próprias pontuações (recorde pessoal).
--    • Ninguém insere/altera diretamente: a rota /api/jogos/vana-sentinela/pontuacao
--      valida a ronda e grava com a service role.
--    • A coordenação pode apagar pontuações (casos de batota).
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

-- 3. Ranking: melhor pontuação de cada jogador no pack, Top N + a linha de quem
--    está a ver (se tiver sessão e estiver fora do Top). Público (anon incluído),
--    mas só expõe o que o ranking precisa: nome, avatar, secção e a pontuação.
--    Desempate: mais acertos, depois menos tempo, depois a mais antiga.
--    p_period: 'semana' (desde segunda-feira, hora de Lisboa) ou 'sempre'.
DROP FUNCTION IF EXISTS public.get_vana_sentinela_ranking(text, text, integer);
CREATE OR REPLACE FUNCTION public.get_vana_sentinela_ranking(
  p_pack text,
  p_period text DEFAULT 'sempre',
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  score_id uuid,
  rank_position bigint,
  full_name text,
  avatar_url text,
  section text,
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
    SELECT DISTINCT ON (s.user_id) s.*
    FROM public.vana_sentinela_scores s, since
    WHERE s.pack = p_pack
      AND (since.t IS NULL OR s.created_at >= since.t)
    ORDER BY s.user_id, s.points DESC, s.correct DESC, s.duration_ms ASC, s.created_at ASC
  ),
  ranked AS (
    SELECT b.*,
           row_number() OVER (ORDER BY b.points DESC, b.correct DESC, b.duration_ms ASC, b.created_at ASC) AS pos
    FROM best b
  )
  SELECT r.id, r.pos, p.full_name, p.avatar_url, p.section::text,
         r.points, r.correct, r.total, r.duration_ms, r.created_at,
         (auth.uid() IS NOT NULL AND r.user_id = auth.uid())
  FROM ranked r
  JOIN public.profiles p ON p.id = r.user_id
  WHERE r.pos <= LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)
     OR (auth.uid() IS NOT NULL AND r.user_id = auth.uid())
  ORDER BY r.pos;
$$;

REVOKE ALL ON FUNCTION public.get_vana_sentinela_ranking(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vana_sentinela_ranking(text, text, integer) TO anon, authenticated;

-- 4. Disponibilidade (Gestão → Jogos). Aberto a todos: é um jogo público.
--    Se preferires testá-lo primeiro só com a liderança, troca a linha por:
--      VALUES ('vana-sentinela', true, ARRAY['dirigente','coordenador']::text[], true)
INSERT INTO public.game_settings (game_id, enabled, allowed_roles, hidden)
VALUES ('vana-sentinela', true, ARRAY['desbravador', 'dirigente', 'coordenador']::text[], false)
ON CONFLICT (game_id) DO NOTHING;

-- Confirmação
SELECT game_id, enabled, allowed_roles, hidden FROM public.game_settings WHERE game_id = 'vana-sentinela';
