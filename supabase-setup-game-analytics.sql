-- ============================================
-- ANALÍTICA DOS JOGOS SINGLEPLAYER (VANTUR, VanaTrilha, VanaCódigo)
-- ============================================
-- O VANTUR e o VanaCódigo guardam só a ÚLTIMA sessão de cada modo (o upsert do dia
-- seguinte substitui a anterior), por isso não há histórico para analisar.
-- Esta tabela regista cada partida (uma linha por jogo + jogador + modo + dia),
-- preenchida por triggers nas tabelas dos jogos — o código dos jogos não muda.
--
-- • game_plays: só leitura para a liderança (coordenação vê tudo, dirigente vê a sua classe).
-- • Os triggers nunca deixam um erro aqui estragar o jogo (EXCEPTION → WARNING).
-- • No fim há um preenchimento inicial com o que já existe (corridas da VanaTrilha,
--   sessões atuais e vitórias dos últimos 14 dias registadas nos pontos).
--
-- Corre este ficheiro inteiro no SQL Editor do Supabase. É idempotente.
-- ============================================

CREATE TABLE IF NOT EXISTS public.game_plays (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id text NOT NULL CHECK (game_id IN ('vantur', 'vana-codigo', 'vana-trilha')),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode text NOT NULL,
  play_date date NOT NULL,                 -- dia do clube (Europe/Lisbon) em que a partida começou
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  is_finished boolean NOT NULL DEFAULT false,
  is_won boolean NOT NULL DEFAULT false,
  attempts integer,                        -- tentativas/respostas (null nas linhas recuperadas dos pontos)
  UNIQUE (game_id, user_id, mode, play_date)
);

CREATE INDEX IF NOT EXISTS game_plays_date_idx ON public.game_plays (play_date);

ALTER TABLE public.game_plays ENABLE ROW LEVEL SECURITY;

-- Mesma regra das presenças: coordenação vê tudo, dirigente vê a sua classe.
DROP POLICY IF EXISTS "game_plays_select" ON public.game_plays;
CREATE POLICY "game_plays_select" ON public.game_plays FOR SELECT USING (
  public.get_my_role() = 'coordenador'
  OR (
    public.get_my_role() = 'dirigente'
    AND (SELECT section::text FROM public.profiles WHERE id = user_id) = public.get_my_leadership_section()
  )
);
-- Sem policies de escrita: só os triggers (SECURITY DEFINER) escrevem.


-- Trigger genérico. TG_ARGV[0] = id do jogo. Lê a linha como jsonb para servir as
-- três tabelas (e não depender dos tipos exatos das colunas do VANTUR).
CREATE OR REPLACE FUNCTION public.log_singleplayer_play()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j jsonb := to_jsonb(NEW);
  v_game text := TG_ARGV[0];
  v_today date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_mode text;
  v_attempts integer;
  v_finished boolean;
  v_won boolean;
  v_id uuid;
BEGIN
  BEGIN
    IF v_game = 'vana-trilha' THEN
      v_finished := (j->>'status') IN ('completed', 'failed');
      INSERT INTO public.game_plays AS gp
        (game_id, user_id, mode, play_date, started_at, last_activity_at, finished_at, is_finished, is_won, attempts)
      VALUES (
        v_game, NEW.user_id, 'diario', (j->>'run_date')::date,
        COALESCE((j->>'started_at')::timestamptz, now()), now(),
        CASE WHEN v_finished THEN COALESCE((j->>'finished_at')::timestamptz, now()) END,
        v_finished, (j->>'status') = 'completed', COALESCE((j->>'turn')::int, 0)
      )
      ON CONFLICT (game_id, user_id, mode, play_date) DO UPDATE SET
        last_activity_at = now(),
        finished_at = EXCLUDED.finished_at,
        is_finished = EXCLUDED.is_finished,
        is_won = EXCLUDED.is_won,
        attempts = EXCLUDED.attempts;
      RETURN NEW;
    END IF;

    -- VANTUR / VanaCódigo
    v_mode := j->>'mode';
    v_attempts := COALESCE(jsonb_array_length(j->'attempts'), 0);
    v_finished := COALESCE((j->>'is_finished')::boolean, false);
    v_won := v_finished AND CASE
      WHEN j ? 'is_won' THEN COALESCE((j->>'is_won')::boolean, false)
      ELSE COALESCE(jsonb_array_length(j->'secret_words'), 0) > 0
        AND COALESCE(jsonb_array_length(j->'completed_indices'), 0) >= jsonb_array_length(j->'secret_words')
    END;

    IF v_attempts > 0 THEN
      -- Jogada numa partida em curso: atualiza a partida mais recente (ontem conta, para
      -- quem começa antes da meia-noite e acaba depois).
      SELECT id INTO v_id FROM public.game_plays
      WHERE game_id = v_game AND user_id = NEW.user_id AND mode = v_mode AND play_date >= v_today - 1
      ORDER BY play_date DESC LIMIT 1;
    END IF;

    IF v_id IS NOT NULL THEN
      UPDATE public.game_plays SET
        last_activity_at = now(),
        attempts = v_attempts,
        is_finished = v_finished,
        is_won = v_won,
        finished_at = CASE WHEN v_finished THEN COALESCE(finished_at, now()) END
      WHERE id = v_id;
    ELSE
      -- Partida nova (ou primeira vez que a vemos)
      INSERT INTO public.game_plays AS gp
        (game_id, user_id, mode, play_date, started_at, last_activity_at, finished_at, is_finished, is_won, attempts)
      VALUES (v_game, NEW.user_id, v_mode, v_today, now(), now(),
        CASE WHEN v_finished THEN now() END, v_finished, v_won, v_attempts)
      ON CONFLICT (game_id, user_id, mode, play_date) DO UPDATE SET
        last_activity_at = now(),
        attempts = GREATEST(COALESCE(gp.attempts, 0), EXCLUDED.attempts),
        is_finished = gp.is_finished OR EXCLUDED.is_finished,
        is_won = gp.is_won OR EXCLUDED.is_won,
        finished_at = COALESCE(gp.finished_at, EXCLUDED.finished_at);
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'log_singleplayer_play(%): %', v_game, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_game_plays_vantur ON public.vantur_sessions;
CREATE TRIGGER trg_game_plays_vantur
  AFTER INSERT OR UPDATE ON public.vantur_sessions
  FOR EACH ROW EXECUTE FUNCTION public.log_singleplayer_play('vantur');

