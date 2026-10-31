-- ============================================
-- VANACORO — duelo automático
-- ============================================
-- O duelo passa a seguir sozinho as regras do programa (utils/vana-coro/scoring.ts):
-- de quem é a vez, a primeira resposta da troca e quem fica com o controlo.
-- A sessão guarda a vez e a primeira resposta, para o projetor e os telemóveis
-- mostrarem "Agora responde a Equipa B!".
--
-- Requer: supabase-migration-vana-coro-jogo.sql.
-- Correr no SQL Editor do Supabase. É idempotente.
-- ============================================

ALTER TABLE public.vanacoro_sessions
  ADD COLUMN IF NOT EXISTS faceoff_turn text CHECK (faceoff_turn IN ('a', 'b'));
ALTER TABLE public.vanacoro_sessions
  ADD COLUMN IF NOT EXISTS faceoff_first_team text CHECK (faceoff_first_team IN ('a', 'b'));
-- Lugar no quadro da primeira resposta (null com equipa = falhou)
ALTER TABLE public.vanacoro_sessions
  ADD COLUMN IF NOT EXISTS faceoff_first_rank int;

-- A mesma função da migração do jogo, agora também com a vez do duelo.
CREATE OR REPLACE FUNCTION public.vanacoro_save_round(
  p_session_id uuid,
  p_round_id uuid,
  p_last_event_id bigint,
  p_state jsonb
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_a int;
  v_b int;
BEGIN
  -- Uma gravação de cada vez por sessão
  PERFORM 1 FROM public.vanacoro_sessions WHERE id = p_session_id FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.vanacoro_round_events
    WHERE round_id = p_round_id AND NOT undone AND id > coalesce(p_last_event_id, 0)
  ) THEN
    RAISE EXCEPTION 'stale';
  END IF;

  DELETE FROM public.vanacoro_reveals WHERE round_id = p_round_id;
  INSERT INTO public.vanacoro_reveals (round_id, board_entry_id, scored)
  SELECT p_round_id, (r->>'entry_id')::uuid, coalesce((r->>'scored')::boolean, true)
  FROM jsonb_array_elements(coalesce(p_state->'reveals', '[]'::jsonb)) r;

  UPDATE public.vanacoro_rounds
  SET winner_team = nullif(p_state->>'winner', ''),
      banked_points = coalesce((p_state->>'banked')::int, 0)
  WHERE id = p_round_id;

  SELECT coalesce(sum(banked_points) FILTER (WHERE winner_team = 'a'), 0),
         coalesce(sum(banked_points) FILTER (WHERE winner_team = 'b'), 0)
  INTO v_a, v_b
  FROM public.vanacoro_rounds WHERE session_id = p_session_id;

  UPDATE public.vanacoro_sessions
  SET phase = p_state->>'phase',
      buzzed_team = nullif(p_state->>'buzzed_team', ''),
      control_team = nullif(p_state->>'control_team', ''),
      strikes = least(coalesce((p_state->>'strikes')::int, 0), 3),
      strike_seq = coalesce((p_state->>'strike_seq')::int, 0),
      round_pot = coalesce((p_state->>'pot')::int, 0),
      round_winner = nullif(p_state->>'winner', ''),
      round_banked = coalesce((p_state->>'banked')::int, 0),
      faceoff_turn = nullif(p_state->>'faceoff_turn', ''),
      faceoff_first_team = nullif(p_state->>'faceoff_first_team', ''),
      faceoff_first_rank = (p_state->>'faceoff_first_rank')::int,
      team_a_score = v_a,
      team_b_score = v_b,
      board_version = board_version + 1
  WHERE id = p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.vanacoro_save_round(uuid, uuid, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vanacoro_save_round(uuid, uuid, bigint, jsonb) TO service_role;

-- Confirmação
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'vanacoro_sessions' AND column_name LIKE 'faceoff_%'
ORDER BY column_name;
