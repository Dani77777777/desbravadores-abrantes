-- ============================================================
-- VanaSketch — sessões de teste com bots (como no VanaWords)
-- Correr depois do supabase-setup-vana-sketch.sql.
-- Seguro de correr mais do que uma vez.
-- ============================================================

ALTER TABLE public.vanasketch_sessions
  ADD COLUMN IF NOT EXISTS is_test_session boolean NOT NULL DEFAULT false;

ALTER TABLE public.vanasketch_players
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.vanasketch_players
  ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;

-- Bots só em sessões de teste; jogadores reais têm de ter user_id
CREATE OR REPLACE FUNCTION public.vanasketch_check_bot()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_bot = true THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vanasketch_sessions s
      WHERE s.id = NEW.session_id AND s.is_test_session = true
    ) THEN
      RAISE EXCEPTION 'Bots só podem ser adicionados a sessões de teste.';
    END IF;
    IF NEW.user_id IS NOT NULL THEN
      RAISE EXCEPTION 'Um bot não pode ter user_id.';
    END IF;
  ELSE
    IF NEW.user_id IS NULL THEN
      RAISE EXCEPTION 'Um jogador não-bot tem de ter user_id.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vanasketch_bot_check ON public.vanasketch_players;
CREATE TRIGGER vanasketch_bot_check
  BEFORE INSERT OR UPDATE ON public.vanasketch_players
  FOR EACH ROW EXECUTE FUNCTION public.vanasketch_check_bot();

-- RPC: dados de um bot para impersonação (só host de sessão de teste)
CREATE OR REPLACE FUNCTION public.get_vanasketch_bot(p_session_id uuid, p_player_id uuid)
RETURNS TABLE (
  id           uuid,
  display_name text,
  score        int,
  draw_order   int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.vanasketch_sessions s
    WHERE s.id = p_session_id AND s.host_id = v_uid AND s.is_test_session = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
    SELECT p.id, p.display_name, p.score, p.draw_order
    FROM public.vanasketch_players p
    WHERE p.session_id = p_session_id AND p.id = p_player_id AND p.is_bot = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vanasketch_bot(uuid, uuid) TO authenticated;
