-- ============================================================
-- VanaSketch — jogo estilo Pictionary/Gartic
-- Um jogador desenha no telemóvel, o desenho aparece no projetor
-- em tempo real, os restantes escrevem palpites. Palavras do
-- dicionário bíblico do Vantur (vantur_dictionary).
-- ============================================================

-- ── Sessões ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vanasketch_sessions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id           uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code              text        NOT NULL UNIQUE,
  status            text        NOT NULL DEFAULT 'lobby'
    CHECK (status IN ('lobby','playing','finished')),
  -- Fase dentro de uma ronda (apenas quando status = 'playing')
  phase             text        CHECK (phase IN ('choosing','drawing','round_end')),
  round_number      int         NOT NULL DEFAULT 0,
  total_rounds      int         NOT NULL DEFAULT 0,
  rounds_per_player int         NOT NULL DEFAULT 1 CHECK (rounds_per_player BETWEEN 1 AND 3),
  draw_seconds      int         NOT NULL DEFAULT 90 CHECK (draw_seconds BETWEEN 30 AND 300),
  -- Estado público da ronda actual (a palavra em si fica em vanasketch_rounds)
  drawer_player_id  uuid,
  word_masked       text,       -- ex.: "_ _ _ _" (só comprimento, sem letras)
  revealed_word     text,       -- preenchida quando phase = 'round_end'
  round_ends_at     timestamptz,
  -- Versão do quadro: incrementa em limpezas/mudança de ronda para forçar refetch
  canvas_version    int         NOT NULL DEFAULT 0,
  rewards_awarded   boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  ended_at          timestamptz
);

-- ── Jogadores ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vanasketch_players (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid        NOT NULL REFERENCES public.vanasketch_sessions(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_name text        NOT NULL,
  avatar_url   text,
  section      text,
  score        int         NOT NULL DEFAULT 0,
  -- Posição na rotação de desenhadores (null = entrou a meio, só palpita)
  draw_order   int,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);

ALTER TABLE public.vanasketch_sessions
  ADD CONSTRAINT vanasketch_sessions_drawer_fk
  FOREIGN KEY (drawer_player_id) REFERENCES public.vanasketch_players(id) ON DELETE SET NULL;

-- ── Rondas (a palavra secreta vive aqui — nunca é lida directamente) ──
CREATE TABLE IF NOT EXISTS public.vanasketch_rounds (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid        NOT NULL REFERENCES public.vanasketch_sessions(id) ON DELETE CASCADE,
  round_number     int         NOT NULL,
  drawer_player_id uuid        NOT NULL REFERENCES public.vanasketch_players(id) ON DELETE CASCADE,
  word_options     jsonb       NOT NULL DEFAULT '[]',  -- 3 opções propostas ao desenhador
  word             text,                               -- escolhida (secreta até round_end)
  end_reason       text        CHECK (end_reason IN ('all_guessed','timeout','skipped')),
  started_at       timestamptz,
  ended_at         timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, round_number)
);

