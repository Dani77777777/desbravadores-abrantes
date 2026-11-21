-- ============================================
-- VANAARCA — Carrega a Arca (Fase 1)
-- ============================================
-- Jogo singleplayer para jogar várias vezes por dia. Ver docs/VanaArca.md.
--
--   • vanaarca_settings         → definições (uma linha, id = 1), editáveis no admin
--   • vanaarca_runs             → partidas (só o servidor escreve; o dono lê as suas)
--   • vanaarca_weekly_payouts   → um registo por período pago (a PK impede pagar duas vezes)
--   • vanaarca_start_run        → cria a partida e gasta uma das vagas do dia (service role)
--   • award_vanaarca_run_rewards → prémio por partida, idempotente (o próprio jogador)
--   • vanaarca_process_weekly_payout → top 3 + Disputa de Famílias (service role / pg_cron)
--
-- Regras de pontos (secção 3): só as N primeiras partidas do dia (Lisboa) dão
-- XP/Gold; cada partida iniciada gasta uma vaga, mesmo abandonada; campanhas de
-- multiplicador aplicam-se ao prémio por partida e NUNCA aos semanais.
--
-- O top 3 e as famílias também são calculados em TypeScript para mostrar
-- (utils/vana-arca.ts: weeklyRanking, familyStandings). Se mudares as regras
-- aqui, muda-as lá também.
--
-- Requer: supabase-setup.sql (profiles, points_log), supabase-migration-game-settings.sql
--         e supabase-migration-game-points-multiplier.sql, supabase-migration-ranking-hide-tests.sql
--         (is_hidden_from_ranking) e supabase-migration-club-families.sql.
-- Corre o ficheiro inteiro no SQL Editor do Supabase. É idempotente: pode correr
-- duas vezes sem estragar nada (as definições e o launched_at já gravados ficam).
-- ============================================


-- 1. DEFINIÇÕES ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vanaarca_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  prize_weekday smallint NOT NULL DEFAULT 0 CHECK (prize_weekday BETWEEN 0 AND 6), -- 0 = domingo (EXTRACT(dow))
  prize_time time NOT NULL DEFAULT '21:00',                                          -- hora de Lisboa
  paid_runs_per_day int NOT NULL DEFAULT 3 CHECK (paid_runs_per_day BETWEEN 0 AND 20),
  reward_low int NOT NULL DEFAULT 5 CHECK (reward_low >= 0),
  reward_mid int NOT NULL DEFAULT 10 CHECK (reward_mid >= 0),
  reward_high int NOT NULL DEFAULT 15 CHECK (reward_high >= 0),
  mid_from int NOT NULL DEFAULT 10 CHECK (mid_from >= 1),   -- limiares de pares
  high_from int NOT NULL DEFAULT 20 CHECK (high_from >= 1),
  top_prizes int[] NOT NULL DEFAULT '{100,60,40}',
  family_prize int NOT NULL DEFAULT 50 CHECK (family_prize >= 0),
  family_min_members int NOT NULL DEFAULT 2 CHECK (family_min_members >= 1),
  launched_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Quando o dia/hora do prémio mudaram pela última vez. O período aberto acaba na
-- próxima ocorrência DEPOIS da mudança (decisão de 2026-11-21: mudar a hora no
-- admin nunca faz pagar logo a seguir a gravar).
ALTER TABLE public.vanaarca_settings
  ADD COLUMN IF NOT EXISTS schedule_changed_at timestamptz;

INSERT INTO public.vanaarca_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;


-- 2. PARTIDAS ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vanaarca_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seed bigint NOT NULL CHECK (seed BETWEEN 0 AND 4294967295),
  status text NOT NULL DEFAULT 'playing' CHECK (status IN ('playing', 'finished', 'abandoned', 'invalid')),
  run_date date NOT NULL,              -- dia de Lisboa em que começou (para as vagas do dia)
  daily_index int NOT NULL,            -- 1.ª, 2.ª, 3.ª… partida desse dia
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  taps int[],
  ticks int,
  pares int,
  filas int,
  score int,
  end_reason text CHECK (end_reason IN ('capsized', 'full')),
  invalid_reason text,
  species jsonb,                       -- espécies embarcadas (para o álbum, Fase 2)
  reward_xp int NOT NULL DEFAULT 0,
  reward_gold int NOT NULL DEFAULT 0,
  rewards_awarded boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, run_date, daily_index)
);

