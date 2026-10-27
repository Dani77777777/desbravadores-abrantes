-- ============================================================
-- VanaSketch — correções antes do lançamento
-- Correr depois do supabase-setup-vana-sketch.sql.
-- Seguro de correr mais do que uma vez.
--
-- 1. Pontuação atómica: dois palpites certos ao mesmo tempo liam o mesmo
--    score do desenhador e um dos +30 perdia-se.
-- 2. Um jogador só pode ter um palpite certo por ronda (dois envios
--    rápidos davam pontos a dobrar).
-- ============================================================

CREATE OR REPLACE FUNCTION public.vanasketch_add_score(p_player_id uuid, p_delta int)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.vanasketch_players SET score = score + p_delta WHERE id = p_player_id;
$$;

-- Só as server actions (service role) mexem na pontuação
REVOKE EXECUTE ON FUNCTION public.vanasketch_add_score(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vanasketch_add_score(uuid, int) TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS vanasketch_guesses_one_correct
  ON public.vanasketch_guesses (session_id, round_number, player_id)
  WHERE is_correct;
