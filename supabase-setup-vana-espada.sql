-- ============================================
-- VANAESPADA: A ESPADA DO ESPIRITO
-- Jogo biblico ao vivo (projetor + telemoveis), com convidados.
-- Correr DEPOIS de supabase-setup.sql e supabase-migration-helpers.sql.
--
-- Tudo idempotente: pode voltar a correr-se sem estragar nada.
--
-- Fase 1 entrega o Modo A ("Onde Esta?"). As tabelas e colunas do Modo B
-- ("Saca a Espada!") ja vao aqui de proposito, para nao ser preciso migrar depois.
-- ============================================

-- ============================================
-- BANCO DE VERSICULOS
-- ============================================

CREATE TABLE IF NOT EXISTS public.vanaespada_verses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id smallint NOT NULL CHECK (book_id BETWEEN 1 AND 66),
  chapter smallint NOT NULL CHECK (chapter >= 1),
  verse_start smallint NOT NULL CHECK (verse_start >= 1),
  verse_end smallint NOT NULL,
  excerpt text,                      -- necessario para o Modo A; NULL = so serve para o Modo B
  translation text,                  -- ex.: 'Almeida' (mostrado no projetor)
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  tags text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vanaespada_verse_range CHECK (verse_end >= verse_start)
);

CREATE INDEX IF NOT EXISTS vanaespada_verses_active_idx
  ON public.vanaespada_verses (active, difficulty);

-- Perguntas de verificacao do Modo B (0..n por versiculo). Fase 2.
CREATE TABLE IF NOT EXISTS public.vanaespada_drill_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verse_id uuid NOT NULL REFERENCES public.vanaespada_verses(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  options text[] NOT NULL CHECK (cardinality(options) = 4),
  correct_index smallint NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vanaespada_drill_prompts_verse_idx
  ON public.vanaespada_drill_prompts (verse_id);

-- ============================================
-- BARALHOS (Fase 2)
-- ============================================

CREATE TABLE IF NOT EXISTS public.vanaespada_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vanaespada_deck_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES public.vanaespada_decks(id) ON DELETE CASCADE,
  position integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('locate','drill')),
  verse_id uuid NOT NULL REFERENCES public.vanaespada_verses(id) ON DELETE CASCADE,
  prompt_id uuid REFERENCES public.vanaespada_drill_prompts(id) ON DELETE CASCADE,
  time_seconds integer,              -- NULL = default do modo (30 / 60)
  CONSTRAINT vanaespada_drill_needs_prompt CHECK (kind <> 'drill' OR prompt_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS vanaespada_deck_rounds_deck_idx
  ON public.vanaespada_deck_rounds (deck_id, position);

-- ============================================
-- SESSOES
-- ============================================

CREATE TABLE IF NOT EXISTS public.vanaespada_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deck_id uuid REFERENCES public.vanaespada_decks(id) ON DELETE SET NULL,
  pin text NOT NULL,
  status text NOT NULL DEFAULT 'lobby'
    CHECK (status IN ('lobby','round_ready','round_active','round_reveal','leaderboard','finished')),
  current_round integer NOT NULL DEFAULT -1,
  total_rounds integer NOT NULL DEFAULT 0,
  current_kind text CHECK (current_kind IN ('locate','drill')),
  phase_started_at timestamptz,
  phase_ends_at timestamptz,         -- fonte de verdade dos timers
  answered_count integer NOT NULL DEFAULT 0,
  found_count integer NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{"physical_bible_only": true}'::jsonb,
  points_awarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

-- PIN unico so entre sessoes que ainda nao acabaram.
CREATE UNIQUE INDEX IF NOT EXISTS vanaespada_sessions_pin_live
  ON public.vanaespada_sessions (pin) WHERE status <> 'finished';

CREATE INDEX IF NOT EXISTS vanaespada_sessions_host_idx
  ON public.vanaespada_sessions (host_id, created_at DESC);

-- SNAPSHOT das rondas. CONTEM A RESPOSTA -> nunca publicar em realtime, nunca
-- deixar o cliente fazer SELECT direto. Editar o banco a meio de uma sessao
-- nao afeta a sessao em curso.
CREATE TABLE IF NOT EXISTS public.vanaespada_session_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.vanaespada_sessions(id) ON DELETE CASCADE,
  round_index integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('locate','drill')),
  verse_id uuid REFERENCES public.vanaespada_verses(id) ON DELETE SET NULL,
  book_id smallint NOT NULL,
  chapter smallint NOT NULL,
  verse_start smallint NOT NULL,
  verse_end smallint NOT NULL,
  excerpt text,
  translation text,
  prompt text,
  options text[],
  correct_index smallint,
  time_seconds integer NOT NULL,
  started_at timestamptz,
  closed_at timestamptz,
  UNIQUE (session_id, round_index)
);

