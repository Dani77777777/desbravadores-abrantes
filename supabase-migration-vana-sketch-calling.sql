-- ============================================================
-- VanaSketch — fase "calling" (vai até à frente)
-- Antes de escolher a palavra, o desenhador sorteado é chamado à
-- frente. As 3 opções só aparecem quando o host as revela
-- (calling → choosing).
--
-- Sem esta migração o jogo continua a funcionar como antes: o
-- servidor salta directamente para 'choosing'.
-- ============================================================

-- ── Nova fase ────────────────────────────────────────────────
ALTER TABLE public.vanasketch_sessions
  DROP CONSTRAINT IF EXISTS vanasketch_sessions_phase_check;

ALTER TABLE public.vanasketch_sessions
  ADD CONSTRAINT vanasketch_sessions_phase_check
  CHECK (phase IN ('calling','choosing','drawing','round_end'));

-- ── RPC do desenhador: as opções ficam escondidas até o host as revelar ──
-- (o host continua a vê-las; o desenhador recebe uma lista vazia em 'calling')
CREATE OR REPLACE FUNCTION public.get_vanasketch_drawer_info(p_session_id uuid)
RETURNS TABLE (
  round_number int,
  word_options jsonb,
  word         text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_is_host   boolean;
  v_is_drawer boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.vanasketch_sessions s
    WHERE s.id = p_session_id AND s.host_id = v_uid
  ) INTO v_is_host;

  IF NOT v_is_host THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.vanasketch_sessions s
      JOIN public.vanasketch_players p ON p.id = s.drawer_player_id
      WHERE s.id = p_session_id AND p.user_id = v_uid
    ) INTO v_is_drawer;
  END IF;

  IF NOT (v_is_host OR v_is_drawer) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
    SELECT
      r.round_number,
      CASE WHEN s.phase = 'calling' AND NOT v_is_host THEN '[]'::jsonb ELSE r.word_options END,
      r.word
    FROM public.vanasketch_rounds r
    JOIN public.vanasketch_sessions s ON s.id = r.session_id
    WHERE r.session_id = p_session_id AND r.round_number = s.round_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vanasketch_drawer_info(uuid) TO authenticated;
