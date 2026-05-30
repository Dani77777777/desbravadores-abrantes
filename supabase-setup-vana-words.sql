-- ============================================================
-- VanaWords — jogo estilo Codenames
-- Grelha 5×5: 5 palavras Leão | 5 palavras Águia | 1 preta | 14 neutras
-- ============================================================

-- ── Sessões ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vanawords_sessions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id             uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code                text        NOT NULL UNIQUE,
  status              text        NOT NULL DEFAULT 'lobby'
    CHECK (status IN ('lobby','team_preview','arauto_spin','arauto_ready','playing','finished')),
  current_team        text        CHECK (current_team IN ('a','b')),
  current_phase       text        CHECK (current_phase IN ('hinting','guessing')),
  current_hint        text,
  current_hint_number int,
  guesses_remaining   int         DEFAULT 0,
  winner_team         text        CHECK (winner_team IN ('a','b')),
  win_reason          text        CHECK (win_reason IN ('all_found','black_hit')),
  board_version       int         NOT NULL DEFAULT 0,
  is_test_session     boolean     NOT NULL DEFAULT false,
  rewards_awarded     boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  started_at          timestamptz,
  ended_at            timestamptz
);

-- ── Jogadores ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vanawords_players (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid        NOT NULL REFERENCES public.vanawords_sessions(id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_name text        NOT NULL,
  avatar_url   text,
  section      text,
  team         text        CHECK (team IN ('a','b')),
  is_arauto    boolean     NOT NULL DEFAULT false,
  is_bot       boolean     NOT NULL DEFAULT false,
  joined_at    timestamptz NOT NULL DEFAULT now()
);

-- Um utilizador real só pode estar uma vez por sessão
CREATE UNIQUE INDEX IF NOT EXISTS vanawords_players_session_user_unique
  ON public.vanawords_players (session_id, user_id)
  WHERE user_id IS NOT NULL;

-- Bots só em sessões de teste
CREATE OR REPLACE FUNCTION public.vanawords_check_bot()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_bot = true THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vanawords_sessions s
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

DROP TRIGGER IF EXISTS vanawords_bot_check ON public.vanawords_players;
CREATE TRIGGER vanawords_bot_check
  BEFORE INSERT OR UPDATE ON public.vanawords_players
  FOR EACH ROW EXECUTE FUNCTION public.vanawords_check_bot();

-- ── Palavras da sessão (dados sensíveis — team oculto via RPC) ──
CREATE TABLE IF NOT EXISTS public.vanawords_words (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid        NOT NULL REFERENCES public.vanawords_sessions(id) ON DELETE CASCADE,
  word        text        NOT NULL,
  team        text        NOT NULL CHECK (team IN ('a','b','neutral','black')),
  grid_pos    int         NOT NULL CHECK (grid_pos >= 0 AND grid_pos < 25),
  is_revealed boolean     NOT NULL DEFAULT false,
  revealed_at timestamptz,
  UNIQUE(session_id, grid_pos)
);

-- ── Palpites ativos dos jogadores ────────────────────────────
CREATE TABLE IF NOT EXISTS public.vanawords_guesses (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid        NOT NULL REFERENCES public.vanawords_sessions(id) ON DELETE CASCADE,
  word_id    uuid        NOT NULL REFERENCES public.vanawords_words(id) ON DELETE CASCADE,
  player_id  uuid        NOT NULL REFERENCES public.vanawords_players(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(word_id, player_id)
);

-- ── Histórico de turnos ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vanawords_turns (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid        NOT NULL REFERENCES public.vanawords_sessions(id) ON DELETE CASCADE,
  team           text        NOT NULL CHECK (team IN ('a','b')),
  hint_word      text,
  hint_number    int,
  words_revealed jsonb       NOT NULL DEFAULT '[]',
  end_reason     text        CHECK (end_reason IN ('pass','neutral','opponent','black','limit')),
  turn_order     int         NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── RPC: palavras públicas (sem team para jogadores normais) ──
CREATE OR REPLACE FUNCTION public.get_vanawords_public(p_session_id uuid)
RETURNS TABLE (
  id          uuid,
  session_id  uuid,
  word        text,
  team        text,
  grid_pos    int,
  is_revealed boolean,
  revealed_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id,
    session_id,
    word,
    CASE WHEN is_revealed THEN team ELSE NULL END AS team,
    grid_pos,
    is_revealed,
    revealed_at
  FROM public.vanawords_words
  WHERE session_id = p_session_id
  ORDER BY grid_pos;
$$;

GRANT EXECUTE ON FUNCTION public.get_vanawords_public(uuid) TO authenticated;

-- ── RPC: palavras com cores (apenas arautos e host) ─────────
CREATE OR REPLACE FUNCTION public.get_vanawords_with_teams(p_session_id uuid)
RETURNS TABLE (
  id          uuid,
  session_id  uuid,
  word        text,
  team        text,
  grid_pos    int,
  is_revealed boolean,
  revealed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_host  boolean;
  v_is_arauto boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.vanawords_sessions s
    WHERE s.id = p_session_id AND s.host_id = v_uid
  ) INTO v_is_host;

  IF NOT v_is_host THEN
    SELECT EXISTS (
      SELECT 1 FROM public.vanawords_players p
      WHERE p.session_id = p_session_id AND p.user_id = v_uid AND p.is_arauto = true
    ) INTO v_is_arauto;
  END IF;

  IF NOT (v_is_host OR v_is_arauto) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
    SELECT w.id, w.session_id, w.word, w.team, w.grid_pos, w.is_revealed, w.revealed_at
    FROM public.vanawords_words w
    WHERE w.session_id = p_session_id
    ORDER BY w.grid_pos;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vanawords_with_teams(uuid) TO authenticated;

-- ── RPC: bot para impersonação (host em sessão de teste) ─────
CREATE OR REPLACE FUNCTION public.get_vanawords_bot(p_session_id uuid, p_player_id uuid)
RETURNS TABLE (
  id           uuid,
  display_name text,
  team         text,
  is_arauto    boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.vanawords_sessions s
    WHERE s.id = p_session_id AND s.host_id = v_uid AND s.is_test_session = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
    SELECT p.id, p.display_name, p.team, p.is_arauto
    FROM public.vanawords_players p
    WHERE p.session_id = p_session_id AND p.id = p_player_id AND p.is_bot = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vanawords_bot(uuid, uuid) TO authenticated;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.vanawords_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanawords_players  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanawords_words    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanawords_guesses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanawords_turns    ENABLE ROW LEVEL SECURITY;

-- Sessões
CREATE POLICY "vw_sessions_read"   ON public.vanawords_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "vw_sessions_insert" ON public.vanawords_sessions FOR INSERT TO authenticated WITH CHECK (host_id = auth.uid());
CREATE POLICY "vw_sessions_update" ON public.vanawords_sessions FOR UPDATE TO authenticated USING (host_id = auth.uid());

-- Jogadores
CREATE POLICY "vw_players_read"    ON public.vanawords_players FOR SELECT TO authenticated USING (true);
CREATE POLICY "vw_players_insert"  ON public.vanawords_players FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.vanawords_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
);
CREATE POLICY "vw_players_update"  ON public.vanawords_players FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.vanawords_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
);
CREATE POLICY "vw_players_delete"  ON public.vanawords_players FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.vanawords_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
);

-- Palavras — apenas o host acede directamente; jogadores usam a RPC
CREATE POLICY "vw_words_host_read"   ON public.vanawords_words FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.vanawords_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
);
CREATE POLICY "vw_words_host_insert" ON public.vanawords_words FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.vanawords_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
);
CREATE POLICY "vw_words_host_update" ON public.vanawords_words FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.vanawords_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
);

