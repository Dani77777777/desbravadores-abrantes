-- ============================================
-- VANACAMP: INFILTRADOS — TABLES
-- Werewolf-style game for authenticated members.
-- Run after supabase-setup.sql
-- ============================================

-- ============================================
-- TABLES
-- ============================================

-- Game sessions (one room per game)
CREATE TABLE IF NOT EXISTS public.vanacamp_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  code text NOT NULL UNIQUE,                       -- short join code (6 chars)
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN (
    'lobby',
    'role_preview',
    'role_reveal',
    'mayor_election',
    'night_infiltrators',
    'night_seer',
    'night_guardian',
    'day_announce',
    'day_discussion',
    'day_vote',
    'day_result',
    'finished',
    'cancelled'
  )),
  phase_started_at timestamptz,
  phase_ends_at timestamptz,                       -- soft deadline; host can extend
  phase_paused_at timestamptz,                     -- when set, timer is paused
  day_number integer NOT NULL DEFAULT 0,
  chat_mode text NOT NULL DEFAULT 'presencial' CHECK (chat_mode IN ('presencial', 'remote')),
  mayor_mode text NOT NULL DEFAULT 'none' CHECK (mayor_mode IN ('none', 'auto', 'vote_day1', 'manual')),
  role_assignment_mode text NOT NULL DEFAULT 'auto' CHECK (role_assignment_mode IN ('auto', 'auto_custom', 'manual')),
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,  -- custom role counts etc.
  winner_side text CHECK (winner_side IN ('infiltrators', 'desbravadores')),
  rewards_awarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS vanacamp_sessions_code_idx ON public.vanacamp_sessions (code);
CREATE INDEX IF NOT EXISTS vanacamp_sessions_status_idx ON public.vanacamp_sessions (status);

-- Players within a session
CREATE TABLE IF NOT EXISTS public.vanacamp_players (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES public.vanacamp_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  display_name text NOT NULL,
  role text CHECK (role IN ('infiltrator', 'seer', 'guardian', 'villager')),  -- NULL until preview/assignment
  is_mayor boolean NOT NULL DEFAULT false,
  is_alive boolean NOT NULL DEFAULT true,
  eliminated_on_day integer,
  eliminated_by text CHECK (eliminated_by IN ('sabotage', 'vote')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS vanacamp_players_session_idx ON public.vanacamp_players (session_id);

-- Night actions (sabotage targets, prophecies, protections)
CREATE TABLE IF NOT EXISTS public.vanacamp_night_actions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES public.vanacamp_sessions(id) ON DELETE CASCADE NOT NULL,
  day_number integer NOT NULL,
  phase text NOT NULL CHECK (phase IN ('infiltrators', 'seer', 'guardian')),
  actor_player_id uuid REFERENCES public.vanacamp_players(id) ON DELETE CASCADE NOT NULL,
  target_player_id uuid REFERENCES public.vanacamp_players(id) ON DELETE CASCADE NOT NULL,
  result text,                                     -- seer only: 'fiel' | 'infiltrado'
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, day_number, phase, actor_player_id)
);

CREATE INDEX IF NOT EXISTS vanacamp_night_actions_session_day_idx
  ON public.vanacamp_night_actions (session_id, day_number);

-- Votes (mayor election + daily expulsion)
CREATE TABLE IF NOT EXISTS public.vanacamp_votes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES public.vanacamp_sessions(id) ON DELETE CASCADE NOT NULL,
  day_number integer NOT NULL,
  vote_type text NOT NULL CHECK (vote_type IN ('mayor_election', 'day_expulsion')),
  voter_player_id uuid REFERENCES public.vanacamp_players(id) ON DELETE CASCADE NOT NULL,
  target_player_id uuid REFERENCES public.vanacamp_players(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, day_number, vote_type, voter_player_id)
);

CREATE INDEX IF NOT EXISTS vanacamp_votes_session_day_idx
  ON public.vanacamp_votes (session_id, day_number, vote_type);

