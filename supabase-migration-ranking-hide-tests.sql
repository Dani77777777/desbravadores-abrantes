-- ============================================
-- RANKING · SEM CONTAS DE TESTE NEM CONTAS SÓ COM EMAIL
-- ============================================
-- Ficam fora do ranking (página /leaderboard e Ecrã do Clube):
--   • contas com "teste" no nome (ex.: "Daniel Filho - testes");
--   • contas que ainda só têm o email (quem se registou sem nome fica com o email no
--     full_name, pelo trigger handle_new_user) ou sem nome nenhum.
-- Continuam a aparecer todas no admin (Membros), que lê a tabela profiles, não estas.
-- Assim que a pessoa põe o nome verdadeiro, volta ao ranking sozinha.
--
-- Corre este ficheiro inteiro no SQL Editor do Supabase. É idempotente.
-- ============================================

-- 1. A regra, num só sítio.
CREATE OR REPLACE FUNCTION public.is_hidden_from_ranking(name text)
RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT name IS NULL
      OR btrim(name) = ''
      OR position('@' IN name) > 0
      OR name ILIKE '%teste%'
$$;

COMMENT ON FUNCTION public.is_hidden_from_ranking(text) IS 'Contas de teste (nome com "teste") ou ainda só com o email/sem nome: ficam fora do ranking.';


-- 2. Vista pública do ranking (mesmas colunas, só mais um filtro).
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
  AND NOT public.is_hidden_from_ranking(full_name)
ORDER BY total_xp DESC;

COMMENT ON VIEW public.leaderboard IS 'Public view for the club leaderboard: desbravadores and dirigentes (not coordenadores), without test accounts or accounts that only have an email.';


-- 3. Ranking numa data (Ecrã do Clube). Mesmo tipo de retorno: basta CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.get_leaderboard_at_date(target_date timestamp with time zone)
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
    AND NOT public.is_hidden_from_ranking(p.full_name)
  GROUP BY p.id, p.full_name, p.avatar_url, p.section, p.leadership_section, p.role, p.is_invested;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard_at_date(timestamp with time zone) TO authenticated;