-- Palpites
CREATE POLICY "vw_guesses_read"   ON public.vanawords_guesses FOR SELECT TO authenticated USING (true);
CREATE POLICY "vw_guesses_insert" ON public.vanawords_guesses FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.vanawords_players p WHERE p.id = player_id AND p.user_id = auth.uid())
  OR
  EXISTS (SELECT 1 FROM public.vanawords_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
);
CREATE POLICY "vw_guesses_delete" ON public.vanawords_guesses FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.vanawords_players p WHERE p.id = player_id AND p.user_id = auth.uid())
  OR
  EXISTS (SELECT 1 FROM public.vanawords_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
);

-- Turnos
CREATE POLICY "vw_turns_read"   ON public.vanawords_turns FOR SELECT TO authenticated USING (true);
CREATE POLICY "vw_turns_insert" ON public.vanawords_turns FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.vanawords_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
);
CREATE POLICY "vw_turns_update" ON public.vanawords_turns FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.vanawords_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
);

-- ── Realtime ─────────────────────────────────────────────────
-- vanawords_words NÃO entra — dados sensíveis; jogadores usam RPC
ALTER PUBLICATION supabase_realtime ADD TABLE public.vanawords_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vanawords_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vanawords_guesses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vanawords_turns;

-- REPLICA IDENTITY FULL: necessário para que os eventos DELETE incluam
-- todos os campos (ex. session_id) e os filtros realtime funcionem.
ALTER TABLE public.vanawords_guesses REPLICA IDENTITY FULL;
ALTER TABLE public.vanawords_players REPLICA IDENTITY FULL;
ALTER TABLE public.vanawords_turns   REPLICA IDENTITY FULL;
