-- ============================================
-- MIGRAÇÃO: VanaArca na analítica dos jogos a solo (Gestão → Jogos)
-- ============================================
-- No VanaArca não há "ganhar": conta só quem jogou e a média de pontos.
--   • uma linha por membro + dia (modo 'partida');
--   • attempts     = partidas ACABADAS nesse dia (abandonadas e inválidas não contam);
--   • points_total = soma das pontuações dessas partidas (coluna nova, só o VanaArca a usa);
--   • is_won fica sempre false.
--
-- Requer: supabase-setup-game-analytics.sql (e a migração do VanaSentinela, se a
--         correste: a restrição abaixo já inclui os dois) e supabase-setup-vana-arca.sql.
-- Corre no SQL Editor do Supabase. É idempotente.
-- ============================================

-- 1. Aceitar o novo jogo e guardar a soma dos pontos
ALTER TABLE public.game_plays DROP CONSTRAINT IF EXISTS game_plays_game_id_check;
ALTER TABLE public.game_plays ADD CONSTRAINT game_plays_game_id_check
  CHECK (game_id IN ('vantur', 'vana-codigo', 'vana-trilha', 'vana-sentinela', 'vana-arca'));

ALTER TABLE public.game_plays ADD COLUMN IF NOT EXISTS points_total integer;

-- 2. Trigger: quando uma partida passa a 'finished'. Um erro aqui nunca impede de
--    gravar a partida.
CREATE OR REPLACE FUNCTION public.log_vana_arca_play()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'finished' OR OLD.status IS NOT DISTINCT FROM 'finished' THEN
    RETURN NEW;
  END IF;
  BEGIN
    INSERT INTO public.game_plays AS gp
      (game_id, user_id, mode, play_date, started_at, last_activity_at, finished_at, is_finished, is_won, attempts, points_total)
    VALUES (
      'vana-arca', NEW.user_id, 'partida', NEW.run_date,
      NEW.started_at, COALESCE(NEW.finished_at, now()), COALESCE(NEW.finished_at, now()),
      true, false, 1, COALESCE(NEW.score, 0)
    )
    ON CONFLICT (game_id, user_id, mode, play_date) DO UPDATE SET
      last_activity_at = EXCLUDED.last_activity_at,
      finished_at = EXCLUDED.finished_at,
      attempts = COALESCE(gp.attempts, 0) + 1,
      points_total = COALESCE(gp.points_total, 0) + EXCLUDED.points_total;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'log_vana_arca_play: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_game_plays_vana_arca ON public.vanaarca_runs;
CREATE TRIGGER trg_game_plays_vana_arca
  AFTER UPDATE OF status ON public.vanaarca_runs
  FOR EACH ROW EXECUTE FUNCTION public.log_vana_arca_play();

-- 3. Preenchimento inicial com as partidas que já existam
INSERT INTO public.game_plays
  (game_id, user_id, mode, play_date, started_at, last_activity_at, finished_at, is_finished, is_won, attempts, points_total)
SELECT 'vana-arca', r.user_id, 'partida', r.run_date,
  min(r.started_at), max(r.finished_at), max(r.finished_at),
  true, false, count(*)::int, COALESCE(sum(r.score), 0)::int
FROM public.vanaarca_runs r
WHERE r.status = 'finished'
GROUP BY r.user_id, r.run_date
ON CONFLICT (game_id, user_id, mode, play_date) DO NOTHING;

-- Confirmação
SELECT play_date, count(*) AS jogadores, sum(attempts) AS partidas, sum(points_total) AS pontos
FROM public.game_plays
WHERE game_id = 'vana-arca'
GROUP BY play_date
ORDER BY play_date DESC
LIMIT 7;