CREATE INDEX IF NOT EXISTS vanaarca_runs_user_date_idx ON public.vanaarca_runs (user_id, run_date);
CREATE INDEX IF NOT EXISTS vanaarca_runs_status_finished_idx ON public.vanaarca_runs (status, finished_at);

ALTER TABLE public.vanaarca_runs ENABLE ROW LEVEL SECURITY;

-- O utilizador lê as suas partidas. Sem políticas de escrita: só as server actions
-- (service role) escrevem. Não entra no Realtime.
DROP POLICY IF EXISTS "vanaarca_runs_select_own" ON public.vanaarca_runs;
CREATE POLICY "vanaarca_runs_select_own" ON public.vanaarca_runs
  FOR SELECT USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

ALTER TABLE public.vanaarca_settings ENABLE ROW LEVEL SECURITY;

-- As definições não têm nada de secreto: quem tem sessão pode ler (o ecrã mostra
-- as vagas e os prémios). Escritas só pelo servidor.
DROP POLICY IF EXISTS "vanaarca_settings_select" ON public.vanaarca_settings;
CREATE POLICY "vanaarca_settings_select" ON public.vanaarca_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);


-- 3. PAGAMENTOS SEMANAIS -------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vanaarca_weekly_payouts (
  period_end timestamptz PRIMARY KEY,
  period_start timestamptz NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  paid_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL, -- NULL = automático
  results jsonb NOT NULL              -- top 3, classificação das famílias, quem recebeu quanto
);

-- Sem políticas: só o servidor lê (o admin, por server action) e escreve.
ALTER TABLE public.vanaarca_weekly_payouts ENABLE ROW LEVEL SECURITY;


-- 4. COMEÇAR UMA PARTIDA (service role) ----------------------------------------
-- Gasta logo uma vaga do dia: o daily_index fica gravado ao começar, por isso uma
-- partida abandonada conta como uma das partidas de hoje. A partida anterior que
-- ainda esteja 'playing' passa a 'abandoned'. O cadeado por utilizador evita que
-- dois pedidos ao mesmo tempo fiquem com o mesmo número.

