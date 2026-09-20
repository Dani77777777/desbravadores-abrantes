-- ============================================
-- VanaTrilha — A Rota da Promessa (Modo Diário, singleplayer)
-- ============================================
-- Correr no SQL Editor do Supabase DEPOIS de supabase-setup.sql
-- (e de supabase-migration-helpers.sql, que define get_my_role() efetivo).
-- Idempotente: pode correr mais do que uma vez sem estragar nada.
--
-- Depois disto, correr supabase-seed-vana-trilha-questions.sql (105 perguntas).
--
-- Resumo:
--   • vanatrilha_questions        banco de perguntas (só dirigentes/coordenadores leem)
--   • vanatrilha_daily_runs       uma corrida por utilizador por dia (data de Lisboa)
--   • vanatrilha_station_progress estações completadas (insígnia "Peregrino da Promessa")
--   • vanatrilha_station_of_day() estação global do dia (roda 1→7)
--   • vanatrilha_daily_questions() as 8 perguntas do dia (só o servidor pode chamar)
--   • award_vanatrilha_daily_rewards() prémios idempotentes via points_log
--
-- Nenhuma destas tabelas é publicada em realtime (o Modo Diário é local ao jogador).
-- ============================================


-- 1. BANCO DE PERGUNTAS ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vanatrilha_questions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  station smallint NOT NULL CHECK (station BETWEEN 1 AND 7),
  category text NOT NULL CHECK (category IN ('personagens','lugares','numeros','milagres','versiculos')),
  difficulty text NOT NULL CHECK (difficulty IN ('facil','media','dificil')),
  prompt text NOT NULL CHECK (length(btrim(prompt)) > 0),
  options jsonb NOT NULL,                       -- ["opção A","opção B","opção C","opção D"]
  correct_index smallint NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  reference text,                               -- "Êxodo 14:21"
  explanation text NOT NULL CHECK (length(btrim(explanation)) > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vanatrilha_questions_options_len
    CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) = 4)
);

CREATE INDEX IF NOT EXISTS vanatrilha_questions_station_idx
  ON public.vanatrilha_questions (station, difficulty) WHERE is_active;

-- Evita duplicar a mesma pergunta na mesma estação (e torna o seed re-executável).
CREATE UNIQUE INDEX IF NOT EXISTS vanatrilha_questions_station_prompt_uidx
  ON public.vanatrilha_questions (station, prompt);


-- 2. CORRIDAS DIÁRIAS ------------------------------------------------------------
-- Notas sobre as regras (decididas na implementação):
--   • Errar faz perder 1 vida e troca a pergunta por outra da mesma dificuldade
--     (reserve_ids). Assim o peão chega sempre à casa 8 enquanto houver vidas.
--   • Jornada Perfeita = etapa completa com mistakes = 0.
--   • turn = n.º de respostas já submetidas: é o "questionIndex" que o cliente
--     envia, e serve de trinco otimista (impede responder duas vezes / saltar).
CREATE TABLE IF NOT EXISTS public.vanatrilha_daily_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  run_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Lisbon')::date),
  station smallint NOT NULL CHECK (station BETWEEN 1 AND 7),
  question_ids uuid[] NOT NULL,                 -- as 8 perguntas do dia, ordem fixa
  reserve_ids uuid[] NOT NULL DEFAULT '{}',     -- perguntas de substituição (ao errar)
  current_question_id uuid,                     -- pergunta a ser respondida agora
  bonus_question_id uuid,                       -- pergunta V/F das Tábuas da Lei (se houver)
  bonus_pending boolean NOT NULL DEFAULT false, -- o próximo passo é a pergunta bónus
  current_index smallint NOT NULL DEFAULT 0 CHECK (current_index BETWEEN 0 AND 8),
  position smallint NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 8),
  lives smallint NOT NULL DEFAULT 3 CHECK (lives BETWEEN 0 AND 3),
  correct_count smallint NOT NULL DEFAULT 0,
  mistakes smallint NOT NULL DEFAULT 0,
  turn smallint NOT NULL DEFAULT 0,
  immune_next_error boolean NOT NULL DEFAULT false,  -- Fonte de Elim
  bonus_gold smallint NOT NULL DEFAULT 0,            -- Milagre (só pago se completar)
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{turn, kind, question_id, chosen_index, correct, protected, at}]
  status text NOT NULL DEFAULT 'playing' CHECK (status IN ('playing','completed','failed')),
  rewards_awarded boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (user_id, run_date)
);