CREATE TABLE IF NOT EXISTS public.vanaespada_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.vanaespada_sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_guest boolean NOT NULL DEFAULT false,
  display_name text NOT NULL,
  avatar_url text,
  total_points integer NOT NULL DEFAULT 0,
  last_round_points integer,
  rewards_recipient_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rewards_skipped boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vanaespada_players_session_idx
  ON public.vanaespada_players (session_id);

-- NAO publicar em realtime: os palpites dos outros nao podem vazar durante a ronda.
CREATE TABLE IF NOT EXISTS public.vanaespada_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.vanaespada_sessions(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.vanaespada_session_rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.vanaespada_players(id) ON DELETE CASCADE,
  -- Modo A
  guess_book smallint,
  guess_chapter smallint,
  guess_verse smallint,
  -- Modo B (Fase 2)
  found_at timestamptz,
  chosen_index smallint,
  -- Comum
  elapsed_ms integer,                -- CALCULADO NO SERVIDOR
  is_correct boolean,
  points integer NOT NULL DEFAULT 0,
  breakdown jsonb,
  answered_at timestamptz,
  UNIQUE (round_id, player_id)
);

CREATE INDEX IF NOT EXISTS vanaespada_answers_session_idx
  ON public.vanaespada_answers (session_id);

-- ============================================
-- FUNCOES DE ESTADO (SECURITY DEFINER, atomicas)
--
-- Todas as transicoes sao CONDICIONAIS e IDEMPOTENTES: o projetor, o painel do
-- anfitriao e o "ja responderam todos" podem pedir a mesma transicao ao mesmo
-- tempo. Ganha a primeira; as outras devolvem false e nao fazem nada.
-- ============================================