-- Chat messages (lobby / infiltrators / day / dead)
CREATE TABLE IF NOT EXISTS public.vanacamp_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES public.vanacamp_sessions(id) ON DELETE CASCADE NOT NULL,
  channel text NOT NULL CHECK (channel IN ('lobby', 'infiltrators', 'day', 'dead')),
  sender_player_id uuid REFERENCES public.vanacamp_players(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vanacamp_messages_session_channel_idx
  ON public.vanacamp_messages (session_id, channel, created_at);

-- Event log (timeline / narrative)
CREATE TABLE IF NOT EXISTS public.vanacamp_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES public.vanacamp_sessions(id) ON DELETE CASCADE NOT NULL,
  day_number integer NOT NULL DEFAULT 0,
  event_type text NOT NULL,                        -- 'phase_change'|'death'|'save'|'reveal'|'win'|'mayor_elected'|...
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vanacamp_events_session_idx
  ON public.vanacamp_events (session_id, created_at);

-- ============================================
-- HELPER FUNCTIONS (SECURITY DEFINER)
-- ============================================

-- Returns the role of the current auth.uid() within a given session, or NULL.
-- Used by clients to safely fetch their own role without exposing the column.
CREATE OR REPLACE FUNCTION public.vanacamp_get_my_role(p_session_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role
  FROM public.vanacamp_players
  WHERE session_id = p_session_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

-- Returns true if the current user is the host OR an infiltrator (alive) in this session.
-- Used to authorize the "infiltrators chat" channel + reveal of fellow infiltrators.
CREATE OR REPLACE FUNCTION public.vanacamp_is_infiltrator(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vanacamp_players
    WHERE session_id = p_session_id
      AND user_id = auth.uid()
      AND role = 'infiltrator'
      AND is_alive = true
  );
$$;

-- Returns true if current user is the host of the given session.
CREATE OR REPLACE FUNCTION public.vanacamp_is_host(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vanacamp_sessions
    WHERE id = p_session_id AND host_id = auth.uid()
  );
$$;

-- Returns true if current user is a (dead) player in this session.
CREATE OR REPLACE FUNCTION public.vanacamp_is_dead_player(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vanacamp_players
    WHERE session_id = p_session_id
      AND user_id = auth.uid()
      AND is_alive = false
  );
$$;

-- ============================================
-- PUBLIC VIEW (NO ROLE LEAK)
-- ============================================

-- Players view without the `role` column — safe to publish via realtime.
CREATE OR REPLACE VIEW public.vanacamp_players_public AS
  SELECT
    id,
    session_id,
    user_id,
    display_name,
    is_mayor,
    is_alive,
    eliminated_on_day,
    eliminated_by,
    joined_at
  FROM public.vanacamp_players;

GRANT SELECT ON public.vanacamp_players_public TO anon, authenticated;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.vanacamp_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanacamp_players        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanacamp_night_actions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanacamp_votes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanacamp_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanacamp_events         ENABLE ROW LEVEL SECURITY;

-- ---------- sessions ----------
-- Any authenticated member can SELECT sessions (lobby browser).
CREATE POLICY "vanacamp_sessions_select" ON public.vanacamp_sessions
  FOR SELECT TO authenticated USING (true);

-- Only dirigente/coordenador can create sessions, and must be themselves the host.
CREATE POLICY "vanacamp_sessions_insert" ON public.vanacamp_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    host_id = auth.uid()
    AND public.get_my_role() IN ('dirigente', 'coordenador')
  );

-- Only the host (or a coordenador) can update/delete the session.
CREATE POLICY "vanacamp_sessions_update" ON public.vanacamp_sessions
  FOR UPDATE TO authenticated
  USING (host_id = auth.uid() OR public.get_my_role() = 'coordenador');

CREATE POLICY "vanacamp_sessions_delete" ON public.vanacamp_sessions
  FOR DELETE TO authenticated
  USING (host_id = auth.uid() OR public.get_my_role() = 'coordenador');

-- ---------- players ----------
-- IMPORTANT: clients should query `vanacamp_players_public` (no `role`).
-- Direct SELECT on `vanacamp_players` is restricted to: the player themself,
-- the host, infiltrators (to see fellow infiltrators), and dead players
-- (post-game reveal). Server actions and SECURITY DEFINER funcs bypass this.
CREATE POLICY "vanacamp_players_select_self_or_host" ON public.vanacamp_players
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.vanacamp_is_host(session_id)
    OR public.vanacamp_is_infiltrator(session_id)
    OR public.vanacamp_is_dead_player(session_id)
  );