CREATE INDEX IF NOT EXISTS vanatrilha_daily_runs_user_idx
  ON public.vanatrilha_daily_runs (user_id, run_date DESC);

CREATE INDEX IF NOT EXISTS vanatrilha_daily_runs_date_idx
  ON public.vanatrilha_daily_runs (run_date);


-- 3. ESTAÇÕES COMPLETADAS (insígnia) ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.vanatrilha_station_progress (
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  station smallint NOT NULL CHECK (station BETWEEN 1 AND 7),
  first_completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, station)
);


-- 4. RLS --------------------------------------------------------------------------
ALTER TABLE public.vanatrilha_questions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanatrilha_daily_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanatrilha_station_progress ENABLE ROW LEVEL SECURITY;

-- Perguntas: só dirigentes/coordenadores (incluindo ajudantes) leem e escrevem.
-- Os jogadores nunca leem esta tabela — recebem as perguntas pelas server actions,
-- já sem a resposta certa.
DROP POLICY IF EXISTS "vanatrilha_questions_select_admin" ON public.vanatrilha_questions;
CREATE POLICY "vanatrilha_questions_select_admin" ON public.vanatrilha_questions
  FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('dirigente','coordenador'));

DROP POLICY IF EXISTS "vanatrilha_questions_write_admin" ON public.vanatrilha_questions;
CREATE POLICY "vanatrilha_questions_write_admin" ON public.vanatrilha_questions
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('dirigente','coordenador'))
  WITH CHECK (public.get_my_role() IN ('dirigente','coordenador'));

-- Corridas: cada um vê as suas. Escritas só via server actions (service role).
DROP POLICY IF EXISTS "vanatrilha_runs_select_own" ON public.vanatrilha_daily_runs;
CREATE POLICY "vanatrilha_runs_select_own" ON public.vanatrilha_daily_runs
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Progresso de estações: cada um vê o seu. Escrito só pela função de prémios.
DROP POLICY IF EXISTS "vanatrilha_progress_select_own" ON public.vanatrilha_station_progress;
CREATE POLICY "vanatrilha_progress_select_own" ON public.vanatrilha_station_progress
  FOR SELECT TO authenticated USING (user_id = auth.uid());


-- 5. updated_at automático nas perguntas ------------------------------------------
CREATE OR REPLACE FUNCTION public.vanatrilha_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vanatrilha_questions_updated_at ON public.vanatrilha_questions;
CREATE TRIGGER trg_vanatrilha_questions_updated_at
  BEFORE UPDATE ON public.vanatrilha_questions
  FOR EACH ROW EXECUTE FUNCTION public.vanatrilha_touch_updated_at();


-- 6. ESTAÇÃO DO DIA ----------------------------------------------------------------
-- Determinista e global (roda 1→7 a partir de 2026-01-01).
-- Tem de coincidir com stationOfDay() em utils/vana-trilha.ts.
CREATE OR REPLACE FUNCTION public.vanatrilha_station_of_day(p_date date)
RETURNS smallint LANGUAGE sql IMMUTABLE AS $$
  SELECT (((((p_date - DATE '2026-01-01') % 7) + 7) % 7) + 1)::smallint;
$$;


-- 7. AS 8 PERGUNTAS DO DIA ----------------------------------------------------------
-- 3 fáceis + 3 médias + 2 difíceis, deterministas por data (ordenação por hash:
-- mesma data = mesmas perguntas para todos, sem setseed()).
-- Se faltarem perguntas numa dificuldade devolve menos de 8 — a server action
-- completa com outras perguntas da mesma estação.
CREATE OR REPLACE FUNCTION public.vanatrilha_daily_questions(p_date date)
RETURNS SETOF public.vanatrilha_questions
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (x.q).*
  FROM (
    SELECT
      q,
      q.difficulty AS difficulty,
      q.id AS id,
      row_number() OVER (
        PARTITION BY q.difficulty
        ORDER BY md5(q.id::text || p_date::text)
      ) AS rn
    FROM public.vanatrilha_questions q
    WHERE q.station = public.vanatrilha_station_of_day(p_date)
      AND q.is_active
  ) x
  WHERE (x.difficulty = 'facil'   AND x.rn <= 3)
     OR (x.difficulty = 'media'   AND x.rn <= 3)
     OR (x.difficulty = 'dificil' AND x.rn <= 2)
  ORDER BY
    CASE x.difficulty WHEN 'facil' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
    md5(x.id::text);