-- lobby -> round_ready (ronda 0). Tambem serve para leaderboard -> round_ready.
CREATE OR REPLACE FUNCTION public.vanaespada_open_round(
  p_session_id uuid,
  p_round_index integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text;
BEGIN
  SELECT kind INTO v_kind
  FROM public.vanaespada_session_rounds
  WHERE session_id = p_session_id AND round_index = p_round_index;

  IF v_kind IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.vanaespada_sessions
  SET status = 'round_ready',
      current_round = p_round_index,
      current_kind = v_kind,
      phase_started_at = now(),
      -- No Modo A o "Ronda 3/10" so precisa de 2 s; o Modo B tem o ritual do
      -- "Atencao!" + referencia, que leva 7 s.
      phase_ends_at = now() + (CASE WHEN v_kind = 'drill' THEN interval '7 seconds'
                                    ELSE interval '2 seconds' END),
      answered_count = 0,
      found_count = 0
  WHERE id = p_session_id
    AND status IN ('lobby', 'leaderboard')
    -- Idempotencia: abrir duas vezes a mesma ronda nao faz nada da segunda vez.
    AND current_round < p_round_index;

  RETURN FOUND;
END;
$$;

-- round_ready -> round_active. Arranca o cronometro do lado do servidor.
CREATE OR REPLACE FUNCTION public.vanaespada_begin_round(
  p_session_id uuid,
  p_round_index integer,
  p_force boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seconds integer;
BEGIN
  SELECT time_seconds INTO v_seconds
  FROM public.vanaespada_session_rounds
  WHERE session_id = p_session_id AND round_index = p_round_index;

  IF v_seconds IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.vanaespada_sessions
  SET status = 'round_active',
      phase_started_at = now(),
      phase_ends_at = now() + make_interval(secs => v_seconds),
      answered_count = 0,
      found_count = 0
  WHERE id = p_session_id
    AND status = 'round_ready'
    AND current_round = p_round_index
    -- 1 s de tolerancia: o aviso "Ronda X/Y" e so um compasso de espera, comecar
    -- um instante antes nao se nota e evita ficar a espera de um cliente com o
    -- relogio ligeiramente adiantado.
    AND (p_force OR phase_ends_at IS NULL OR now() >= phase_ends_at - interval '1 second');

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- started_at e a referencia anti-batota: o elapsed_ms e sempre now() - started_at.
  UPDATE public.vanaespada_session_rounds
  SET started_at = now()
  WHERE session_id = p_session_id AND round_index = p_round_index;

  RETURN true;
END;
$$;

-- round_active -> round_reveal. Fecha a ronda e consolida os pontos, tudo na
-- mesma transacao, para nunca haver um ecra de revelacao com pontos velhos.
--
-- Sem p_force, so fecha quando o tempo acabou ou quando ja toda a gente
-- respondeu: assim um espetador nao consegue cortar a ronda a meio.
CREATE OR REPLACE FUNCTION public.vanaespada_close_round(
  p_session_id uuid,
  p_round_index integer,
  p_force boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_players integer;
BEGIN
  SELECT count(*) INTO v_players
  FROM public.vanaespada_players
  WHERE session_id = p_session_id;

  UPDATE public.vanaespada_sessions s
  SET status = 'round_reveal',
      phase_started_at = now(),
      phase_ends_at = NULL
  WHERE s.id = p_session_id
    AND s.status = 'round_active'
    AND s.current_round = p_round_index
    AND (
      p_force
      OR s.phase_ends_at IS NULL
      OR now() >= s.phase_ends_at
      OR (v_players > 0 AND s.answered_count >= v_players)
    );

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.vanaespada_session_rounds
  SET closed_at = now()
  WHERE session_id = p_session_id AND round_index = p_round_index AND closed_at IS NULL;

  -- Recalcula a partir das respostas (em vez de somar incrementos): correr isto
  -- duas vezes da sempre o mesmo resultado.
  UPDATE public.vanaespada_players p
  SET total_points = GREATEST(0, (
        SELECT COALESCE(SUM(a.points), 0)
        FROM public.vanaespada_answers a
        WHERE a.player_id = p.id
      )),
      last_round_points = (
        SELECT COALESCE(SUM(a.points), 0)
        FROM public.vanaespada_answers a
        JOIN public.vanaespada_session_rounds r ON r.id = a.round_id
        WHERE a.player_id = p.id
          AND r.session_id = p_session_id
          AND r.round_index = p_round_index
      )
  WHERE p.session_id = p_session_id;

  RETURN true;
END;
$$;

-- round_reveal -> leaderboard.
CREATE OR REPLACE FUNCTION public.vanaespada_show_leaderboard(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.vanaespada_sessions
  SET status = 'leaderboard', phase_started_at = now(), phase_ends_at = NULL
  WHERE id = p_session_id AND status = 'round_reveal';
  RETURN FOUND;
END;
$$;

-- leaderboard/round_reveal -> finished.
CREATE OR REPLACE FUNCTION public.vanaespada_finish_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.vanaespada_sessions
  SET status = 'finished', phase_ends_at = NULL, ended_at = now()
  WHERE id = p_session_id AND status <> 'finished';
  RETURN FOUND;
END;
$$;

-- Recalcula answered_count a partir das respostas (atomico e idempotente) e
-- devolve quantos ja responderam e quantos jogadores ha.
CREATE OR REPLACE FUNCTION public.vanaespada_sync_answered(
  p_session_id uuid,
  p_round_index integer
)
RETURNS TABLE (answered integer, players integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_answered integer;
  v_players integer;
BEGIN
  SELECT count(*) INTO v_answered
  FROM public.vanaespada_answers a
  JOIN public.vanaespada_session_rounds r ON r.id = a.round_id
  WHERE r.session_id = p_session_id
    AND r.round_index = p_round_index
    AND a.answered_at IS NOT NULL;

  SELECT count(*) INTO v_players
  FROM public.vanaespada_players
  WHERE session_id = p_session_id;

  UPDATE public.vanaespada_sessions
  SET answered_count = v_answered
  WHERE id = p_session_id AND current_round = p_round_index;

  answered := v_answered;
  players := v_players;
  RETURN NEXT;
END;
$$;

-- ============================================
-- RPCs PUBLICAS (nunca revelam a resposta cedo)
-- ============================================

-- Ronda atual SEM a resposta enquanto nao for revelada.
CREATE OR REPLACE FUNCTION public.get_vanaespada_round_public(p_session_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'round_index', r.round_index,
    'kind', r.kind,
    'time_seconds', r.time_seconds,
    'excerpt', CASE WHEN r.kind = 'locate' THEN r.excerpt END,
    'translation', r.translation,
    -- No Modo B a referencia e publica desde o round_ready (e o que se procura).
    -- No Modo A so aparece na revelacao.
    'reference', CASE
      WHEN r.kind = 'drill' OR s.status IN ('round_reveal','leaderboard','finished')
      THEN jsonb_build_object(
        'book_id', r.book_id,
        'chapter', r.chapter,
        'verse_start', r.verse_start,
        'verse_end', r.verse_end
      )
    END,
    'prompt', CASE WHEN r.kind = 'drill' THEN r.prompt END,
    'options', CASE WHEN r.kind = 'drill' THEN to_jsonb(r.options) END,
    'correct_index', CASE WHEN s.status IN ('round_reveal','leaderboard','finished') THEN r.correct_index END
  )
  FROM public.vanaespada_sessions s
  JOIN public.vanaespada_session_rounds r
    ON r.session_id = s.id AND r.round_index = s.current_round
  WHERE s.id = p_session_id;
$$;

-- Palpites de toda a gente — SO na revelacao (e o que o projetor usa para os pins).
CREATE OR REPLACE FUNCTION public.get_vanaespada_reveal(p_session_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'player_id', p.id,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'guess_book', a.guess_book,
    'guess_chapter', a.guess_chapter,
    'guess_verse', a.guess_verse,
    'points', a.points,
    'is_correct', a.is_correct,
    'answered_at', a.answered_at,
    'elapsed_ms', a.elapsed_ms
  ) ORDER BY a.points DESC NULLS LAST), '[]'::jsonb)
  FROM public.vanaespada_sessions s
  JOIN public.vanaespada_session_rounds r
    ON r.session_id = s.id AND r.round_index = s.current_round
  JOIN public.vanaespada_answers a ON a.round_id = r.id
  JOIN public.vanaespada_players p ON p.id = a.player_id
  WHERE s.id = p_session_id
    AND s.status IN ('round_reveal','leaderboard','finished');
$$;

-- Respostas da ronda atual PARA O ANFITRIAO, a qualquer momento (e o que faz
-- aparecer no ecra de controlo o que cada um respondeu, como no VanaQuest).
-- Inclui quem ainda nao respondeu, com os campos a NULL.
CREATE OR REPLACE FUNCTION public.get_vanaespada_host_answers(p_session_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'player_id', p.id,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'is_guest', p.is_guest,
    'total_points', p.total_points,
    'guess_book', a.guess_book,
    'guess_chapter', a.guess_chapter,
    'guess_verse', a.guess_verse,
    'points', a.points,
    'is_correct', a.is_correct,
    'answered_at', a.answered_at,
    'elapsed_ms', a.elapsed_ms
  ) ORDER BY a.answered_at ASC NULLS LAST, p.display_name), '[]'::jsonb)
  FROM public.vanaespada_sessions s
  JOIN public.vanaespada_players p ON p.session_id = s.id
  LEFT JOIN public.vanaespada_session_rounds r
    ON r.session_id = s.id AND r.round_index = s.current_round
  LEFT JOIN public.vanaespada_answers a
    ON a.round_id = r.id AND a.player_id = p.id
  WHERE s.id = p_session_id
    AND (s.host_id = auth.uid() OR public.get_my_role() = 'coordenador');
$$;

GRANT EXECUTE ON FUNCTION public.get_vanaespada_round_public(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vanaespada_reveal(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vanaespada_host_answers(uuid) TO authenticated;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.vanaespada_verses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanaespada_drill_prompts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanaespada_decks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanaespada_deck_rounds    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanaespada_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanaespada_session_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanaespada_players        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanaespada_answers        ENABLE ROW LEVEL SECURITY;

-- ---------- banco de versiculos / baralhos: so a lideranca ----------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vanaespada_verses',
    'vanaespada_drill_prompts',
    'vanaespada_decks',
    'vanaespada_deck_rounds'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (public.get_my_role() IN (''dirigente'',''coordenador''))
         WITH CHECK (public.get_my_role() IN (''dirigente'',''coordenador''))',
      t || '_admin_all', t
    );
  END LOOP;
END;
$$;

-- ---------- sessoes e jogadores: leitura publica ----------
-- O projetor e os convidados sem conta precisam de os ler. Nao ha nada de
-- secreto aqui: a resposta vive em vanaespada_session_rounds.
-- A ESCRITA e sempre via service role (server actions).
DROP POLICY IF EXISTS vanaespada_sessions_select ON public.vanaespada_sessions;
CREATE POLICY vanaespada_sessions_select ON public.vanaespada_sessions
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS vanaespada_sessions_delete ON public.vanaespada_sessions;
CREATE POLICY vanaespada_sessions_delete ON public.vanaespada_sessions
  FOR DELETE TO authenticated
  USING (host_id = auth.uid() OR public.get_my_role() = 'coordenador');

DROP POLICY IF EXISTS vanaespada_players_select ON public.vanaespada_players;
CREATE POLICY vanaespada_players_select ON public.vanaespada_players
  FOR SELECT TO anon, authenticated USING (true);

-- ---------- rondas e respostas: SEM leitura para o cliente ----------
-- vanaespada_session_rounds tem a resposta e vanaespada_answers tem os palpites
-- dos outros. Nao ha uma unica politica de SELECT: quem precisa destes dados
-- usa as RPCs SECURITY DEFINER acima (que filtram pelo estado da sessao) ou o
-- service role nas server actions.

-- ============================================
-- REALTIME
-- NUNCA publicar vanaespada_session_rounds nem vanaespada_answers.
-- ============================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.vanaespada_sessions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.vanaespada_players;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- REPLICA IDENTITY FULL: sem isto, os eventos DELETE nao trazem session_id e os
-- filtros do realtime deixam passar remocoes de jogadores.
ALTER TABLE public.vanaespada_players REPLICA IDENTITY FULL;
