-- ============================================
-- FERRAMENTAS · ECRÃ DO CLUBE (ranking no projetor + app do clube)
-- ============================================
-- 1. club_screens — o que o ecrã do clube está a mostrar (logo, ranking, cronómetro,
--    sorteio, equipas) e as definições do ranking. Igual ao raffle_screens/timer_screens:
--    uma linha por anfitrião; o controlo (PC, telemóvel ou a app) escreve `state` e o
--    projetor (mesma conta) lê por realtime.
-- 2. get_leaderboard_at_date — pontos de cada desbravador e dirigente até uma data (soma do
--    points_log). Serve para mostrar "ontem" e depois "hoje" com quem subiu e desceu.
--    Já existia para a app antiga do ranking; fica aqui para ficar tudo junto.
--
-- Corre este ficheiro inteiro no SQL Editor do Supabase. É idempotente.
-- ============================================


-- ============================================
-- 1. ECRÃ DO CLUBE
-- ============================================

CREATE TABLE IF NOT EXISTS public.club_screens (
  host_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.club_screens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "club_screens_own" ON public.club_screens;
CREATE POLICY "club_screens_own" ON public.club_screens FOR ALL
  USING (host_id = auth.uid())
  WITH CHECK (
    host_id = auth.uid()
    AND public.get_my_role() IN ('coordenador', 'dirigente')
  );

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.club_screens;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================
-- 2. RANKING NUMA DATA
-- ============================================
-- O reset de época não apaga histórico (insere compensações no points_log), por isso
-- somar o points_log até uma data dá sempre o saldo certo nesse momento.

-- Desbravadores e dirigentes (com a secção que lideram); os coordenadores ficam de fora.
DROP FUNCTION IF EXISTS public.get_leaderboard_at_date(timestamp with time zone);

CREATE FUNCTION public.get_leaderboard_at_date(target_date timestamp with time zone)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  section app_section,
  role app_role,
  is_invested boolean,
  total_xp bigint,
  current_gold bigint
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.avatar_url,
    CASE WHEN p.role = 'dirigente' THEN COALESCE(p.leadership_section, p.section) ELSE p.section END,
    p.role,
    p.is_invested,
    COALESCE(SUM(pl.amount_xp), 0)::bigint AS total_xp,
    COALESCE(SUM(pl.amount_gold), 0)::bigint AS current_gold
  FROM public.profiles p
  LEFT JOIN public.points_log pl ON p.id = pl.target_user_id AND pl.created_at <= target_date
  WHERE p.role IN ('desbravador', 'dirigente')
  GROUP BY p.id, p.full_name, p.avatar_url, p.section, p.leadership_section, p.role, p.is_invested;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard_at_date(timestamp with time zone) TO authenticated;