$$;

-- ⚠️ Esta função devolve correct_index: NUNCA pode ser chamada por jogadores.
-- Só o service role (server actions) a executa.
REVOKE ALL ON FUNCTION public.vanatrilha_daily_questions(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vanatrilha_daily_questions(date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vanatrilha_daily_questions(date) TO service_role;


-- 8. PRÉMIOS (RPC idempotente) ------------------------------------------------------
-- Etapa completa: 2 XP + 2 Gold. Jornada Perfeita (sem erros): +1 XP +1 Gold.
-- Casa Milagre: +2 Gold extra (só se a etapa ficar completa).
-- Etapa falhada: nada. Chamada com a sessão do jogador (usa auth.uid()).
CREATE OR REPLACE FUNCTION public.award_vanatrilha_daily_rewards(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.vanatrilha_daily_runs%ROWTYPE;
  v_xp integer := 0;
  v_gold integer := 0;
  v_perfect boolean := false;
  v_station_name text;
  v_desc text;
BEGIN
  -- FOR UPDATE: dois pedidos em simultâneo não conseguem pagar duas vezes.
  SELECT * INTO v_run FROM public.vanatrilha_daily_runs WHERE id = p_run_id FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF auth.uid() IS NULL OR v_run.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  IF v_run.status <> 'completed' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_completed'); END IF;
  IF v_run.rewards_awarded THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_awarded'); END IF;

  v_perfect := (v_run.mistakes = 0);
  v_xp   := 2 + CASE WHEN v_perfect THEN 1 ELSE 0 END;
  v_gold := 2 + CASE WHEN v_perfect THEN 1 ELSE 0 END + COALESCE(v_run.bonus_gold, 0);

  v_station_name := CASE v_run.station
    WHEN 1 THEN 'Egito'
    WHEN 2 THEN 'Mar Vermelho'
    WHEN 3 THEN 'Deserto de Sin'
    WHEN 4 THEN 'Monte Sinai'
    WHEN 5 THEN 'Cades-Barneia'
    WHEN 6 THEN 'Rio Jordão'
    WHEN 7 THEN 'Terra Prometida'
    ELSE 'Etapa ' || v_run.station
  END;

  v_desc := 'VanaTrilha — ' || v_station_name ||
            CASE WHEN v_perfect THEN ' (Jornada Perfeita)' ELSE '' END ||
            CASE WHEN COALESCE(v_run.bonus_gold, 0) > 0 THEN ' + Milagre' ELSE '' END;

  INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
  VALUES (v_run.user_id, v_run.user_id, v_xp, v_gold, v_desc);

  UPDATE public.vanatrilha_daily_runs SET rewards_awarded = true WHERE id = p_run_id;

  INSERT INTO public.vanatrilha_station_progress (user_id, station)
  VALUES (v_run.user_id, v_run.station)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'xp', v_xp,
    'gold', v_gold,
    'perfect', v_perfect,
    'bonus_gold', COALESCE(v_run.bonus_gold, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.award_vanatrilha_daily_rewards(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_vanatrilha_daily_rewards(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.award_vanatrilha_daily_rewards(uuid) TO authenticated;


-- 9. VERIFICAÇÃO RÁPIDA -------------------------------------------------------------
-- Estação de hoje (Lisboa). Ex.: 2026-09-14 → 5 (Cades-Barneia).
-- SELECT public.vanatrilha_station_of_day((now() AT TIME ZONE 'Europe/Lisbon')::date);
-- Perguntas de hoje (corre como postgres no SQL Editor):
-- SELECT station, difficulty, prompt FROM public.vanatrilha_daily_questions((now() AT TIME ZONE 'Europe/Lisbon')::date);
