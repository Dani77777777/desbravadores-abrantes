-- ============================================
-- VANACORO — Fase 3: o jogo ao vivo
-- Spec: docs/VanaCoro.md (§3, §4, §7.3).
--
-- • vanacoro_sessions e vanacoro_players: leitura pública (o projetor não tem sessão
--   iniciada) e publicadas no realtime. Não têm nada secreto: os nomes das respostas
--   por revelar nunca estão aqui.
-- • vanacoro_rounds, vanacoro_reveals e vanacoro_round_events: só o servidor.
--   O projetor e os telemóveis pedem o quadro ao servidor, que só manda as respostas
--   já reveladas. Quando o quadro muda, board_version sobe e os ecrãs voltam a pedir.
-- • O estado de cada ronda é recalculado a partir do registo de ações
--   (utils/vana-coro/scoring.ts); "Desfazer" marca a última ação como desfeita.
-- • Todas as escritas passam pelas server actions (service role).
--
-- Requer: supabase-setup-vana-coro.sql e supabase-migration-vana-coro-grupos.sql.
-- Correr no SQL Editor do Supabase. É idempotente.
-- ============================================

-- 1. Sessões
CREATE TABLE IF NOT EXISTS public.vanacoro_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text NOT NULL,
  host_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'playing', 'finished')),
  phase              text CHECK (phase IN ('intro', 'faceoff', 'playing', 'steal', 'reveal_rest', 'round_end')),
  current_round      int NOT NULL DEFAULT 0,
  total_rounds       int NOT NULL DEFAULT 0,
  -- Perguntas escolhidas no lobby (as rondas só se criam ao começar)
  question_ids       uuid[] NOT NULL DEFAULT '{}',
  team_a_name        text NOT NULL DEFAULT 'Equipa A' CHECK (char_length(team_a_name) BETWEEN 1 AND 24),
  team_b_name        text NOT NULL DEFAULT 'Equipa B' CHECK (char_length(team_b_name) BETWEEN 1 AND 24),
  team_a_score       int NOT NULL DEFAULT 0,
  team_b_score       int NOT NULL DEFAULT 0,
  control_team       text CHECK (control_team IN ('a', 'b')),
  buzzed_team        text CHECK (buzzed_team IN ('a', 'b')),
  strikes            int NOT NULL DEFAULT 0 CHECK (strikes BETWEEN 0 AND 3),
  -- Conta todos os ❌ da ronda (dispara a animação no projetor)
  strike_seq         int NOT NULL DEFAULT 0,
  round_pot          int NOT NULL DEFAULT 0,
  round_winner       text CHECK (round_winner IN ('a', 'b')),
  round_banked       int NOT NULL DEFAULT 0,
  board_version      int NOT NULL DEFAULT 0,
  is_test_session    boolean NOT NULL DEFAULT false,
  rewards_awarded_at timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  started_at         timestamptz,
  ended_at           timestamptz
);
-- O mesmo código não pode estar em duas sessões por acabar
CREATE UNIQUE INDEX IF NOT EXISTS vanacoro_sessions_code_active
  ON public.vanacoro_sessions (code) WHERE status <> 'finished';
CREATE INDEX IF NOT EXISTS vanacoro_sessions_host_idx ON public.vanacoro_sessions (host_id, created_at DESC);

-- 2. Jogadores (membros, convidados e bots)
CREATE TABLE IF NOT EXISTS public.vanacoro_players (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           uuid NOT NULL REFERENCES public.vanacoro_sessions(id) ON DELETE CASCADE,
  profile_id           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  guest_name           text,
  display_name         text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  avatar_url           text,
  team                 text CHECK (team IN ('a', 'b')),
  is_captain           boolean NOT NULL DEFAULT false,
  is_bot               boolean NOT NULL DEFAULT false,
  rewards_recipient_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rewards_skipped      boolean NOT NULL DEFAULT false,
  joined_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vanacoro_players_session_idx ON public.vanacoro_players (session_id, joined_at);
CREATE UNIQUE INDEX IF NOT EXISTS vanacoro_players_one_per_member
  ON public.vanacoro_players (session_id, profile_id) WHERE profile_id IS NOT NULL;

-- 3. Rondas
CREATE TABLE IF NOT EXISTS public.vanacoro_rounds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES public.vanacoro_sessions(id) ON DELETE CASCADE,
  -- CASCADE: apagar uma pergunta de teste apaga as rondas em que foi usada
  question_id   uuid NOT NULL REFERENCES public.vanacoro_questions(id) ON DELETE CASCADE,
  round_number  int NOT NULL,
  multiplier    int NOT NULL DEFAULT 1,
  winner_team   text CHECK (winner_team IN ('a', 'b')),
  banked_points int NOT NULL DEFAULT 0,
  CONSTRAINT vanacoro_rounds_number_unique UNIQUE (session_id, round_number)
);

