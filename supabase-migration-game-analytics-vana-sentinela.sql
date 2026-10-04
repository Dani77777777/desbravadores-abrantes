-- ============================================
-- MIGRAÇÃO: VanaSentinela na analítica dos jogos a solo (Gestão → Jogos)
-- ============================================
-- Cada ronda acabada de um MEMBRO passa a contar em `game_plays`:
--   • uma linha por membro + pack + dia (o pack faz de "modo");
--   • attempts = rondas jogadas nesse dia;
--   • is_won = pelo menos uma ronda com 11 ou mais certas em 15.
-- As rondas dos convidados sem conta não entram aqui (o painel conta-as à parte).
--
-- Requer: supabase-setup-game-analytics.sql e supabase-setup-vana-sentinela.sql.
-- Corre no SQL Editor do Supabase. É idempotente.
-- ============================================

-- 1. Aceitar o novo jogo
ALTER TABLE public.game_plays DROP CONSTRAINT IF EXISTS game_plays_game_id_check;
ALTER TABLE public.game_plays ADD CONSTRAINT game_plays_game_id_check
  CHECK (game_id IN ('vantur', 'vana-codigo', 'vana-trilha', 'vana-sentinela'));

-- 2. Trigger nas pontuações. Um erro aqui nunca impede de gravar a ronda.
CREATE OR REPLACE FUNCTION public.log_vana_sentinela_play()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW; -- convidado sem conta
  END IF;
  BEGIN
    INSERT INTO public.game_plays AS gp
      (game_id, user_id, mode, play_date, started_at, last_activity_at, finished_at, is_finished, is_won, attempts)
    VALUES (
      'vana-sentinela', NEW.user_id, NEW.pack, (NEW.created_at AT TIME ZONE 'Europe/Lisbon')::date,
      NEW.created_at - make_interval(secs => NEW.duration_ms / 1000.0), NEW.created_at, NEW.created_at,
      true, NEW.correct >= 11, 1
    )
    ON CONFLICT (game_id, user_id, mode, play_date) DO UPDATE SET
      last_activity_at = EXCLUDED.last_activity_at,
      finished_at = EXCLUDED.finished_at,
      is_won = gp.is_won OR EXCLUDED.is_won,
      attempts = COALESCE(gp.attempts, 0) + 1;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'log_vana_sentinela_play: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_game_plays_vana_sentinela ON public.vana_sentinela_scores;
CREATE TRIGGER trg_game_plays_vana_sentinela
  AFTER INSERT ON public.vana_sentinela_scores
  FOR EACH ROW EXECUTE FUNCTION public.log_vana_sentinela_play();

-- 3. Preenchimento inicial com as rondas que já existem
INSERT INTO public.game_plays
  (game_id, user_id, mode, play_date, started_at, last_activity_at, finished_at, is_finished, is_won, attempts)
SELECT 'vana-sentinela', s.user_id, s.pack, x.d,
  min(s.created_at), max(s.created_at), max(s.created_at),
  true, bool_or(s.correct >= 11), count(*)::int
FROM public.vana_sentinela_scores s
CROSS JOIN LATERAL (SELECT (s.created_at AT TIME ZONE 'Europe/Lisbon')::date AS d) x
WHERE s.user_id IS NOT NULL
GROUP BY s.user_id, s.pack, x.d
ON CONFLICT (game_id, user_id, mode, play_date) DO NOTHING;

-- Confirmação
SELECT mode, count(*) AS dias_jogador, sum(attempts) AS rondas
FROM public.game_plays
WHERE game_id = 'vana-sentinela'
GROUP BY mode;