DROP TRIGGER IF EXISTS trg_game_plays_vana_codigo ON public.vana_codigo_sessions;
CREATE TRIGGER trg_game_plays_vana_codigo
  AFTER INSERT OR UPDATE ON public.vana_codigo_sessions
  FOR EACH ROW EXECUTE FUNCTION public.log_singleplayer_play('vana-codigo');

DROP TRIGGER IF EXISTS trg_game_plays_vana_trilha ON public.vanatrilha_daily_runs;
CREATE TRIGGER trg_game_plays_vana_trilha
  AFTER INSERT OR UPDATE ON public.vanatrilha_daily_runs
  FOR EACH ROW EXECUTE FUNCTION public.log_singleplayer_play('vana-trilha');


-- ── Preenchimento inicial ─────────────────────────────────────────────────────

-- 1. VanaTrilha: as corridas já têm histórico completo
INSERT INTO public.game_plays
  (game_id, user_id, mode, play_date, started_at, last_activity_at, finished_at, is_finished, is_won, attempts)
SELECT 'vana-trilha', r.user_id, 'diario', r.run_date, r.started_at, COALESCE(r.finished_at, r.started_at),
  r.finished_at, r.status IN ('completed', 'failed'), r.status = 'completed', r.turn
FROM public.vanatrilha_daily_runs r
WHERE r.run_date >= (now() AT TIME ZONE 'Europe/Lisbon')::date - 30
ON CONFLICT (game_id, user_id, mode, play_date) DO NOTHING;

-- 2. VANTUR e VanaCódigo: a sessão atual de cada jogador/modo
INSERT INTO public.game_plays
  (game_id, user_id, mode, play_date, started_at, last_activity_at, finished_at, is_finished, is_won, attempts)
SELECT 'vantur', s.user_id, j->>'mode', (s.updated_at AT TIME ZONE 'Europe/Lisbon')::date, s.updated_at, s.updated_at,
  CASE WHEN (j->>'is_finished')::boolean THEN s.updated_at END,
  COALESCE((j->>'is_finished')::boolean, false),
  COALESCE((j->>'is_finished')::boolean, false)
    AND COALESCE(jsonb_array_length(j->'secret_words'), 0) > 0
    AND COALESCE(jsonb_array_length(j->'completed_indices'), 0) >= jsonb_array_length(j->'secret_words'),
  COALESCE(jsonb_array_length(j->'attempts'), 0)
FROM public.vantur_sessions s, LATERAL (SELECT to_jsonb(s) AS j) x
WHERE s.updated_at >= now() - interval '30 days'
ON CONFLICT (game_id, user_id, mode, play_date) DO NOTHING;

INSERT INTO public.game_plays
  (game_id, user_id, mode, play_date, started_at, last_activity_at, finished_at, is_finished, is_won, attempts)
SELECT 'vana-codigo', s.user_id, s.mode, (s.updated_at AT TIME ZONE 'Europe/Lisbon')::date, s.updated_at, s.updated_at,
  CASE WHEN s.is_finished THEN s.updated_at END, s.is_finished, s.is_finished AND s.is_won,
  COALESCE(array_length(s.attempts, 1), 0)
FROM public.vana_codigo_sessions s
WHERE s.updated_at >= now() - interval '30 days'
ON CONFLICT (game_id, user_id, mode, play_date) DO NOTHING;

-- 3. Vitórias dos últimos 14 dias que ficaram nos pontos (as sessões já foram substituídas)
INSERT INTO public.game_plays
  (game_id, user_id, mode, play_date, started_at, last_activity_at, finished_at, is_finished, is_won, attempts)
SELECT g.game_id, pl.target_user_id, g.mode, (pl.created_at AT TIME ZONE 'Europe/Lisbon')::date,
  pl.created_at, pl.created_at, pl.created_at, true, true, NULL
FROM public.points_log pl
CROSS JOIN LATERAL (
  SELECT
    CASE WHEN pl.description ILIKE 'Vantur%' THEN 'vantur' ELSE 'vana-codigo' END AS game_id,
    CASE
      WHEN pl.description ILIKE 'Vantur%' THEN
        CASE WHEN pl.description ILIKE '%plex%' THEN 'plex'
             WHEN pl.description ILIKE '%mix%' THEN 'mix'
             WHEN pl.description ILIKE '%solo%' THEN 'solo' END
      ELSE lower(substring(pl.description FROM '\(([^)]+)\)'))
    END AS mode
) g
WHERE pl.created_at >= now() - interval '14 days'
  AND (pl.description ILIKE 'Vantur%' OR pl.description ILIKE 'VanaCódigo%')
  AND g.mode IN ('solo', 'mix', 'plex', 'recruta', 'explorador', 'mestre')
ON CONFLICT (game_id, user_id, mode, play_date) DO NOTHING;