CREATE OR REPLACE FUNCTION public.vanaarca_start_run(p_user_id uuid, p_seed bigint)
RETURNS public.vanaarca_runs
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_index int;
  v_row public.vanaarca_runs%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Utilizador em falta.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('vanaarca:' || p_user_id::text, 0));

  UPDATE public.vanaarca_runs
     SET status = 'abandoned'
   WHERE user_id = p_user_id AND status = 'playing';

  SELECT COALESCE(max(daily_index), 0) + 1 INTO v_index
    FROM public.vanaarca_runs
   WHERE user_id = p_user_id AND run_date = v_date;

  INSERT INTO public.vanaarca_runs (user_id, seed, status, run_date, daily_index)
  VALUES (p_user_id, p_seed, 'playing', v_date, v_index)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.vanaarca_start_run(uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vanaarca_start_run(uuid, bigint) TO service_role;


-- 5. PRÉMIO POR PARTIDA (o próprio jogador) ------------------------------------
-- Padrão do VanaTrilha: FOR UPDATE + rewards_awarded, dono verificado à prova de
-- NULL, multiplicador de campanha aplicado no fim. Tem de coincidir com runReward
-- e runRewardDescription em utils/vana-arca.ts.

CREATE OR REPLACE FUNCTION public.award_vanaarca_run_rewards(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.vanaarca_runs%ROWTYPE;
  s public.vanaarca_settings%ROWTYPE;
  v_amount integer := 0;
  v_desc text;
  v_multiplier numeric := 1;
BEGIN
  -- FOR UPDATE: dois pedidos em simultâneo não conseguem pagar duas vezes.
  SELECT * INTO v_run FROM public.vanaarca_runs WHERE id = p_run_id FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF auth.uid() IS NULL OR v_run.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  IF v_run.status IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_finished');
  END IF;
  IF v_run.rewards_awarded THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_awarded',
                              'xp', v_run.reward_xp, 'gold', v_run.reward_gold);
  END IF;

  SELECT * INTO s FROM public.vanaarca_settings WHERE id = 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_settings'); END IF;

  -- Sem vaga: conta para o recorde e para os rankings, mas vale 0 pontos.
  IF v_run.daily_index < 1 OR v_run.daily_index > s.paid_runs_per_day THEN
    UPDATE public.vanaarca_runs
       SET rewards_awarded = true, reward_xp = 0, reward_gold = 0
     WHERE id = p_run_id;
    RETURN jsonb_build_object('ok', true, 'xp', 0, 'gold', 0, 'no_slot', true, 'multiplier', 1);
  END IF;

  v_amount := CASE
    WHEN COALESCE(v_run.pares, 0) >= s.high_from THEN s.reward_high
    WHEN COALESCE(v_run.pares, 0) >= s.mid_from THEN s.reward_mid
    ELSE s.reward_low
  END;

  v_desc := 'VanaArca — Partida (' || COALESCE(v_run.pares, 0) ||
            CASE WHEN COALESCE(v_run.pares, 0) = 1 THEN ' par)' ELSE ' pares)' END;

  -- Campanha de pontos (Gestão → Jogos). Só no prémio por partida.
  v_multiplier := public.game_points_multiplier('vana-arca');
  IF v_multiplier > 1 THEN
    v_amount := public.apply_points_multiplier(v_amount, v_multiplier);
    v_desc := v_desc || ' ' || public.points_multiplier_label(v_multiplier);
  END IF;

  IF v_amount > 0 THEN
    INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
    VALUES (v_run.user_id, v_run.user_id, v_amount, v_amount, v_desc);
  END IF;

  UPDATE public.vanaarca_runs
     SET rewards_awarded = true, reward_xp = v_amount, reward_gold = v_amount
   WHERE id = p_run_id;

  RETURN jsonb_build_object('ok', true, 'xp', v_amount, 'gold', v_amount, 'no_slot', false, 'multiplier', v_multiplier);
END;
$$;

REVOKE ALL ON FUNCTION public.award_vanaarca_run_rewards(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_vanaarca_run_rewards(uuid) TO authenticated;


-- 6. PERÍODO SEMANAL -----------------------------------------------------------
-- Igual a nextPrizeAt / openPeriod em utils/vana-arca.ts.

-- Próximo dia/hora do prémio (Lisboa) estritamente depois de p_after. A conversão
-- AT TIME ZONE trata da hora de verão: o domingo às 21:00 é sempre 21:00 em Lisboa.
CREATE OR REPLACE FUNCTION public.vanaarca_next_prize_at(p_after timestamptz, p_weekday int, p_time time)
RETURNS timestamptz
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  v_local_date date := (p_after AT TIME ZONE 'Europe/Lisbon')::date;
  v_days int := ((p_weekday - EXTRACT(dow FROM v_local_date)::int) % 7 + 7) % 7;
  v_candidate timestamptz;
BEGIN
  v_candidate := ((v_local_date + v_days) + p_time) AT TIME ZONE 'Europe/Lisbon';
  IF v_candidate <= p_after THEN
    v_candidate := ((v_local_date + v_days + 7) + p_time) AT TIME ZONE 'Europe/Lisbon';
  END IF;
  RETURN v_candidate;
END;
$$;

-- Período aberto: do último pagamento (ou de launched_at) até ao próximo prémio,
-- contado a partir da última mudança de dia/hora se ela for posterior ao início.
CREATE OR REPLACE FUNCTION public.vanaarca_open_period(OUT period_start timestamptz, OUT period_end timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.vanaarca_settings%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.vanaarca_settings WHERE id = 1;
  SELECT max(p.period_end) INTO period_start FROM public.vanaarca_weekly_payouts p;
  period_start := COALESCE(period_start, s.launched_at);
  period_end := public.vanaarca_next_prize_at(
    GREATEST(period_start, COALESCE(s.schedule_changed_at, period_start)),
    s.prize_weekday, s.prize_time
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vanaarca_open_period() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vanaarca_open_period() TO authenticated, service_role;


-- 7. RESULTADOS DE UM PERÍODO (só o servidor) ----------------------------------
-- Top individual: recorde de cada pessoa (a melhor partida; em empate, a mais
-- antiga), só desbravadores e dirigentes visíveis no ranking; desempate: quem fez
-- a pontuação primeiro.
-- Famílias: membros ativos = elegíveis + movimento no points_log nos 90 dias antes
-- do fim do período; média = soma dos recordes ÷ membros ativos (quem não jogou
-- conta 0); só famílias com >= family_min_members ativos; desempate: mais membros
-- que jogaram, depois o finished_at mais tardio dos recordes que contam (o mais cedo ganha).

CREATE OR REPLACE FUNCTION public.vanaarca_period_results(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.vanaarca_settings%ROWTYPE;
  v_top jsonb;
  v_families jsonb;
  v_winner jsonb := NULL;
  v_first jsonb;
BEGIN
  SELECT * INTO s FROM public.vanaarca_settings WHERE id = 1;

  WITH rec AS (
    SELECT DISTINCT ON (r.user_id) r.user_id, r.score, r.finished_at
      FROM public.vanaarca_runs r
     WHERE r.status = 'finished'
       AND r.score IS NOT NULL
       AND r.finished_at >= p_start AND r.finished_at < p_end
     ORDER BY r.user_id, r.score DESC, r.finished_at ASC
  ),
  ranked AS (
    SELECT rec.user_id, rec.score, rec.finished_at, p.full_name,
           row_number() OVER (ORDER BY rec.score DESC, rec.finished_at ASC, rec.user_id) AS pos
      FROM rec
      JOIN public.profiles p ON p.id = rec.user_id
     WHERE p.role IN ('desbravador', 'dirigente')
       AND NOT public.is_hidden_from_ranking(p.full_name)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'position', pos, 'user_id', user_id, 'name', full_name, 'score', score,
           'finished_at', finished_at, 'prize', COALESCE(s.top_prizes[pos::int], 0)
         ) ORDER BY pos), '[]'::jsonb)
    INTO v_top
    FROM ranked
   WHERE pos <= COALESCE(array_length(s.top_prizes, 1), 0);

  WITH rec AS (
    SELECT DISTINCT ON (r.user_id) r.user_id, r.score, r.finished_at
      FROM public.vanaarca_runs r
     WHERE r.status = 'finished'
       AND r.score IS NOT NULL
       AND r.finished_at >= p_start AND r.finished_at < p_end
     ORDER BY r.user_id, r.score DESC, r.finished_at ASC
  ),
  members AS (
    SELECT m.family_id, m.user_id, p.full_name
      FROM public.club_family_members m
      JOIN public.profiles p ON p.id = m.user_id
     WHERE p.role IN ('desbravador', 'dirigente')
       AND NOT public.is_hidden_from_ranking(p.full_name)
       AND EXISTS (
         SELECT 1 FROM public.points_log pl
          WHERE pl.target_user_id = m.user_id
            AND pl.created_at >= p_end - interval '90 days'
       )
  ),
  agg AS (
    SELECT f.id AS family_id, f.name,
           count(*)::int AS active,
           count(rec.user_id)::int AS played,
           COALESCE(sum(rec.score), 0)::int AS total,
           max(rec.finished_at) AS latest,
           COALESCE(
             jsonb_agg(jsonb_build_object('user_id', mb.user_id, 'name', mb.full_name))
               FILTER (WHERE rec.user_id IS NOT NULL),
             '[]'::jsonb
           ) AS recipients
      FROM members mb
      JOIN public.club_families f ON f.id = mb.family_id
      LEFT JOIN rec ON rec.user_id = mb.user_id
     GROUP BY f.id, f.name
  ),
  ordered AS (
    SELECT agg.*,
           row_number() OVER (
             ORDER BY (total::numeric / active) DESC, played DESC, latest ASC NULLS LAST, family_id
           ) AS pos
      FROM agg
     WHERE active >= s.family_min_members
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'position', pos, 'family_id', family_id, 'name', name,
           'average', round(total::numeric / active, 2), 'total', total,
           'played', played, 'active', active, 'latest_finished_at', latest,
           'recipients', recipients
         ) ORDER BY pos), '[]'::jsonb)
    INTO v_families
    FROM ordered;

  v_first := v_families -> 0;
  IF v_first IS NOT NULL AND (v_first ->> 'played')::int > 0 THEN
    v_winner := jsonb_build_object(
      'family_id', v_first -> 'family_id',
      'name', v_first -> 'name',
      'prize', s.family_prize,
      'recipients', v_first -> 'recipients'
    );
  END IF;

  RETURN jsonb_build_object(
    'top', v_top,
    -- Na lista guardada não ficam os membros (só a vencedora tem os recipients).
    'families', COALESCE((SELECT jsonb_agg(f - 'recipients' ORDER BY (f ->> 'position')::int)
                            FROM jsonb_array_elements(v_families) f), '[]'::jsonb),
    'family_winner', v_winner
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vanaarca_period_results(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vanaarca_period_results(timestamptz, timestamptz) TO service_role;


-- Membros ativos das famílias (para a pré-visualização em TypeScript usar
-- exatamente a mesma regra do pagamento): elegíveis + movimento no points_log nos
-- 90 dias antes do fim do período.
CREATE OR REPLACE FUNCTION public.vanaarca_active_family_members(p_end timestamptz)
RETURNS TABLE (user_id uuid, family_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.user_id, m.family_id
    FROM public.club_family_members m
    JOIN public.profiles p ON p.id = m.user_id
   WHERE p.role IN ('desbravador', 'dirigente')
     AND NOT public.is_hidden_from_ranking(p.full_name)
     AND EXISTS (
       SELECT 1 FROM public.points_log pl
        WHERE pl.target_user_id = m.user_id
          AND pl.created_at >= p_end - interval '90 days'
     );
$$;

REVOKE ALL ON FUNCTION public.vanaarca_active_family_members(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vanaarca_active_family_members(timestamptz) TO service_role;


-- 8. PAGAMENTO SEMANAL AUTOMÁTICO (service role / pg_cron) ----------------------
-- 1. Lê as definições e calcula o período aberto.
-- 2. Se ainda não chegou ao fim do período, não faz nada.
-- 3. Senão, calcula o top e a família vencedora, regista o período e escreve no
--    points_log, tudo na mesma transação. O FOR UPDATE nas definições serializa
--    chamadas simultâneas e a PK de vanaarca_weekly_payouts (ON CONFLICT DO
--    NOTHING) garante que um período nunca é pago duas vezes.
-- 4. Se ficaram períodos inteiros por pagar (servidor parado), paga-os por ordem
--    até apanhar o período atual.
-- Os multiplicadores de campanha NÃO se aplicam aqui. awarded_by_user_id = NULL:
-- a Auditoria mostra "Sistema", na categoria Jogos.

CREATE OR REPLACE FUNCTION public.vanaarca_process_weekly_payout(p_triggered_by uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.vanaarca_settings%ROWTYPE;
  v_start timestamptz;
  v_end timestamptz;
  v_results jsonb;
  v_inserted timestamptz;
  v_paid int := 0;
  v_entry jsonb;
  v_prize int;
  v_guard int := 0;
BEGIN
  -- Uma chamada de cada vez.
  SELECT * INTO s FROM public.vanaarca_settings WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_settings'); END IF;

  LOOP
    v_guard := v_guard + 1;
    EXIT WHEN v_guard > 260; -- 5 anos de semanas: nunca deve acontecer

    SELECT max(p.period_end) INTO v_start FROM public.vanaarca_weekly_payouts p;
    v_start := COALESCE(v_start, s.launched_at);
    v_end := public.vanaarca_next_prize_at(
      GREATEST(v_start, COALESCE(s.schedule_changed_at, v_start)),
      s.prize_weekday, s.prize_time
    );

    -- Ainda não é hora.
    EXIT WHEN v_end > now();

    v_results := public.vanaarca_period_results(v_start, v_end);

    v_inserted := NULL;
    INSERT INTO public.vanaarca_weekly_payouts (period_end, period_start, paid_by, results)
    VALUES (v_end, v_start, p_triggered_by, v_results)
    ON CONFLICT (period_end) DO NOTHING
    RETURNING period_end INTO v_inserted;

    -- Já pago (não deve acontecer com o FOR UPDATE, mas nunca paga duas vezes).
    EXIT WHEN v_inserted IS NULL;

    FOR v_entry IN SELECT * FROM jsonb_array_elements(v_results -> 'top') LOOP
      v_prize := COALESCE((v_entry ->> 'prize')::int, 0);
      IF v_prize > 0 THEN
        INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
        VALUES ((v_entry ->> 'user_id')::uuid, NULL, v_prize, v_prize,
                'VanaArca — ' || (v_entry ->> 'position') || '.º lugar da semana');
      END IF;
    END LOOP;

    IF v_results -> 'family_winner' IS NOT NULL
       AND jsonb_typeof(v_results -> 'family_winner') = 'object'
       AND COALESCE((v_results -> 'family_winner' ->> 'prize')::int, 0) > 0 THEN
      FOR v_entry IN SELECT * FROM jsonb_array_elements(v_results -> 'family_winner' -> 'recipients') LOOP
        INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
        VALUES ((v_entry ->> 'user_id')::uuid, NULL,
                (v_results -> 'family_winner' ->> 'prize')::int,
                (v_results -> 'family_winner' ->> 'prize')::int,
                'VanaArca — Disputa de Famílias (' || (v_results -> 'family_winner' ->> 'name') || ')');
      END LOOP;
    END IF;

    v_paid := v_paid + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'paid_periods', v_paid, 'next_payout_at', v_end);
END;
$$;

REVOKE ALL ON FUNCTION public.vanaarca_process_weekly_payout(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vanaarca_process_weekly_payout(uuid) TO service_role;


-- 9. pg_cron (se existir no projeto): a cada 5 minutos. A própria função decide se
--    já é hora, por isso a hora de verão e as mudanças no admin não mexem no cron.
--    Sem pg_cron, abrir /jogos/vana-arca ou /admin/vana-arca chama a função.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'vanaarca-weekly-payout';
    PERFORM cron.schedule('vanaarca-weekly-payout', '*/5 * * * *', 'SELECT public.vanaarca_process_weekly_payout();');
  END IF;
END $$;


-- 10. DISPONIBILIDADE (Gestão → Jogos) -----------------------------------------
-- Nasce escondido e só para a liderança, como o VanaCódigo: testa primeiro e
-- depois abre-o em Gestão → Jogos. Se a linha já existir, fica como estiver.
INSERT INTO public.game_settings (game_id, enabled, allowed_roles, hidden)
VALUES ('vana-arca', true, ARRAY['dirigente', 'coordenador']::text[], true)
ON CONFLICT (game_id) DO NOTHING;

-- Quando o abrires a toda a gente, a primeira semana do ranking pode começar aí
-- (as partidas de teste dos dirigentes deixam de contar). Corre só UMA vez, antes
-- do primeiro pagamento:
--   UPDATE public.vanaarca_settings SET launched_at = now() WHERE id = 1
--     AND NOT EXISTS (SELECT 1 FROM public.vanaarca_weekly_payouts);


-- Confirmação
SELECT s.prize_weekday, s.prize_time, s.paid_runs_per_day, s.launched_at, o.period_end AS proximo_pagamento
FROM public.vanaarca_settings s, public.vanaarca_open_period() o;