-- Players insert themselves when joining (role NULL at join time).
CREATE POLICY "vanacamp_players_insert_self" ON public.vanacamp_players
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND role IS NULL);

-- Updates restricted to host (role assignment, death) or coordenador.
CREATE POLICY "vanacamp_players_update_host" ON public.vanacamp_players
  FOR UPDATE TO authenticated
  USING (
    public.vanacamp_is_host(session_id)
    OR public.get_my_role() = 'coordenador'
  );

-- Players can leave themselves before the game starts (handled by server action).
CREATE POLICY "vanacamp_players_delete_self_or_host" ON public.vanacamp_players
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.vanacamp_is_host(session_id)
    OR public.get_my_role() = 'coordenador'
  );

-- ---------- night_actions ----------
-- An actor can SELECT only their own actions. Host can SELECT everything after the phase ends.
-- For safety we keep it strict; the host UI uses a server action with service role to read results.
CREATE POLICY "vanacamp_night_actions_select_own" ON public.vanacamp_night_actions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vanacamp_players p
      WHERE p.id = actor_player_id AND p.user_id = auth.uid()
    )
    OR public.vanacamp_is_host(session_id)
  );

-- Insert only the actor themself (server actions also validate role/phase).
CREATE POLICY "vanacamp_night_actions_insert_own" ON public.vanacamp_night_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vanacamp_players p
      WHERE p.id = actor_player_id AND p.user_id = auth.uid() AND p.is_alive = true
    )
  );

-- ---------- votes ----------
CREATE POLICY "vanacamp_votes_select_all_in_session" ON public.vanacamp_votes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vanacamp_players p
      WHERE p.session_id = vanacamp_votes.session_id AND p.user_id = auth.uid()
    )
    OR public.vanacamp_is_host(session_id)
  );

CREATE POLICY "vanacamp_votes_insert_own" ON public.vanacamp_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vanacamp_players p
      WHERE p.id = voter_player_id AND p.user_id = auth.uid() AND p.is_alive = true
    )
  );

-- ---------- messages ----------
-- Channel access:
--   'lobby' / 'day' → any player in the session
--   'infiltrators'  → only alive infiltrators (+ host for moderation)
--   'dead'          → only dead players (+ host)
CREATE POLICY "vanacamp_messages_select_by_channel" ON public.vanacamp_messages
  FOR SELECT TO authenticated
  USING (
    (
      channel IN ('lobby', 'day')
      AND EXISTS (
        SELECT 1 FROM public.vanacamp_players p
        WHERE p.session_id = vanacamp_messages.session_id AND p.user_id = auth.uid()
      )
    )
    OR (channel = 'infiltrators' AND public.vanacamp_is_infiltrator(session_id))
    OR (channel = 'dead' AND public.vanacamp_is_dead_player(session_id))
    OR public.vanacamp_is_host(session_id)
  );

CREATE POLICY "vanacamp_messages_insert_own" ON public.vanacamp_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vanacamp_players p
      WHERE p.id = sender_player_id AND p.user_id = auth.uid()
    )
    AND (
      channel IN ('lobby', 'day')
      OR (channel = 'infiltrators' AND public.vanacamp_is_infiltrator(session_id))
      OR (channel = 'dead' AND public.vanacamp_is_dead_player(session_id))
    )
  );

-- ---------- events ----------
-- Public timeline within session.
CREATE POLICY "vanacamp_events_select" ON public.vanacamp_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vanacamp_players p
      WHERE p.session_id = vanacamp_events.session_id AND p.user_id = auth.uid()
    )
    OR public.vanacamp_is_host(session_id)
  );

-- Inserts via server actions (service role bypasses RLS); restrict client inserts to host.
CREATE POLICY "vanacamp_events_insert_host" ON public.vanacamp_events
  FOR INSERT TO authenticated
  WITH CHECK (public.vanacamp_is_host(session_id));

-- ============================================
-- REALTIME PUBLICATIONS
-- IMPORTANT: do NOT publish `vanacamp_players` (it contains `role`).
-- Instead clients subscribe to changes via `vanacamp_events` and re-fetch
-- the public view `vanacamp_players_public` on relevant events.
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.vanacamp_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vanacamp_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vanacamp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vanacamp_votes;
-- Intentionally NOT publishing vanacamp_players or vanacamp_night_actions.