-- ── Traços do desenho (persistência p/ recuperação; o live vai por broadcast) ──
CREATE TABLE IF NOT EXISTS public.vanasketch_strokes (
  id           uuid        PRIMARY KEY,               -- gerado no cliente (dedupe com broadcast)
  session_id   uuid        NOT NULL REFERENCES public.vanasketch_sessions(id) ON DELETE CASCADE,
  round_number int         NOT NULL,
  seq          int         NOT NULL DEFAULT 0,
  color        text        NOT NULL DEFAULT '#1a1a2e',
  size         int         NOT NULL DEFAULT 4,
  -- pontos normalizados 0..1: [[x,y],[x,y],...]
  points       jsonb       NOT NULL DEFAULT '[]',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vanasketch_strokes_session_round
  ON public.vanasketch_strokes (session_id, round_number, seq);

-- ── Palpites ─────────────────────────────────────────────────
-- Para palpites certos, guess_text fica NULL (não revelar a palavra no feed).
CREATE TABLE IF NOT EXISTS public.vanasketch_guesses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid        NOT NULL REFERENCES public.vanasketch_sessions(id) ON DELETE CASCADE,
  round_number int         NOT NULL,
  player_id    uuid        NOT NULL REFERENCES public.vanasketch_players(id) ON DELETE CASCADE,
  guess_text   text,
  is_correct   boolean     NOT NULL DEFAULT false,
  points       int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vanasketch_guesses_session_round
  ON public.vanasketch_guesses (session_id, round_number, created_at);

-- ── RPC: informação do desenhador (opções + palavra escolhida) ──
-- Só o desenhador da ronda actual e o host podem ver a palavra.
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
    SELECT r.round_number, r.word_options, r.word
    FROM public.vanasketch_rounds r
    JOIN public.vanasketch_sessions s ON s.id = r.session_id
    WHERE r.session_id = p_session_id AND r.round_number = s.round_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vanasketch_drawer_info(uuid) TO authenticated;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.vanasketch_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanasketch_players  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanasketch_rounds   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanasketch_strokes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanasketch_guesses  ENABLE ROW LEVEL SECURITY;

-- Sessões: leitura pública (o projetor não tem login), escrita só do host
CREATE POLICY "vs_sessions_read"   ON public.vanasketch_sessions FOR SELECT USING (true);
CREATE POLICY "vs_sessions_insert" ON public.vanasketch_sessions FOR INSERT TO authenticated WITH CHECK (host_id = auth.uid());
CREATE POLICY "vs_sessions_update" ON public.vanasketch_sessions FOR UPDATE TO authenticated USING (host_id = auth.uid());

-- Jogadores: leitura pública (projetor mostra placar)
CREATE POLICY "vs_players_read"   ON public.vanasketch_players FOR SELECT USING (true);
CREATE POLICY "vs_players_insert" ON public.vanasketch_players FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.vanasketch_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
);
CREATE POLICY "vs_players_update" ON public.vanasketch_players FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.vanasketch_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
);
CREATE POLICY "vs_players_delete" ON public.vanasketch_players FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.vanasketch_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
);

-- Rondas: contêm a palavra secreta — só o host lê directamente.
-- O desenhador usa a RPC get_vanasketch_drawer_info.
CREATE POLICY "vs_rounds_host_read" ON public.vanasketch_rounds FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.vanasketch_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
);

-- Traços: leitura pública (o desenho é para todos verem).
-- Escrita apenas do desenhador da ronda actual (ou host).
CREATE POLICY "vs_strokes_read" ON public.vanasketch_strokes FOR SELECT USING (true);
CREATE POLICY "vs_strokes_insert" ON public.vanasketch_strokes FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.vanasketch_sessions s
    JOIN public.vanasketch_players p ON p.id = s.drawer_player_id
    WHERE s.id = session_id AND s.status = 'playing' AND p.user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.vanasketch_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
);
CREATE POLICY "vs_strokes_delete" ON public.vanasketch_strokes FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.vanasketch_sessions s
    JOIN public.vanasketch_players p ON p.id = s.drawer_player_id
    WHERE s.id = session_id AND p.user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.vanasketch_sessions s WHERE s.id = session_id AND s.host_id = auth.uid())
);

-- Palpites: leitura pública (feed no projetor); inserção só via server action
-- (service role) para validar e pontuar — sem policy de INSERT para users.
CREATE POLICY "vs_guesses_read" ON public.vanasketch_guesses FOR SELECT USING (true);

-- ── Realtime ─────────────────────────────────────────────────
-- vanasketch_rounds NÃO entra — contém a palavra secreta.
ALTER PUBLICATION supabase_realtime ADD TABLE public.vanasketch_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vanasketch_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vanasketch_guesses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vanasketch_strokes;

-- DELETEs precisam de todos os campos para os filtros realtime funcionarem
ALTER TABLE public.vanasketch_players REPLICA IDENTITY FULL;
ALTER TABLE public.vanasketch_strokes REPLICA IDENTITY FULL;
ALTER TABLE public.vanasketch_guesses REPLICA IDENTITY FULL;