-- 4. Respostas reveladas (cópia do estado calculado, para o quadro público)
CREATE TABLE IF NOT EXISTS public.vanacoro_reveals (
  round_id       uuid REFERENCES public.vanacoro_rounds(id) ON DELETE CASCADE,
  board_entry_id uuid REFERENCES public.vanacoro_board_entries(id) ON DELETE CASCADE,
  scored         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, board_entry_id)
);

-- 5. Registo de ações de cada ronda (para o "Desfazer")
CREATE TABLE IF NOT EXISTS public.vanacoro_round_events (
  id         bigserial PRIMARY KEY,
  round_id   uuid NOT NULL REFERENCES public.vanacoro_rounds(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('start', 'buzz', 'reveal', 'strike', 'control', 'steal_result', 'finish')),
  payload    jsonb NOT NULL DEFAULT '{}',
  undone     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vanacoro_round_events_round_idx ON public.vanacoro_round_events (round_id, id);

-- 6. A pergunta jogada guarda a sessão
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vanacoro_questions_used_session_fk') THEN
    ALTER TABLE public.vanacoro_questions
      ADD CONSTRAINT vanacoro_questions_used_session_fk
      FOREIGN KEY (used_in_session_id) REFERENCES public.vanacoro_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 7. RLS: sessões e jogadores com leitura pública; o resto só o servidor.
ALTER TABLE public.vanacoro_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanacoro_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanacoro_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanacoro_reveals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanacoro_round_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vanacoro_sessions_read" ON public.vanacoro_sessions;
CREATE POLICY "vanacoro_sessions_read" ON public.vanacoro_sessions FOR SELECT USING (true);
DROP POLICY IF EXISTS "vanacoro_players_read" ON public.vanacoro_players;
CREATE POLICY "vanacoro_players_read" ON public.vanacoro_players FOR SELECT USING (true);

REVOKE ALL ON public.vanacoro_sessions, public.vanacoro_players FROM anon, authenticated;
GRANT SELECT ON public.vanacoro_sessions, public.vanacoro_players TO anon, authenticated;
REVOKE ALL ON public.vanacoro_rounds, public.vanacoro_reveals, public.vanacoro_round_events FROM anon, authenticated;

-- 8. Realtime: só sessões e jogadores (nada de respostas, grupos ou quadro).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'vanacoro_sessions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vanacoro_sessions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'vanacoro_players') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vanacoro_players;
  END IF;
END $$;
ALTER TABLE public.vanacoro_players REPLICA IDENTITY FULL;

-- 9. Gravar o estado recalculado de uma ronda, tudo de uma vez.
-- p_last_event_id = a última ação que o servidor usou no cálculo. Se entretanto
-- entrou outra (ex.: um "Já sei!" ao mesmo tempo), recusa com 'stale' e o servidor
-- volta a calcular.
-- p_state = { phase, buzzed_team, control_team, strikes, strike_seq, pot, winner, banked,
--             reveals: [{ entry_id, scored }] }
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
      team_a_score = v_a,
      team_b_score = v_b,
      board_version = board_version + 1
  WHERE id = p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.vanacoro_save_round(uuid, uuid, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vanacoro_save_round(uuid, uuid, bigint, jsonb) TO service_role;

-- 10. Subir board_version (mudanças de ronda, lobby…) sem ler e escrever à parte
CREATE OR REPLACE FUNCTION public.vanacoro_bump(p_session_id uuid) RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.vanacoro_sessions SET board_version = board_version + 1 WHERE id = p_session_id;
$$;
REVOKE ALL ON FUNCTION public.vanacoro_bump(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vanacoro_bump(uuid) TO service_role;

-- Confirmação
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename LIKE 'vanacoro_%'
ORDER BY tablename;
