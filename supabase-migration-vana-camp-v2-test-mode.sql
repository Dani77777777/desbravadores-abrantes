-- ============================================
-- VANACAMP migration v2: TEST MODE / BOTS
-- Permite ao host criar sessões marcadas como "teste" onde pode adicionar
-- jogadores-bot (sem user_id real) que controla pelo painel.
-- ============================================

-- Sessões podem ser marcadas como teste
ALTER TABLE public.vanacamp_sessions
  ADD COLUMN IF NOT EXISTS is_test_session boolean NOT NULL DEFAULT false;

-- Jogadores podem ser bots (sem user_id) — só permitido em sessões de teste
ALTER TABLE public.vanacamp_players
  ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;

ALTER TABLE public.vanacamp_players
  ALTER COLUMN user_id DROP NOT NULL;

-- Substitui o UNIQUE antigo por um partial unique que só se aplica quando há user_id
ALTER TABLE public.vanacamp_players
  DROP CONSTRAINT IF EXISTS vanacamp_players_session_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS vanacamp_players_session_user_unique
  ON public.vanacamp_players (session_id, user_id)
  WHERE user_id IS NOT NULL;

-- Constraint: bots têm de estar em sessões de teste (defesa em profundidade)
-- (validamos também no server action; isto é safety net.)
CREATE OR REPLACE FUNCTION public.vanacamp_check_bot_in_test_session()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_bot = true THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vanacamp_sessions s
      WHERE s.id = NEW.session_id AND s.is_test_session = true
    ) THEN
      RAISE EXCEPTION 'Bots só podem ser adicionados a sessões marcadas como teste.';
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

DROP TRIGGER IF EXISTS vanacamp_check_bot_trigger ON public.vanacamp_players;
CREATE TRIGGER vanacamp_check_bot_trigger
  BEFORE INSERT OR UPDATE ON public.vanacamp_players
  FOR EACH ROW EXECUTE FUNCTION public.vanacamp_check_bot_in_test_session();

-- Atualiza a view pública para incluir is_bot (útil para a UI marcar visualmente)
DROP VIEW IF EXISTS public.vanacamp_players_public;
CREATE OR REPLACE VIEW public.vanacamp_players_public AS
  SELECT
    id,
    session_id,
    user_id,
    display_name,
    is_mayor,
    is_alive,
    is_bot,
    eliminated_on_day,
    eliminated_by,
    joined_at
  FROM public.vanacamp_players;

GRANT SELECT ON public.vanacamp_players_public TO anon, authenticated;
