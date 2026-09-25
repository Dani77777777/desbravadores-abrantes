-- ============================================
-- RANKING · DIRIGENTES INCLUÍDOS
-- ============================================
-- Os dirigentes passam a aparecer no ranking (página pública /leaderboard e Ecrã do
-- Clube), com a etiqueta "Dirigente". Os coordenadores continuam de fora.
--
-- A secção de um dirigente é a que ele lidera (leadership_section), para aparecer no
-- filtro dessa secção no Ecrã do Clube.
--
-- A vista corre com as permissões do dono (não é security_invoker), por isso não é
-- preciso mexer na política "Public can view desbravador leaderboard info": só as
-- colunas da vista ficam públicas, não o perfil inteiro dos dirigentes.
--
-- Corre este ficheiro inteiro no SQL Editor do Supabase. É idempotente.
-- ============================================

-- 1. Vista pública do ranking
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
    id,
    full_name,
    avatar_url,
    CASE WHEN role = 'dirigente' THEN COALESCE(leadership_section, section) ELSE section END AS section,
    role,
    total_xp,
    current_gold,
    (total_xp + current_gold) as combined_score,
    is_invested
FROM public.profiles
WHERE role IN ('desbravador', 'dirigente')
ORDER BY total_xp DESC;

COMMENT ON VIEW public.leaderboard IS 'Public view for the club leaderboard: desbravadores and dirigentes (not coordenadores).';


-- 2. Ranking numa data (Ecrã do Clube) — passa a devolver também o `role`.
--    Mudar as colunas devolvidas obriga a apagar a função antes.
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
