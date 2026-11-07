-- ===========================================================================
-- DESBRAVADORES ABRANTES — BASE DE DADOS COMPLETA (Supabase / PostgreSQL)
-- ===========================================================================
--
-- Cria de raiz TODA a base de dados da plataforma num projeto Supabase novo e
-- vazio: tipos, tabelas, vistas, funções/RPCs, triggers, índices, RLS,
-- permissões (incluindo as permissões por coluna do anon), buckets (imagens e
-- comprovativos do Cofre) e as suas políticas, o trigger que cria o perfil no registo, as tabelas do
-- Realtime e os dados iniciais dos jogos.
--
-- É o estado final de todas as migrações supabase-*.sql e supabase/migrations/*
-- do repositório (até 2026-11-04), aplicadas por ordem cronológica. Não inclui
-- os ficheiros supabase-teste-*.sql (dados de teste do VanaCoro).
--
-- Conteúdo: 7 enums · 92 tabelas · 5 vistas · 120 funções · 26 triggers
--           56 índices · 164 políticas RLS (+ 9 no storage) · trigger de perfil em auth.users
--           457 linhas de dados iniciais (definições, packs, versículos, perguntas)
--
-- COMO CORRER
--   Opção A: Supabase → SQL Editor → colar o ficheiro todo → Run.
--   Opção B: psql "<connection string do projeto>" -f supabase-schema-completo.sql
--   Corre numa só transação: se algo falhar, nada fica criado a meio.
--   Só para um projeto VAZIO (não é uma migração para a base de produção).
--
-- DEPOIS DE CORRER (fora do SQL; ver README.md → "Base de dados")
--   1. Fazer deploy da Edge Function send-push e criar o Database Webhook
--      "INSERT em public.announcements" → send-push (modelo na secção 5).
--   2. Copiar os modelos de email de supabase/templates/ para Auth → Email Templates.
--   3. Criar a primeira conta no site, fazer o onboarding e promovê-la a
--      coordenador (comando na secção 5).
--
-- MAPA DAS FUNCIONALIDADES → TABELAS
--   Membros, pontos e comunicados:
--       profiles, points_log, section_changes, announcements,
--       announcement_recipients, tasks, task_completions, suggestions,
--       push_subscriptions, leaderboard (view)
--   Eventos, RSVP, convites e presenças por QR:
--       events, event_attendance, event_rsvps, event_invites, email_opt_outs,
--       event_guests
--   Famílias (os adultos entram nas contas das crianças):
--       club_families, club_family_members, club_family_invites,
--       family_account_links,
--       family_account_requests (legado das contas familiares, já migradas)
--   QR codes de pontos:
--       qr_codes, qr_scans
--   Loja:
--       store_products, store_purchases, store_settings, digital_keys,
--       digital_key_stock (view)
--   Cofre (dinheiro do clube, só coordenação real):
--       club_cash_movements, cofre_em_mao (view)
--   Inquéritos:
--       surveys, survey_options, survey_responses
--   Auditoria e épocas de pontos:
--       points_audit (view), points_audit_events, points_seasons,
--       points_season_standings
--   Ferramentas do projetor e Tendas e boleias:
--       raffle_screens, timer_screens, team_screens, club_screens, trip_plans
--   Centro de Jogos:
--       game_settings, game_plays
--   VANTUR:
--       vantur_sessions, vantur_dictionary, portuguese_words
--   VanaQuest:
--       vana_quests, vana_quest_questions, vana_quest_sessions,
--       vana_quest_participants, vana_quest_answers
--   VanaCamp:
--       vanacamp_sessions, vanacamp_players, vanacamp_players_public (view),
--       vanacamp_events, vanacamp_messages, vanacamp_votes,
--       vanacamp_night_actions
--   VanaWords:
--       vanawords_sessions, vanawords_players, vanawords_words,
--       vanawords_turns, vanawords_guesses, vanawords_word_bank
--   VanaSketch:
--       vanasketch_sessions, vanasketch_players, vanasketch_rounds,
--       vanasketch_strokes, vanasketch_guesses, vanasketch_packs,
--       vanasketch_pack_words
--   VanaCódigo:
--       vana_codigo_sessions
--   VanaTrilha:
--       vanatrilha_questions, vanatrilha_daily_runs,
--       vanatrilha_station_progress
--   VanaEspada:
--       vanaespada_verses, vanaespada_sessions, vanaespada_players,
--       vanaespada_session_rounds, vanaespada_answers, vanaespada_decks,
--       vanaespada_deck_rounds, vanaespada_drill_prompts (Modo B: só schema)
--   VanaSentinela:
--       vana_sentinela_scores
--   VanaCoro e Pergunta da Semana:
--       vanacoro_questions, vanacoro_answers, vanacoro_groups,
--       vanacoro_answer_rewards, vanacoro_settings, vanacoro_sessions,
--       vanacoro_players, vanacoro_roster, vanacoro_rounds,
--       vanacoro_round_events, vanacoro_reveals, vanacoro_board_entries
--
-- As RLS usam get_my_role(), get_my_section(), get_my_leadership_section() e
-- get_my_real_role() (os ajudantes herdam o cargo efetivo).
-- Regra de ouro dos pontos: tudo entra em points_log; os totais do perfil são
-- recalculados por trigger e protect_point_totals rejeita outros valores.

BEGIN;

-- ===========================================================================
-- 0. EXTENSÕES E PRIVILÉGIOS POR OMISSÃO
-- ===========================================================================

-- Já existem num projeto Supabase; ficam aqui por segurança.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- O Supabase dá ALL ao anon/authenticated/service_role em tudo o que se cria no
-- schema public. Desliga-se isso durante a criação para as permissões ficarem
-- EXATAMENTE as das migrações (há REVOKEs importantes: events.online_url
-- escondido do anon, RPCs só para o service_role, ...). No fim da secção 1 os
-- privilégios por omissão do Supabase são repostos.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;

-- ===========================================================================
-- 1. SCHEMA PUBLIC: tipos, funções, tabelas, dados iniciais, índices, triggers, RLS
-- ===========================================================================
-- (ordem de dependências do pg_dump; cada objeto tem um cabeçalho "-- Name:")

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'desbravador',
    'dirigente',
    'coordenador'
);


--
-- Name: app_section; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_section AS ENUM (
    'rebentos',
    'ticoes',
    'exploradores',
    'companheiros',
    'embaixadores'
);


--
-- Name: attendance_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.attendance_status AS ENUM (
    'presente',
    'atrasado',
    'faltou'
);


--
-- Name: product_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_type AS ENUM (
    'physical',
    'digital'
);


--
-- Name: purchase_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.purchase_status AS ENUM (
    'pending',
    'delivered',
    'refunded'
);


--
-- Name: apply_age_sections(uuid[], boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_age_sections(p_member_ids uuid[], p_reset_investiture boolean DEFAULT true, p_notify boolean DEFAULT true) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count int;
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Só a coordenação pode mudar a classe de um membro.';
  END IF;

  PERFORM set_config('app.section_reset_investiture', CASE WHEN p_reset_investiture THEN 'on' ELSE 'off' END, true);
  PERFORM set_config('app.section_notify', CASE WHEN p_notify THEN 'on' ELSE 'off' END, true);
  PERFORM set_config('app.section_change_reason', 'idade', true);

  UPDATE public.profiles p
     SET section = public.calculate_section(p.birth_date)
   WHERE p.id = ANY(p_member_ids)
     AND p.role = 'desbravador'
     AND p.birth_date IS NOT NULL
     AND public.calculate_section(p.birth_date) <> p.section;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
-- Name: apply_points_multiplier(integer, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_points_multiplier(p_amount integer, p_multiplier numeric) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_amount <= 0 OR p_multiplier <= 1 THEN p_amount
    ELSE ceil(p_amount * p_multiplier)::integer
  END;
$$;


--
-- Name: assign_helper(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_helper(p_target_id uuid, p_helper_role text DEFAULT NULL::text, p_helper_section text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_real_role text := public.get_my_real_role();
  v_my_section text;
  v_target_role text;
  v_target_helper_role text;
  v_target_helper_section text;
  v_new_role public.app_role;
  v_new_section public.app_section;
BEGIN
  IF COALESCE(v_real_role, '') NOT IN ('coordenador', 'dirigente') THEN
    RAISE EXCEPTION 'Sem permissão para nomear ajudantes.';
  END IF;

  SELECT role::text, helper_role::text, helper_section::text
    INTO v_target_role, v_target_helper_role, v_target_helper_section
    FROM public.profiles WHERE id = p_target_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Membro não encontrado.';
  END IF;

  IF v_real_role = 'dirigente' THEN
    SELECT COALESCE(leadership_section, section)::text INTO v_my_section
    FROM public.profiles WHERE id = auth.uid();
  END IF;

  IF p_helper_role IS NULL THEN
    -- Remoção: o dirigente só pode remover ajudantes do seu próprio âmbito.
    IF v_real_role = 'dirigente'
       AND NOT (v_target_helper_role = 'dirigente' AND v_target_helper_section = v_my_section) THEN
      RAISE EXCEPTION 'Só podes remover ajudantes da tua secção.';
    END IF;
    v_new_role := NULL;
    v_new_section := NULL;
  ELSE
    -- Só membros (desbravadores) podem ser ajudantes
    IF v_target_role <> 'desbravador' THEN
      RAISE EXCEPTION 'Apenas membros podem ser nomeados ajudantes.';
    END IF;

    IF v_real_role = 'coordenador' THEN
      IF p_helper_role = 'coordenador' THEN
        v_new_role := 'coordenador';
        v_new_section := NULL;
      ELSIF p_helper_role = 'dirigente' THEN
        IF p_helper_section IS NULL THEN
          RAISE EXCEPTION 'É necessária uma secção para um ajudante de dirigente.';
        END IF;
        v_new_role := 'dirigente';
        v_new_section := p_helper_section::public.app_section;
      ELSE
        RAISE EXCEPTION 'Âmbito de ajudante inválido.';
      END IF;
    ELSE
      -- dirigente real: âmbito fixo na sua secção; não pode "roubar" ajudante de outro âmbito.
      IF v_target_helper_role IS NOT NULL
         AND NOT (v_target_helper_role = 'dirigente' AND v_target_helper_section = v_my_section) THEN
        RAISE EXCEPTION 'Este membro já é ajudante de outro âmbito.';
      END IF;
      v_new_role := 'dirigente';
      v_new_section := v_my_section::public.app_section;
    END IF;
  END IF;

  -- Ativa o bypass do trigger e aplica a alteração
  PERFORM set_config('app.allow_role_change', 'on', true);
  UPDATE public.profiles
    SET helper_role = v_new_role,
        helper_section = v_new_section,
        updated_at = now()
    WHERE id = p_target_id;
END;
$$;


--
-- Name: audit_fix_totals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_fix_totals() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Apenas a coordenação pode corrigir totais.';
  END IF;

  FOR r IN SELECT * FROM public.audit_points_mismatches() LOOP
    INSERT INTO public.points_audit_events (action, target_user_id, target_name, performed_by, performed_by_name, old_xp, old_gold, new_xp, new_gold, description)
    VALUES ('TOTALS_FIX', r.user_id, r.full_name, auth.uid(), (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
            r.total_xp, r.current_gold, r.log_xp, r.log_gold,
            'Totais do perfil não batiam com o histórico de pontos');
    UPDATE public.profiles SET total_xp = r.log_xp, current_gold = r.log_gold WHERE id = r.user_id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


--
-- Name: audit_points_mismatches(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_points_mismatches() RETURNS TABLE(user_id uuid, full_name text, total_xp integer, current_gold integer, log_xp integer, log_gold integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id, p.full_name, p.total_xp, p.current_gold, s.xp::int, s.gold::int
  FROM public.profiles p
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(amount_xp), 0) AS xp, COALESCE(SUM(amount_gold), 0) AS gold
    FROM public.points_log WHERE target_user_id = p.id
  ) s
  WHERE (auth.uid() IS NULL OR public.get_my_real_role() = 'coordenador')
    AND (p.total_xp <> s.xp OR p.current_gold <> s.gold)
  ORDER BY p.full_name;
$$;


--
-- Name: audit_points_overview(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_points_overview(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result json;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Apenas a coordenação pode ver a auditoria.';
  END IF;

  WITH m_all AS (
    SELECT * FROM public.points_audit
    WHERE (p_from IS NULL OR created_at >= p_from)
      AND (p_to IS NULL OR created_at < p_to)
  ),
  -- Resets de época não contam como "XP retirado" nem nos tops (distorceriam tudo);
  -- continuam visíveis na origem "Reset de época" e na tabela.
  m AS (SELECT * FROM m_all WHERE category <> 'reset')
  SELECT json_build_object(
    'totals', (
      SELECT json_build_object(
        'movements', count(*),
        'xp_in',   COALESCE(SUM(amount_xp)   FILTER (WHERE amount_xp > 0), 0),
        'xp_out',  COALESCE(-SUM(amount_xp)  FILTER (WHERE amount_xp < 0), 0),
        'gold_in', COALESCE(SUM(amount_gold) FILTER (WHERE amount_gold > 0), 0),
        'gold_out',COALESCE(-SUM(amount_gold) FILTER (WHERE amount_gold < 0), 0),
        'suspicious', count(*) FILTER (WHERE is_suspicious),
        'coord_self', count(*) FILTER (WHERE category = 'auto'),
        'members', count(DISTINCT target_user_id)
      ) FROM m
    ),
    'by_category', COALESCE((
      SELECT json_agg(c ORDER BY c.movements DESC) FROM (
        SELECT category,
               count(*) AS movements,
               COALESCE(SUM(amount_xp)   FILTER (WHERE amount_xp > 0), 0)   AS xp_in,
               COALESCE(-SUM(amount_xp)  FILTER (WHERE amount_xp < 0), 0)   AS xp_out,
               COALESCE(SUM(amount_gold) FILTER (WHERE amount_gold > 0), 0) AS gold_in,
               COALESCE(-SUM(amount_gold) FILTER (WHERE amount_gold < 0), 0) AS gold_out
        FROM m_all GROUP BY category
      ) c
    ), '[]'::json),
    'top_receivers', COALESCE((
      SELECT json_agg(r) FROM (
        SELECT target_user_id AS user_id, max(target_name) AS name, max(target_avatar) AS avatar_url,
               SUM(amount_xp) AS xp, SUM(amount_gold) AS gold
        FROM m WHERE target_user_id IS NOT NULL
        GROUP BY target_user_id
        ORDER BY SUM(amount_xp) DESC NULLS LAST
        LIMIT 5
      ) r
    ), '[]'::json),
    'top_awarders', COALESCE((
      SELECT json_agg(r) FROM (
        SELECT awarded_by_user_id AS user_id, max(awarded_by_name) AS name, max(awarded_by_role) AS role,
               max(awarded_by_real_role) AS real_role, max(awarded_by_helper_role) AS helper_role,
               max(awarded_by_helper_section) AS helper_section,
               count(*) AS movements,
               COALESCE(SUM(amount_xp) FILTER (WHERE amount_xp > 0), 0) AS xp_given
        FROM m
        WHERE category IN ('manual', 'auto', 'tarefa', 'evento', 'sugestao')
        GROUP BY awarded_by_user_id
        ORDER BY count(*) DESC
        LIMIT 5
      ) r
    ), '[]'::json),
    'changes', (
      SELECT count(*) FROM public.points_audit_events e
      WHERE (p_from IS NULL OR e.created_at >= p_from) AND (p_to IS NULL OR e.created_at < p_to)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;


--
-- Name: award_question_answer_reward(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_question_answer_reward(p_question_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inserted int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autorizado.';
  END IF;

  -- Só quem respondeu mesmo a esta pergunta
  IF NOT EXISTS (
    SELECT 1 FROM public.vanacoro_answers
    WHERE question_id = p_question_id AND profile_id = v_uid
  ) THEN
    RETURN jsonb_build_object('awarded', false);
  END IF;

  INSERT INTO public.vanacoro_answer_rewards (question_id, profile_id)
  VALUES (p_question_id, v_uid)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('awarded', false);
  END IF;

  INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
  VALUES (v_uid, v_uid, 5, 0, 'Pergunta da Semana');

  RETURN jsonb_build_object('awarded', true, 'xp', 5, 'gold', 0);
END;
$$;


--
-- Name: award_survey_response_points(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_survey_response_points() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  defn boolean;
  xp_amt integer;
  gold_amt integer;
  q text;
BEGIN
  SELECT s.is_definitive, o.xp_reward, o.gold_reward, s.question
    INTO defn, xp_amt, gold_amt, q
    FROM public.survey_options o
    JOIN public.surveys s ON s.id = o.survey_id
   WHERE o.id = NEW.option_id;

  IF defn AND (COALESCE(xp_amt, 0) > 0 OR COALESCE(gold_amt, 0) > 0) THEN
    INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
    VALUES (
      NEW.user_id,
      NEW.user_id,
      COALESCE(xp_amt, 0),
      COALESCE(gold_amt, 0),
      'Resposta a inquérito: ' || q
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: award_vana_codigo_rewards(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_vana_codigo_rewards(p_user_id uuid, p_mode text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_amount integer;
  v_desc text;
  v_desc_base text;
  v_mode_label text;
  v_multiplier numeric := 1;
BEGIN
  -- Só o próprio pode reclamar as suas recompensas
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Não autorizado.';
  END IF;

  v_amount := CASE p_mode
    WHEN 'recruta' THEN 1
    WHEN 'explorador' THEN 2
    WHEN 'mestre' THEN 4
    ELSE NULL
  END;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'Modo inválido.';
  END IF;

  v_mode_label := initcap(p_mode);
  v_desc_base := 'VanaCódigo — Desafio Diário (' || v_mode_label || ')';
  v_desc := v_desc_base;

  -- A vitória tem de existir na sessão de hoje
  IF NOT EXISTS (
    SELECT 1 FROM public.vana_codigo_sessions
    WHERE user_id = p_user_id
      AND mode = p_mode
      AND is_finished = true
      AND is_won = true
      AND updated_at >= public.vana_codigo_day_start()
  ) THEN
    RETURN jsonb_build_object('awarded', false, 'message', null);
  END IF;

  -- Uma recompensa por modo por dia (o sufixo do multiplicador não conta)
  IF EXISTS (
    SELECT 1 FROM public.points_log
    WHERE target_user_id = p_user_id
      AND description LIKE v_desc_base || '%'
      AND created_at >= public.vana_codigo_day_start()
  ) THEN
    RETURN jsonb_build_object(
      'awarded', false,
      'message', 'Já recebeste as recompensas deste modo hoje!'
    );
  END IF;

  -- Campanha de pontos a dobrar (Gestão → Jogos)
  v_multiplier := public.game_points_multiplier('vana-codigo');
  IF v_multiplier > 1 THEN
    v_amount := public.apply_points_multiplier(v_amount, v_multiplier);
    v_desc := v_desc || ' (pontos ' || public.points_multiplier_label(v_multiplier) || ')';
  END IF;

  INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
  VALUES (p_user_id, p_user_id, v_amount, v_amount, v_desc);

  RETURN jsonb_build_object(
    'awarded', true,
    'multiplier', v_multiplier,
    'message', 'Mensagem decifrada! Ganhaste ' || v_amount || ' XP e ' || v_amount || ' Gold 🪙'
      || CASE WHEN v_multiplier > 1 THEN ' (' || public.points_multiplier_label(v_multiplier) || '!)' ELSE '' END
  );
END;
$$;


--
-- Name: award_vana_sentinela_rewards(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_vana_sentinela_rewards(p_score_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_score public.vana_sentinela_scores%ROWTYPE;
  v_day_start timestamptz := ((now() AT TIME ZONE 'Europe/Lisbon')::date)::timestamp AT TIME ZONE 'Europe/Lisbon';
  v_city text;
  v_desc_base text;
  v_desc text;
  v_amount integer;
  v_multiplier numeric := 1;
BEGIN
  SELECT * INTO v_score FROM public.vana_sentinela_scores WHERE id = p_score_id;
  IF NOT FOUND OR auth.uid() IS NULL OR v_score.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Não autorizado.';
  END IF;

  -- Só rondas de hoje
  IF v_score.created_at < v_day_start THEN
    RETURN jsonb_build_object('awarded', false, 'message', null);
  END IF;

  v_city := CASE v_score.pack
    WHEN 'abrantes' THEN 'Abrantes'
    WHEN 'entroncamento' THEN 'Entroncamento'
    WHEN 'ourem' THEN 'Ourém'
    WHEN 'tomar' THEN 'Tomar'
    ELSE initcap(v_score.pack)
  END;
  v_desc_base := 'VanaSentinela — ' || v_city;

  -- Um prémio por pack por dia (o sufixo das certas/multiplicador não conta)
  IF EXISTS (
    SELECT 1 FROM public.points_log
    WHERE target_user_id = v_score.user_id
      AND description LIKE v_desc_base || '%'
      AND created_at >= v_day_start
  ) THEN
    RETURN jsonb_build_object(
      'awarded', false,
      'message', 'Já recebeste o prémio de hoje neste pack. Volta amanhã!'
    );
  END IF;

  v_amount := CASE WHEN v_score.correct >= 14 THEN 3 WHEN v_score.correct >= 11 THEN 2 ELSE 1 END;
  v_desc := v_desc_base || ' (' || v_score.correct || '/' || v_score.total || ' certas)';

  v_multiplier := public.game_points_multiplier('vana-sentinela');
  IF v_multiplier > 1 THEN
    v_amount := public.apply_points_multiplier(v_amount, v_multiplier);
    v_desc := v_desc || ' (pontos ' || public.points_multiplier_label(v_multiplier) || ')';
  END IF;

  INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
  VALUES (v_score.user_id, v_score.user_id, v_amount, v_amount, v_desc);

  RETURN jsonb_build_object(
    'awarded', true,
    'xp', v_amount,
    'gold', v_amount,
    'multiplier', v_multiplier,
    'message', 'Ganhaste ' || v_amount || ' XP e ' || v_amount || ' Gold 🪙'
      || CASE WHEN v_multiplier > 1 THEN ' (' || public.points_multiplier_label(v_multiplier) || '!)' ELSE '' END
  );
END;
$$;


--
-- Name: award_vanatrilha_daily_rewards(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_vanatrilha_daily_rewards(p_run_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_run public.vanatrilha_daily_runs%ROWTYPE;
  v_xp integer := 0;
  v_gold integer := 0;
  v_perfect boolean := false;
  v_station_name text;
  v_desc text;
  v_multiplier numeric := 1;
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

  -- Campanha de pontos a dobrar (Gestão → Jogos)
  v_multiplier := public.game_points_multiplier('vana-trilha');
  IF v_multiplier > 1 THEN
    v_xp   := public.apply_points_multiplier(v_xp, v_multiplier);
    v_gold := public.apply_points_multiplier(v_gold, v_multiplier);
    v_desc := v_desc || ' (pontos ' || public.points_multiplier_label(v_multiplier) || ')';
  END IF;

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
    'bonus_gold', COALESCE(v_run.bonus_gold, 0),
    'multiplier', v_multiplier
  );
END;
$$;


--
-- Name: award_vantur_rewards(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_vantur_rewards(user_id uuid, mode text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  -- Os nomes dos parâmetros colidem com colunas: usam-se só por aqui.
  v_user_id uuid := $1;
  v_mode text := $2;
  v_day_start timestamptz := ((now() AT TIME ZONE 'Europe/Lisbon')::date)::timestamp AT TIME ZONE 'Europe/Lisbon';
  v_amount integer;
  v_desc text;
  v_desc_base text;
  v_multiplier numeric := 1;
BEGIN
  -- Só o próprio pode reclamar as suas recompensas
  IF v_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Não autorizado.';
  END IF;

  v_amount := CASE v_mode
    WHEN 'solo' THEN 1
    WHEN 'mix' THEN 2
    WHEN 'plex' THEN 4
    ELSE NULL
  END;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'Modo inválido.';
  END IF;

  v_desc_base := 'Vantur (' || initcap(v_mode) || ') - Vitória';
  v_desc := v_desc_base;

  -- A vitória tem de existir na sessão de hoje: terminada e com todas as
  -- palavras acertadas.
  IF NOT EXISTS (
    SELECT 1 FROM public.vantur_sessions s
    WHERE s.user_id = v_user_id
      AND s.mode = v_mode
      AND s.is_finished = true
      AND s.updated_at >= v_day_start
      AND cardinality(s.secret_words) > 0
      AND cardinality(s.completed_indices) >= cardinality(s.secret_words)
  ) THEN
    RETURN jsonb_build_object('awarded', false, 'message', null);
  END IF;

  -- Uma recompensa por modo por dia (o sufixo do multiplicador não conta)
  IF EXISTS (
    SELECT 1 FROM public.points_log
    WHERE target_user_id = v_user_id
      AND description LIKE v_desc_base || '%'
      AND created_at >= v_day_start
  ) THEN
    RETURN jsonb_build_object(
      'awarded', false,
      'message', 'Já recebeste as recompensas deste modo hoje!'
    );
  END IF;

  -- Campanha de pontos multiplicados (Gestão → Jogos)
  v_multiplier := public.game_points_multiplier('vantur');
  IF v_multiplier > 1 THEN
    v_amount := public.apply_points_multiplier(v_amount, v_multiplier);
    v_desc := v_desc || ' (pontos ' || public.points_multiplier_label(v_multiplier) || ')';
  END IF;

  INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
  VALUES (v_user_id, v_user_id, v_amount, v_amount, v_desc);

  RETURN jsonb_build_object(
    'awarded', true,
    'multiplier', v_multiplier,
    'message', 'Vitória! Ganhaste ' || v_amount || ' XP e ' || v_amount || ' Gold 🪙'
      || CASE WHEN v_multiplier > 1 THEN ' (' || public.points_multiplier_label(v_multiplier) || '!)' ELSE '' END
  );
END;
$_$;


--
-- Name: calculate_section(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_section(birth_date date) RETURNS public.app_section
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN date_part('year', age(birth_date)) BETWEEN 3  AND 5  THEN 'rebentos'::public.app_section
    WHEN date_part('year', age(birth_date)) BETWEEN 6  AND 10 THEN 'ticoes'::public.app_section
    WHEN date_part('year', age(birth_date)) BETWEEN 11 AND 15 THEN 'exploradores'::public.app_section
    WHEN date_part('year', age(birth_date)) BETWEEN 16 AND 23 THEN 'companheiros'::public.app_section
    ELSE 'embaixadores'::public.app_section
  END;
$$;


--
-- Name: can_manage_trip(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_trip(p_event_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.get_my_role() = 'coordenador'
      OR (
        public.get_my_role() = 'dirigente'
        AND EXISTS (
          SELECT 1 FROM public.events e
          WHERE e.id = p_event_id
            AND e.target_section IS NOT NULL
            AND e.target_section = public.get_my_leadership_section()
        )
      );
$$;


--
-- Name: cancel_my_purchase(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_my_purchase(p_purchase_id uuid, p_cancel_token uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purchase record;
  v_product record;
BEGIN
  SELECT * INTO v_purchase FROM public.store_purchases WHERE id = p_purchase_id FOR UPDATE;

  -- Não encontrada ou sem permissão: a mesma mensagem (não revela se existe).
  IF NOT FOUND OR NOT COALESCE(
    (v_purchase.user_id IS NOT NULL AND v_purchase.user_id = auth.uid())
    OR (p_cancel_token IS NOT NULL AND v_purchase.cancel_token = p_cancel_token),
    false
  ) THEN
    RAISE EXCEPTION 'Encomenda não encontrada.';
  END IF;

  IF v_purchase.status <> 'pending' THEN
    RAISE EXCEPTION 'Esta encomenda já foi entregue ou cancelada. Fala com a coordenação.';
  END IF;
  -- Com dinheiro já entregue, o cancelamento passa pela coordenação (tem de devolver em mãos).
  IF v_purchase.paid_at IS NOT NULL AND COALESCE(v_purchase.amount_due_eur, 0) > 0 THEN
    RAISE EXCEPTION 'Esta encomenda já foi paga. Fala com a coordenação para a cancelar.';
  END IF;

  SELECT name, type, is_preorder INTO v_product
  FROM public.store_products WHERE id = v_purchase.product_id;

  -- 1. Devolver o Gold do desconto
  IF v_purchase.gold_spent > 0 AND v_purchase.user_id IS NOT NULL THEN
    INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
    VALUES (v_purchase.user_id, v_purchase.user_id, 0, v_purchase.gold_spent,
            'Encomenda cancelada: ' || COALESCE(v_product.name, 'artigo'));
  END IF;

  -- 2. Repor o stock (físico com stock; por encomenda não tem)
  IF v_product.type = 'physical' AND NOT COALESCE(v_product.is_preorder, false) THEN
    UPDATE public.store_products SET stock = stock + COALESCE(v_purchase.quantity, 1)
    WHERE id = v_purchase.product_id;
  END IF;

  -- 3. Digital por pagar com chave (encomendas de antes desta correção): a chave volta.
  IF v_purchase.paid_at IS NULL AND v_purchase.digital_key_delivered IS NOT NULL THEN
    UPDATE public.digital_keys SET is_used = false
    WHERE product_id = v_purchase.product_id AND key_value = v_purchase.digital_key_delivered;
  END IF;

  -- 4. Um engano não fica no histórico
  DELETE FROM public.store_purchases WHERE id = p_purchase_id;

  RETURN jsonb_build_object('success', true, 'gold_returned', COALESCE(v_purchase.gold_spent, 0));

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


--
-- Name: change_member_section(uuid, text, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.change_member_section(p_member_id uuid, p_section text, p_reset_investiture boolean DEFAULT true, p_notify boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Só a coordenação pode mudar a classe de um membro.';
  END IF;

  PERFORM set_config('app.section_reset_investiture', CASE WHEN p_reset_investiture THEN 'on' ELSE 'off' END, true);
  PERFORM set_config('app.section_notify', CASE WHEN p_notify THEN 'on' ELSE 'off' END, true);
  PERFORM set_config('app.section_change_reason', 'manual', true);

  UPDATE public.profiles SET section = p_section::public.app_section WHERE id = p_member_id;
END;
$$;


--
-- Name: check_qr_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_qr_limit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_max_uses INTEGER;
    v_current_uses INTEGER;
BEGIN
    -- 1. Obter o limite global do código
    SELECT max_uses_global INTO v_max_uses
    FROM public.qr_codes
    WHERE id = NEW.qr_code_id;

    -- 2. Se houver limite, validar
    IF v_max_uses IS NOT NULL THEN
        SELECT COUNT(*) INTO v_current_uses
        FROM public.qr_scans
        WHERE qr_code_id = NEW.qr_code_id;

        IF v_current_uses >= v_max_uses THEN
            RAISE EXCEPTION 'Este código já atingiu o limite máximo de resgates (%)', v_max_uses;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION check_qr_limit(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.check_qr_limit() IS 'Prevents inserting more scans than allowed by qr_codes.max_uses_global.';


--
-- Name: cleanup_stale_event_guests(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_stale_event_guests() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_event uuid;
  v_total integer := 0;
BEGIN
  FOR v_event IN
    SELECT DISTINCT g.event_id
    FROM public.event_guests g
    JOIN public.events e ON e.id = g.event_id
    WHERE COALESCE(e.end_at, e.start_at) < now() - interval '24 hours'
  LOOP
    v_total := v_total + public.close_event_guests(v_event);
  END LOOP;
  RETURN v_total;
END;
$$;


--
-- Name: close_event_guests(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_event_guests(p_event_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  WITH gone AS (DELETE FROM public.event_guests WHERE event_id = p_event_id RETURNING 1)
  SELECT count(*) INTO v_count FROM gone;

  -- Soma (um evento reaberto e finalizado outra vez pode ter recebido mais visitas).
  IF v_count > 0 OR NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id AND guests_count IS NOT NULL) THEN
    UPDATE public.events SET guests_count = COALESCE(guests_count, 0) + v_count WHERE id = p_event_id;
  END IF;
  RETURN v_count;
END;
$$;


--
-- Name: delete_empty_club_family(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_empty_club_family() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.club_family_members WHERE family_id = OLD.family_id) THEN
    DELETE FROM public.club_families WHERE id = OLD.family_id;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: delete_purchase_record(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_purchase_record(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status public.purchase_status;
  v_paid_at timestamptz;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Apenas coordenadores podem apagar registos.';
  END IF;

  SELECT status, paid_at INTO v_status, v_paid_at
  FROM public.store_purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;
  IF v_status <> 'refunded' THEN
    RAISE EXCEPTION 'Só se podem apagar compras canceladas ou reembolsadas.';
  END IF;
  IF v_paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta compra teve dinheiro envolvido e fica no histórico.';
  END IF;

  DELETE FROM public.store_purchases WHERE id = p_purchase_id;
END;
$$;


--
-- Name: dismiss_section_suggestion(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dismiss_section_suggestion(p_member_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;
  UPDATE public.profiles
     SET dismissed_section_suggestion = public.calculate_section(birth_date)
   WHERE id = p_member_id AND birth_date IS NOT NULL;
END;
$$;


--
-- Name: enforce_family_account_link_exclusive(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_family_account_link_exclusive() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Um perfil associado não pode ser associado duas vezes nem tornar-se principal.
  IF EXISTS (
    SELECT 1
    FROM public.family_account_links
    WHERE associated_user_id IN (NEW.owner_user_id, NEW.associated_user_id)
  ) THEN
    RAISE EXCEPTION 'Um perfil associado não pode pertencer a outra família.';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: events_close_guests_on_finish(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.events_close_guests_on_finish() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.is_finished AND NOT COALESCE(OLD.is_finished, false) THEN
    PERFORM public.close_event_guests(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fill_announcement_recipients(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fill_announcement_recipients() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- 'members' (vários membros) é preenchido pela RPC send_announcement.
  IF NEW.audience = 'members' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.announcement_recipients (announcement_id, user_id, created_at)
  SELECT NEW.id, r, NEW.created_at
  FROM public.resolve_announcement_recipients(NEW.target_user_id, NEW.target_section, NEW.target_role, NEW.author_id) AS r
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;


--
-- Name: expire_unpaid_store_orders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_unpaid_store_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_days integer;
  v_count integer := 0;
  r record;
BEGIN
  SELECT COALESCE((SELECT unpaid_expiry_days FROM public.store_settings WHERE id = true), 14)
    INTO v_days;

  FOR r IN
    SELECT sp.id, sp.user_id, sp.product_id, sp.quantity, sp.gold_spent, p.name
    FROM public.store_purchases sp
    JOIN public.store_products p ON p.id = sp.product_id
    WHERE sp.status = 'pending'
      AND sp.paid_at IS NULL
      AND p.type = 'physical'
      AND NOT COALESCE(p.is_preorder, false)
      AND sp.created_at < now() - make_interval(days => v_days)
    FOR UPDATE OF sp SKIP LOCKED
  LOOP
    IF r.gold_spent > 0 AND r.user_id IS NOT NULL THEN
      INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
      VALUES (r.user_id, r.user_id, 0, r.gold_spent, 'Encomenda caducada (não foi paga): ' || COALESCE(r.name, 'artigo'));
    END IF;

    UPDATE public.store_products SET stock = stock + COALESCE(r.quantity, 1)
    WHERE id = r.product_id;

    DELETE FROM public.store_purchases WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


--
-- Name: finalize_survey(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_survey(p_survey_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  r record;
  s_question text;
  s_deadline timestamptz;
  s_definitive boolean;
  s_finalized timestamptz;
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Apenas coordenadores podem finalizar inquéritos';
  END IF;

  SELECT question, deadline, is_definitive, finalized_at
    INTO s_question, s_deadline, s_definitive, s_finalized
    FROM public.surveys WHERE id = p_survey_id;

  IF s_question IS NULL THEN
    RAISE EXCEPTION 'Inquérito não encontrado';
  END IF;
  IF s_definitive THEN
    RAISE EXCEPTION 'Este inquérito é definitivo — os pontos foram atribuídos no acto do voto';
  END IF;
  IF s_finalized IS NOT NULL THEN
    RAISE EXCEPTION 'Este inquérito já foi finalizado';
  END IF;
  IF s_deadline > now() THEN
    RAISE EXCEPTION 'O inquérito ainda não terminou';
  END IF;

  FOR r IN
    SELECT resp.user_id, opt.xp_reward, opt.gold_reward
      FROM public.survey_responses resp
      JOIN public.survey_options opt ON opt.id = resp.option_id
      WHERE resp.survey_id = p_survey_id
        AND (opt.xp_reward > 0 OR opt.gold_reward > 0)
  LOOP
    INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
    VALUES (r.user_id, auth.uid(), r.xp_reward, r.gold_reward, 'Resposta a inquérito: ' || s_question);
  END LOOP;

  UPDATE public.surveys SET finalized_at = now() WHERE id = p_survey_id;
END;
$$;


--
-- Name: game_points_multiplier(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.game_points_multiplier(p_game_id text) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE((
    SELECT gs.points_multiplier
    FROM public.game_settings gs
    WHERE gs.game_id = p_game_id
      AND gs.points_multiplier > 1
      AND (gs.multiplier_starts_at IS NULL OR gs.multiplier_starts_at <= now())
      AND (gs.multiplier_ends_at IS NULL OR gs.multiplier_ends_at > now())
  ), 1);
$$;


--
-- Name: get_gold_rate_info(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_gold_rate_info() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_base numeric := 100;
  v_ref numeric := 10000;
  v_min numeric := 0.5;
  v_max numeric := 3;
  v_total numeric := 0;
  v_mult numeric;
  v_rate integer;
BEGIN
  SELECT base_gold_per_euro, reference_total_gold, min_rate_multiplier, max_rate_multiplier
  INTO v_base, v_ref, v_min, v_max
  FROM public.store_settings WHERE id = true;

  IF NOT FOUND THEN
    v_base := 100; v_ref := 10000; v_min := 0.5; v_max := 3;
  END IF;

  SELECT COALESCE(SUM(current_gold), 0) INTO v_total FROM public.profiles;

  v_mult := LEAST(v_max, GREATEST(v_min, v_total / NULLIF(v_ref, 0)));
  v_rate := GREATEST(1, CEIL(v_base * COALESCE(v_mult, 1)))::integer;

  RETURN jsonb_build_object(
    'gold_per_euro', v_rate,
    'total_gold', v_total,
    'base_gold_per_euro', v_base,
    'reference_total_gold', v_ref,
    'multiplier', round(COALESCE(v_mult, 1), 2)
  );
END;
$$;


--
-- Name: get_guest_purchases(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_guest_purchases(p_tokens uuid[]) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', sp.id,
    'cancel_token', sp.cancel_token,
    'status', sp.status,
    'paid_at', sp.paid_at,
    'created_at', sp.created_at,
    'quantity', sp.quantity,
    'amount_due_eur', sp.amount_due_eur,
    'buyer_name', sp.buyer_name,
    'product_name', p.name,
    'product_type', p.type,
    'is_preorder', p.is_preorder
  ) ORDER BY sp.created_at DESC), '[]'::jsonb)
  FROM public.store_purchases sp
  LEFT JOIN public.store_products p ON p.id = sp.product_id
  WHERE sp.user_id IS NULL
    AND sp.cancel_token = ANY(COALESCE(p_tokens[1:20], '{}'));
$$;


--
-- Name: is_hidden_from_ranking(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_hidden_from_ranking(name text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT name IS NULL
      OR btrim(name) = ''
      OR position('@' IN name) > 0
      OR name ILIKE '%teste%'
$$;


--
-- Name: FUNCTION is_hidden_from_ranking(text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_hidden_from_ranking(text) IS 'Contas de teste (nome com "teste") ou ainda só com o email/sem nome: ficam fora do ranking.';


--
-- Name: get_leaderboard_at_date(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_leaderboard_at_date(target_date timestamp with time zone) RETURNS TABLE(id uuid, full_name text, avatar_url text, section public.app_section, role public.app_role, is_invested boolean, total_xp bigint, current_gold bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.avatar_url,
    CASE WHEN p.role = 'dirigente' THEN COALESCE(p.leadership_section, p.section) ELSE p.section END,
    p.role,
    p.is_invested,
    COALESCE(SUM(pl.amount_xp), 0)::bigint AS total_xp,
    COALESCE(SUM(pl.amount_gold), 0)::bigint AS current_gold
  FROM public.profiles p
  LEFT JOIN public.points_log pl ON p.id = pl.target_user_id AND pl.created_at <= target_date
  WHERE p.role IN ('desbravador', 'dirigente')
    AND NOT public.is_hidden_from_ranking(p.full_name)
  GROUP BY p.id, p.full_name, p.avatar_url, p.section, p.leadership_section, p.role, p.is_invested;
END;
$$;


--
-- Name: get_my_leadership_section(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_leadership_section() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(helper_section::text, leadership_section::text) FROM public.profiles WHERE id = auth.uid();
$$;


--
-- Name: get_my_real_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_real_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid();
$$;


--
-- Name: get_my_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(helper_role::text, role::text) FROM public.profiles WHERE id = auth.uid();
$$;


--
-- Name: get_my_section(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_section() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT section::text FROM public.profiles WHERE id = auth.uid();
$$;


--
-- Name: get_my_trip_assignments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_trip_assignments() RETURNS TABLE(event_id uuid, title text, location text, start_at timestamp with time zone, end_at timestamp with time zone, published jsonb, published_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT e.id, e.title, e.location, e.start_at, e.end_at, p.published, p.published_at
  FROM public.trip_plans p
  JOIN public.events e ON e.id = p.event_id
  WHERE auth.uid() IS NOT NULL
    AND p.published IS NOT NULL
    AND (p.published -> 'names') ? auth.uid()::text
    AND COALESCE(e.end_at, e.start_at) > now() - interval '2 days'
  ORDER BY e.start_at;
$$;


--
-- Name: get_profile_section(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_profile_section(p_user_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT section::text FROM public.profiles WHERE id = p_user_id;
$$;


--
-- Name: get_random_general_words(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_random_general_words(count integer) RETURNS TABLE(word_clean text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
  SELECT w.word_clean
  FROM public.portuguese_words w
  WHERE char_length(w.word_clean) = 5
  ORDER BY random()
  LIMIT LEAST(GREATEST($1, 0), 10);
$_$;


--
-- Name: get_random_vantur_words(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_random_vantur_words(count integer) RETURNS TABLE(word text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
  SELECT d.word
  FROM public.vantur_dictionary d
  WHERE char_length(d.word) = 5
  ORDER BY random()
  LIMIT LEAST(GREATEST($1, 0), 10);
$_$;


--
-- Name: get_survey_embed(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_survey_embed(p_survey_id uuid) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT json_build_object(
    'id', s.id,
    'question', s.question,
    'description', s.description,
    'deadline', s.deadline,
    'opened', s.opened_at IS NOT NULL AND s.opened_at <= now(),
    'is_open', s.opened_at IS NOT NULL AND s.opened_at <= now() AND s.deadline > now(),
    'show_results_live', s.show_results_live,
    'total', (SELECT count(*) FROM public.survey_responses r WHERE r.survey_id = s.id),
    'options', COALESCE((
      SELECT json_agg(json_build_object(
        'id', o.id,
        'label', o.label,
        'count', CASE
          WHEN s.deadline <= now() OR s.show_results_live
            THEN (SELECT count(*) FROM public.survey_responses r WHERE r.option_id = o.id)
          ELSE NULL
        END
      ) ORDER BY o.position)
      FROM public.survey_options o WHERE o.survey_id = s.id
    ), '[]'::json)
  )
  FROM public.surveys s
  WHERE s.id = p_survey_id;
$$;


--
-- Name: get_store_product_costs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_store_product_costs()
RETURNS TABLE(product_id uuid, cost_price numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;

  RETURN QUERY SELECT p.id, p.cost_price FROM public.store_products p;
END;
$$;


--
-- Name: get_vana_sentinela_ranking(text, text, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_vana_sentinela_ranking(p_pack text, p_period text DEFAULT 'sempre'::text, p_limit integer DEFAULT 10, p_guest_id uuid DEFAULT NULL::uuid) RETURNS TABLE(score_id uuid, rank_position bigint, full_name text, avatar_url text, section text, is_guest boolean, points integer, correct integer, total integer, duration_ms integer, created_at timestamp with time zone, is_me boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH since AS (
    SELECT CASE
      WHEN p_period = 'semana'
        -- A semana começa ao domingo (EXTRACT(DOW) dá 0 ao domingo).
        THEN ((now() AT TIME ZONE 'Europe/Lisbon')::date
              - EXTRACT(DOW FROM now() AT TIME ZONE 'Europe/Lisbon')::int)::timestamp AT TIME ZONE 'Europe/Lisbon'
      ELSE NULL
    END AS t
  ),
  best AS (
    SELECT DISTINCT ON (COALESCE(s.user_id, s.guest_id)) s.*
    FROM public.vana_sentinela_scores s, since
    WHERE s.pack = p_pack
      AND (since.t IS NULL OR s.created_at >= since.t)
    ORDER BY COALESCE(s.user_id, s.guest_id), s.points DESC, s.correct DESC, s.duration_ms ASC, s.created_at ASC
  ),
  ranked AS (
    SELECT b.*,
           row_number() OVER (ORDER BY b.points DESC, b.correct DESC, b.duration_ms ASC, b.created_at ASC) AS pos,
           CASE
             WHEN b.user_id IS NOT NULL THEN auth.uid() IS NOT NULL AND b.user_id = auth.uid()
             ELSE p_guest_id IS NOT NULL AND b.guest_id = p_guest_id
           END AS mine
    FROM best b
  )
  SELECT r.id, r.pos,
         COALESCE(p.full_name, r.guest_name), p.avatar_url, p.section::text,
         r.user_id IS NULL,
         r.points, r.correct, r.total, r.duration_ms, r.created_at,
         r.mine
  FROM ranked r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE (r.user_id IS NULL OR p.id IS NOT NULL)
    AND (r.pos <= LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50) OR r.mine)
  ORDER BY r.pos;
$$;


--
-- Name: get_vanaespada_host_answers(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_vanaespada_host_answers(p_session_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: get_vanaespada_reveal(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_vanaespada_reveal(p_session_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: get_vanaespada_round_public(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_vanaespada_round_public(p_session_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: get_vanasketch_bot(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_vanasketch_bot(p_session_id uuid, p_player_id uuid) RETURNS TABLE(id uuid, display_name text, score integer, draw_order integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.vanasketch_sessions s
    WHERE s.id = p_session_id AND s.host_id = v_uid AND s.is_test_session = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
    SELECT p.id, p.display_name, p.score, p.draw_order
    FROM public.vanasketch_players p
    WHERE p.session_id = p_session_id AND p.id = p_player_id AND p.is_bot = true;
END;
$$;


--
-- Name: get_vanasketch_drawer_info(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_vanasketch_drawer_info(p_session_id uuid) RETURNS TABLE(round_number integer, word_options jsonb, word text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: get_vanawords_bot(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_vanawords_bot(p_session_id uuid, p_player_id uuid) RETURNS TABLE(id uuid, display_name text, team text, is_arauto boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: get_vanawords_public(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_vanawords_public(p_session_id uuid) RETURNS TABLE(id uuid, session_id uuid, word text, team text, grid_pos integer, is_revealed boolean, revealed_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    w.id,
    w.session_id,
    w.word,
    CASE
      WHEN w.is_revealed
        OR (SELECT s.status FROM public.vanawords_sessions s WHERE s.id = p_session_id) = 'finished'
      THEN w.team
      ELSE NULL
    END AS team,
    w.grid_pos,
    w.is_revealed,
    w.revealed_at
  FROM public.vanawords_words w
  WHERE w.session_id = p_session_id
  ORDER BY w.grid_pos;
$$;


--
-- Name: get_vanawords_with_teams(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_vanawords_with_teams(p_session_id uuid) RETURNS TABLE(id uuid, session_id uuid, word text, team text, grid_pos integer, is_revealed boolean, revealed_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: handle_lifecycle_changes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_lifecycle_changes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  kid_name text := COALESCE(NEW.full_name, 'Desbravador');
  v_is_admin boolean;
  v_reset boolean;
  v_notify boolean;
  v_reason text;
  v_section_changed boolean := false;
BEGIN
  -- Perfil novo: classe calculada pela idade.
  IF TG_OP = 'INSERT' THEN
    IF NEW.birth_date IS NOT NULL AND NEW.role = 'desbravador' THEN
      NEW.section := public.calculate_section(NEW.birth_date);
    END IF;
    RETURN NEW;
  END IF;

  -- auth.uid() NULL = SQL Editor / service role → sem restrições.
  v_is_admin := auth.uid() IS NULL
    OR COALESCE(current_setting('app.allow_section_change', true), '') = 'on'
    OR public.get_my_role() = 'coordenador';

  -- Primeira data de nascimento num perfil já existente (onboarding): classe pela idade, sem avisos.
  IF OLD.birth_date IS NULL AND NEW.birth_date IS NOT NULL
     AND NEW.section IS NOT DISTINCT FROM OLD.section
     AND NEW.role = 'desbravador' THEN
    NEW.section := public.calculate_section(NEW.birth_date);
    IF NEW.section IS DISTINCT FROM OLD.section THEN
      INSERT INTO public.section_changes (user_id, from_section, to_section, changed_by, reason)
      VALUES (NEW.id, OLD.section, NEW.section, auth.uid(), 'onboarding');
    END IF;
    RETURN NEW;
  END IF;

  -- Mudança de classe.
  IF NEW.section IS DISTINCT FROM OLD.section THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Só a coordenação pode mudar a classe de um membro.';
    END IF;

    v_section_changed := true;
    v_reset  := COALESCE(NULLIF(current_setting('app.section_reset_investiture', true), ''), 'on') <> 'off';
    v_notify := COALESCE(NULLIF(current_setting('app.section_notify', true), ''), 'on') <> 'off';
    v_reason := COALESCE(NULLIF(current_setting('app.section_change_reason', true), ''), 'manual');

    IF v_reset THEN
      NEW.is_invested := false;
    END IF;
    NEW.dismissed_section_suggestion := NULL;

    INSERT INTO public.section_changes (user_id, from_section, to_section, changed_by, reason, investiture_reset)
    VALUES (NEW.id, OLD.section, NEW.section, auth.uid(), v_reason, v_reset AND OLD.is_invested);

    IF v_notify AND NEW.role = 'desbravador' THEN
      IF public.section_rank(NEW.section::text) > public.section_rank(OLD.section::text) THEN
        INSERT INTO public.announcements (title, message, target_user_id, audience)
        VALUES (
          'Nova etapa! 🆙',
          'Parabéns, ' || kid_name || '! Passaste dos ' || public.section_label(OLD.section::text)
            || ' para os ' || public.section_label(NEW.section::text) || '.'
            || CASE WHEN v_reset THEN ' Prepara-te para a tua nova investidura! 🧣' ELSE '' END,
          NEW.id,
          'member'
        );
      ELSE
        INSERT INTO public.announcements (title, message, target_user_id, audience)
        VALUES (
          'A tua classe foi atualizada',
          'Olá, ' || kid_name || '! A tua classe passou a ser ' || public.section_label(NEW.section::text) || '.',
          NEW.id,
          'member'
        );
      END IF;
    END IF;
  END IF;

  -- Investidura (quando não foi o próprio trigger a reiniciá-la).
  IF NEW.is_invested IS DISTINCT FROM OLD.is_invested AND NOT v_section_changed THEN
    IF NOT (
      v_is_admin
      OR (public.get_my_role() = 'dirigente' AND NEW.section::text = public.get_my_leadership_section())
    ) THEN
      RAISE EXCEPTION 'Sem permissão para alterar a investidura.';
    END IF;

    IF NEW.is_invested THEN
      INSERT INTO public.announcements (title, message, target_user_id, audience)
      VALUES (
        'Investidura concluída! 🧣',
        'Parabéns, ' || kid_name || '! És agora oficialmente um membro investido dos '
          || public.section_label(NEW.section::text) || '. Usa o teu lenço com orgulho!',
        NEW.id,
        'member'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: is_announcement_author(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_announcement_author(p_announcement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.announcements
    WHERE id = p_announcement_id AND author_id = auth.uid()
  );
$$;


--
-- Name: is_announcement_recipient(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_announcement_recipient(p_announcement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.announcement_recipients
    WHERE announcement_id = p_announcement_id AND user_id = auth.uid()
  );
$$;


--
-- Name: list_club_members_for_assignment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_club_members_for_assignment() RETURNS TABLE(id uuid, full_name text, avatar_url text, section public.app_section, role public.app_role, helper_role public.app_role, helper_section public.app_section)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN
  IF COALESCE(public.get_my_real_role(), '') NOT IN ('coordenador', 'dirigente') THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;

  RETURN QUERY
    SELECT p.id, p.full_name, p.avatar_url, p.section, p.role, p.helper_role, p.helper_section
    FROM public.profiles p
    WHERE p.role = 'desbravador'
    ORDER BY p.full_name;
END;
$$;


--
-- Name: list_section_suggestions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_section_suggestions() RETURNS TABLE(id uuid, full_name text, avatar_url text, birth_date date, age integer, section public.app_section, suggested_section public.app_section, is_invested boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id, p.full_name, p.avatar_url, p.birth_date,
         date_part('year', age(p.birth_date))::int,
         p.section, public.calculate_section(p.birth_date), p.is_invested
  FROM public.profiles p
  WHERE public.get_my_role() = 'coordenador'
    AND p.role = 'desbravador'
    AND p.birth_date IS NOT NULL
    AND public.calculate_section(p.birth_date) <> p.section
    AND p.dismissed_section_suggestion IS DISTINCT FROM public.calculate_section(p.birth_date)
  ORDER BY public.section_rank(p.section::text), p.full_name;
$$;


--
-- Name: log_points_log_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_points_log_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Conta apagada (cascata): não registar movimento a movimento.
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.target_user_id) THEN
      INSERT INTO public.points_audit_events (action, log_id, target_user_id, target_name, performed_by, performed_by_name, old_xp, old_gold, description)
      VALUES ('DELETE', OLD.id, OLD.target_user_id,
              (SELECT full_name FROM public.profiles WHERE id = OLD.target_user_id),
              auth.uid(), (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
              OLD.amount_xp, OLD.amount_gold, OLD.description);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.amount_xp IS DISTINCT FROM OLD.amount_xp
     OR NEW.amount_gold IS DISTINCT FROM OLD.amount_gold
     OR NEW.target_user_id IS DISTINCT FROM OLD.target_user_id
     OR NEW.description IS DISTINCT FROM OLD.description THEN
    INSERT INTO public.points_audit_events (action, log_id, target_user_id, target_name, performed_by, performed_by_name, old_xp, old_gold, new_xp, new_gold, description)
    VALUES ('UPDATE', NEW.id, NEW.target_user_id,
            (SELECT full_name FROM public.profiles WHERE id = NEW.target_user_id),
            auth.uid(), (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
            OLD.amount_xp, OLD.amount_gold, NEW.amount_xp, NEW.amount_gold,
            CASE WHEN NEW.description IS DISTINCT FROM OLD.description
                 THEN OLD.description || ' → ' || NEW.description ELSE NEW.description END);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: log_singleplayer_play(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_singleplayer_play() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: log_vana_sentinela_play(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_vana_sentinela_play() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: mark_announcements_read(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_announcements_read(p_ids uuid[]) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE public.announcement_recipients
     SET read_at = now()
   WHERE user_id = auth.uid()
     AND announcement_id = ANY(p_ids)
     AND read_at IS NULL;
$$;


--
-- Name: mark_purchase_delivered(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_purchase_delivered(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purchase record;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão para confirmar entregas.';
  END IF;

  SELECT * INTO v_purchase FROM public.store_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;
  IF v_purchase.status = 'refunded' THEN
    RAISE EXCEPTION 'Esta compra foi reembolsada.';
  END IF;
  IF v_purchase.paid_at IS NULL THEN
    RAISE EXCEPTION 'Confirma primeiro o pagamento.';
  END IF;

  UPDATE public.store_purchases
  SET status = 'delivered'::public.purchase_status,
      delivered_at = COALESCE(delivered_at, now()),
      updated_at = now()
  WHERE id = p_purchase_id;
END;
$$;


--
-- Name: mark_purchase_paid(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_purchase_paid(p_purchase_id uuid, p_deliver boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purchase record;
  v_type public.product_type;
  v_key_id uuid;
  v_key_value text;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão para confirmar pagamentos.';
  END IF;

  SELECT * INTO v_purchase FROM public.store_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;
  IF v_purchase.status = 'refunded' THEN
    RAISE EXCEPTION 'Esta compra foi reembolsada.';
  END IF;

  SELECT type INTO v_type FROM public.store_products WHERE id = v_purchase.product_id;

  -- Digital: a chave só sai do stock quando o pagamento é confirmado.
  IF v_type = 'digital' AND v_purchase.digital_key_delivered IS NULL THEN
    SELECT id, key_value INTO v_key_id, v_key_value
    FROM public.digital_keys
    WHERE product_id = v_purchase.product_id AND is_used = false
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_key_id IS NULL THEN
      RAISE EXCEPTION 'Já não há chaves digitais para este artigo. Junta chaves ao produto antes de confirmar o pagamento.';
    END IF;

    UPDATE public.digital_keys SET is_used = true WHERE id = v_key_id;
  END IF;

  UPDATE public.store_purchases
  SET paid_at = COALESCE(paid_at, now()),
      digital_key_delivered = COALESCE(digital_key_delivered, v_key_value),
      -- digital pago = entregue (a chave fica disponível); físico só se p_deliver
      status = CASE WHEN p_deliver OR v_type = 'digital' THEN 'delivered'::public.purchase_status ELSE status END,
      delivered_at = CASE WHEN p_deliver OR v_type = 'digital' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
      updated_at = now()
  WHERE id = p_purchase_id;
END;
$$;


--
-- Name: normalize_role_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_role_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- 1. Último coordenador
  IF OLD.role = 'coordenador' AND NEW.role <> 'coordenador' AND auth.uid() IS NOT NULL THEN
    PERFORM 1 FROM public.profiles WHERE role = 'coordenador' AND id <> OLD.id LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Não é possível retirar o cargo ao último coordenador. Promove primeiro outra pessoa a coordenador.';
    END IF;
  END IF;

  -- 2. Promoção de ajudante → deixa de ser ajudante
  IF NEW.role IN ('dirigente', 'coordenador') THEN
    NEW.helper_role := NULL;
    NEW.helper_section := NULL;
  END IF;

  -- Só dirigentes têm classe de liderança
  IF NEW.role <> 'dirigente' THEN
    NEW.leadership_section := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: points_balances_from_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.points_balances_from_log() RETURNS TABLE(user_id uuid, full_name text, avatar_url text, section text, role text, xp integer, gold integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id, p.full_name, p.avatar_url, p.section::text, p.role::text,
         COALESCE(SUM(pl.amount_xp), 0)::int,
         COALESCE(SUM(pl.amount_gold), 0)::int
  FROM public.profiles p
  LEFT JOIN public.points_log pl ON pl.target_user_id = p.id
  GROUP BY p.id;
$$;


--
-- Name: points_multiplier_label(numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.points_multiplier_label(p_multiplier numeric) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT '×' || replace(rtrim(rtrim(p_multiplier::text, '0'), '.'), '.', ',');
$$;


--
-- Name: preview_points_reset(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preview_points_reset() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result json;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Apenas a coordenação pode fazer reset de pontos.';
  END IF;

  SELECT json_build_object(
    'members_with_xp',   count(*) FILTER (WHERE b.xp <> 0),
    'members_with_gold', count(*) FILTER (WHERE b.gold <> 0),
    'total_xp',   COALESCE(SUM(b.xp), 0),
    'total_gold', COALESCE(SUM(b.gold), 0)
  ) INTO v_result
  FROM public.points_balances_from_log() b;

  RETURN v_result;
END;
$$;


--
-- Name: process_purchase(uuid, numeric, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_purchase(
  p_product_id uuid,
  p_discount_eur numeric DEFAULT 0,
  p_buyer_name text DEFAULT NULL,
  p_quantity integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_product record;
  v_user_gold integer := 0;
  v_user_xp integer := 0;
  v_rate integer;
  v_discount numeric := COALESCE(round(p_discount_eur, 2), 0);
  v_max_discount numeric;
  v_gold_cost integer := 0;
  v_amount_due numeric;
  v_paid boolean;
  v_key_id uuid;
  v_key_value text;
  v_status public.purchase_status;
  v_purchase_id uuid;
  v_cancel_token uuid;
  v_buyer_name text := NULLIF(trim(COALESCE(p_buyer_name, '')), '');
  v_qty integer := COALESCE(p_quantity, 1);
  v_total numeric;
  v_cost_total numeric;
  v_volume_pct numeric := 0;
  v_volume_eur numeric := 0;
  v_after_volume numeric;
  v_unpaid integer;
  v_guest_limit integer;
  v_due_text text;
BEGIN
  -- 1. Produto
  SELECT id, name, price_eur, max_discount_percent, type, stock, min_level,
         is_preorder, preorder_deadline, cost_price
  INTO v_product
  FROM public.store_products
  WHERE id = p_product_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado ou inativo.';
  END IF;

  -- Quantidade: 1 a 10 unidades por encomenda; digitais sempre 1 (uma chave por compra).
  IF v_qty < 1 OR v_qty > 10 THEN
    RAISE EXCEPTION 'Quantidade inválida (1 a 10 unidades por encomenda).';
  END IF;
  IF v_product.type = 'digital' AND v_qty <> 1 THEN
    RAISE EXCEPTION 'Artigos digitais compram-se um de cada vez.';
  END IF;
  v_total := round(v_product.price_eur * v_qty, 2);

  -- Desconto por quantidade: só físicos com custo definido, e nunca abaixo do custo.
  IF v_product.cost_price IS NOT NULL THEN
    v_cost_total := round(v_product.cost_price * v_qty, 2);
    IF v_product.type <> 'digital' THEN
      v_volume_pct := public.store_volume_discount_percent(v_qty);
      v_volume_eur := LEAST(round(v_total * v_volume_pct / 100.0, 2), GREATEST(0, v_total - v_cost_total));
      IF v_volume_eur <= 0 THEN
        v_volume_eur := 0;
        v_volume_pct := 0;
      END IF;
    END IF;
  END IF;
  v_after_volume := v_total - v_volume_eur;

  -- 2. Comprador
  IF v_user_id IS NULL THEN
    -- Convidado: precisa de nome, não tem Gold, e artigos com nível mínimo
    -- (mesmo Nível 1) são exclusivos de membros registados.
    IF v_buyer_name IS NULL THEN
      RAISE EXCEPTION 'Indica o teu nome para comprar sem conta.';
    END IF;
    IF v_discount > 0 THEN
      RAISE EXCEPTION 'Apenas membros registados podem usar Gold como desconto.';
    END IF;
    IF COALESCE(v_product.min_level, 0) > 0 THEN
      RAISE EXCEPTION 'Este artigo é exclusivo para membros de Nível %+. Regista-te e participa!', v_product.min_level;
    END IF;
  ELSE
    SELECT current_gold, total_xp INTO v_user_gold, v_user_xp
    FROM public.profiles WHERE id = v_user_id;

    -- Membros começam no Nível 1 (floor(XP/1000)+1); min_level 1 = "só membros".
    IF COALESCE(v_product.min_level, 0) > 0 AND (floor(v_user_xp / 1000) + 1) < v_product.min_level THEN
      RAISE EXCEPTION 'Nível insuficiente. Precisas de Nível %!', v_product.min_level;
    END IF;

    -- 3. Desconto em Gold (taxa dinâmica do momento)
    IF v_discount < 0 THEN
      RAISE EXCEPTION 'Desconto inválido.';
    END IF;

    -- Teto: % máxima sobre o preço base, e só o que sobra acima do custo.
    v_max_discount := round(v_total * v_product.max_discount_percent / 100.0, 2);
    IF v_cost_total IS NOT NULL THEN
      v_max_discount := LEAST(v_max_discount, GREATEST(0, v_after_volume - v_cost_total));
    END IF;
    IF v_discount > v_max_discount THEN
      RAISE EXCEPTION 'O desconto máximo deste artigo é % €.', v_max_discount;
    END IF;

    IF v_discount > 0 THEN
      v_rate := (public.get_gold_rate_info()->>'gold_per_euro')::integer;
      v_gold_cost := CEIL(v_discount * v_rate)::integer;

      IF v_user_gold < v_gold_cost THEN
        RAISE EXCEPTION 'Gold insuficiente. Este desconto custa % 🪙 e tens % 🪙.', v_gold_cost, v_user_gold;
      END IF;
    END IF;
  END IF;

  v_amount_due := round(v_after_volume - v_discount, 2);
  v_paid := v_amount_due <= 0;

  -- 4. Limite de encomendas por pagar (contra encomendas falsas que esgotam a loja).
  --    O lock evita que dois pedidos ao mesmo tempo passem os dois a contagem.
  IF NOT v_paid THEN
    IF v_user_id IS NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext('store_unpaid:guests'));
      SELECT COALESCE((SELECT max_guest_unpaid_orders FROM public.store_settings WHERE id = true), 10)
        INTO v_guest_limit;
      SELECT count(*) INTO v_unpaid
      FROM public.store_purchases
      WHERE user_id IS NULL AND status = 'pending' AND paid_at IS NULL;
      IF v_unpaid >= v_guest_limit THEN
        RAISE EXCEPTION 'Há muitas encomendas por pagar. Fala com a coordenação.';
      END IF;
    ELSE
      PERFORM pg_advisory_xact_lock(hashtext('store_unpaid:' || v_user_id::text));
      SELECT count(*) INTO v_unpaid
      FROM public.store_purchases
      WHERE user_id = v_user_id AND status = 'pending' AND paid_at IS NULL;
      IF v_unpaid >= 3 THEN
        RAISE EXCEPTION 'Já tens 3 encomendas por pagar. Paga ou cancela uma antes de fazeres outra.';
      END IF;
    END IF;
  END IF;

  -- 5. Disponibilidade
  IF v_product.is_preorder THEN
    -- Por encomenda: sem stock, só conta o prazo.
    IF v_product.preorder_deadline IS NOT NULL AND now() > v_product.preorder_deadline THEN
      RAISE EXCEPTION 'As reservas deste artigo já fecharam.';
    END IF;

  ELSIF v_product.type = 'physical' THEN
    UPDATE public.store_products SET stock = stock - v_qty
    WHERE id = p_product_id AND stock >= v_qty;
    IF NOT FOUND THEN
      IF v_product.stock <= 0 THEN
        RAISE EXCEPTION 'Produto esgotado.';
      END IF;
      RAISE EXCEPTION 'Só restam % unidades deste artigo.', v_product.stock;
    END IF;

  ELSIF v_product.type = 'digital' THEN
    IF v_paid THEN
      -- Paga já (toda com Gold): a chave é entregue agora.
      SELECT id, key_value INTO v_key_id, v_key_value
      FROM public.digital_keys
      WHERE product_id = p_product_id AND is_used = false
      LIMIT 1
      FOR UPDATE SKIP LOCKED;

      IF v_key_id IS NULL THEN
        RAISE EXCEPTION 'Não existem chaves digitais disponíveis para este produto.';
      END IF;

      UPDATE public.digital_keys SET is_used = true WHERE id = v_key_id;
    ELSE
      -- Por pagar: não se reserva chave nenhuma (seria legível antes de pagar).
      -- A chave é atribuída em mark_purchase_paid, quando o pagamento é confirmado.
      IF NOT EXISTS (
        SELECT 1 FROM public.digital_keys
        WHERE product_id = p_product_id AND is_used = false
      ) THEN
        RAISE EXCEPTION 'Não existem chaves digitais disponíveis para este produto.';
      END IF;
    END IF;
  END IF;

  -- 6. Débito do Gold do desconto
  IF v_gold_cost > 0 THEN
    INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
    VALUES (v_user_id, v_user_id, 0, -v_gold_cost, 'Desconto na Loja: ' || v_product.name);
  END IF;

  -- 7. Registo da compra
  -- Digital já pago fica entregue de imediato; tudo o resto aguarda pagamento/entrega.
  v_status := CASE WHEN v_paid AND v_product.type = 'digital'
                   THEN 'delivered'::public.purchase_status
                   ELSE 'pending'::public.purchase_status END;

  INSERT INTO public.store_purchases (
    user_id, buyer_name, product_id, status, digital_key_delivered,
    price_eur, discount_eur, amount_due_eur, gold_spent, gold_rate,
    paid_at, delivered_at, quantity, volume_discount_percent, volume_discount_eur
  )
  VALUES (
    v_user_id, v_buyer_name, p_product_id, v_status, v_key_value,
    v_product.price_eur, v_discount, v_amount_due, v_gold_cost, v_rate,
    CASE WHEN v_paid THEN now() END,
    CASE WHEN v_status = 'delivered' THEN now() END,
    v_qty, v_volume_pct, v_volume_eur
  )
  RETURNING id, cancel_token INTO v_purchase_id, v_cancel_token;

  v_due_text := to_char(v_amount_due, 'FM999990.00') || ' €';

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    -- Só o convidado precisa do token (o membro cancela pela conta).
    'cancel_token', CASE WHEN v_user_id IS NULL THEN v_cancel_token END,
    'amount_due_eur', v_amount_due,
    'discount_eur', v_discount,
    'volume_discount_percent', v_volume_pct,
    'volume_discount_eur', v_volume_eur,
    'gold_spent', v_gold_cost,
    'paid', v_paid,
    'quantity', v_qty,
    'preorder', v_product.is_preorder,
    'digital_key', CASE WHEN v_paid THEN v_key_value END,
    'message', CASE
      WHEN v_product.is_preorder AND NOT v_paid
        THEN 'Reserva registada! Paga ' || v_due_text || ' em dinheiro a um coordenador do clube. Levantas o artigo quando chegar.'
      WHEN v_product.is_preorder
        THEN 'Reserva paga com Gold! Levantas o artigo quando chegar.'
      WHEN NOT v_paid AND v_product.type = 'digital'
        THEN 'Pedido registado! Paga ' || v_due_text || ' em dinheiro a um coordenador do clube para receberes a chave.'
      WHEN NOT v_paid
        THEN 'Pedido registado! Paga ' || v_due_text || ' em dinheiro a um coordenador do clube para levantares o artigo.'
      WHEN v_product.type = 'digital'
        THEN 'Compra concluída!'
      ELSE 'Pago com Gold! Levanta o artigo com um coordenador do clube.'
    END
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


--
-- Name: protect_gender_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_gender_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.gender IS NOT NULL
     AND NEW.gender IS DISTINCT FROM OLD.gender
     AND auth.uid() IS NOT NULL
     AND public.get_my_role() IS DISTINCT FROM 'coordenador' THEN
    NEW.gender := OLD.gender;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: protect_point_totals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_point_totals() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_xp integer;
  v_gold integer;
BEGIN
  -- SQL Editor / service role: sem restrições.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.total_xp IS NOT DISTINCT FROM OLD.total_xp
     AND NEW.current_gold IS NOT DISTINCT FROM OLD.current_gold THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount_xp), 0), COALESCE(SUM(amount_gold), 0)
    INTO v_xp, v_gold
    FROM public.points_log WHERE target_user_id = NEW.id;

  IF TG_OP = 'INSERT' THEN
    -- Perfil novo começa com os totais do histórico (normalmente 0).
    NEW.total_xp := v_xp;
    NEW.current_gold := v_gold;
    RETURN NEW;
  END IF;

  -- O recálculo feito pelo trigger do points_log dá sempre exatamente estes valores.
  IF NEW.total_xp IS DISTINCT FROM v_xp OR NEW.current_gold IS DISTINCT FROM v_gold THEN
    RAISE EXCEPTION 'Os totais de XP e Ouro só podem mudar através do histórico de pontos.';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: protect_role_columns(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_role_columns() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF (
        NEW.role               IS DISTINCT FROM OLD.role
     OR NEW.leadership_section IS DISTINCT FROM OLD.leadership_section
     OR NEW.helper_role        IS DISTINCT FROM OLD.helper_role
     OR NEW.helper_section     IS DISTINCT FROM OLD.helper_section
  )
  AND COALESCE(current_setting('app.allow_role_change', true), '') <> 'on'
  AND auth.uid() IS NOT NULL
  AND public.get_my_real_role() IS DISTINCT FROM 'coordenador'
  THEN
    RAISE EXCEPTION 'Sem permissão para alterar cargos.';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: record_event_invite(uuid, uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_event_invite(p_event_id uuid, p_user_id uuid, p_invited_by uuid, p_family boolean) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  INSERT INTO public.event_invites (event_id, user_id, invited_by, sent_to_family)
  VALUES (p_event_id, p_user_id, p_invited_by, p_family)
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET invited_by = EXCLUDED.invited_by,
        sent_to_family = EXCLUDED.sent_to_family,
        sent_count = public.event_invites.sent_count + 1,
        sent_at = now();
$$;


--
-- Name: refund_purchase(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refund_purchase(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purchase record;
  v_product_name text;
  v_type public.product_type;
  v_is_preorder boolean;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Apenas coordenadores podem realizar reembolsos.';
  END IF;

  SELECT * INTO v_purchase FROM public.store_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;
  IF v_purchase.status = 'refunded' THEN
    RAISE EXCEPTION 'Esta compra já foi reembolsada.';
  END IF;

  SELECT name, type, is_preorder INTO v_product_name, v_type, v_is_preorder
  FROM public.store_products WHERE id = v_purchase.product_id;

  -- 1. Devolver o Gold gasto no desconto (só membros registados)
  IF v_purchase.gold_spent > 0 AND v_purchase.user_id IS NOT NULL THEN
    INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
    VALUES (v_purchase.user_id, auth.uid(), 0, v_purchase.gold_spent, 'Reembolso de compra: ' || v_product_name);
  END IF;

  -- 2. Marcar como reembolsada
  UPDATE public.store_purchases
  SET status = 'refunded', updated_at = now()
  WHERE id = p_purchase_id;

  -- 3. Devolver stock (todas as unidades) se for físico com stock (não por encomenda)
  IF v_type = 'physical' AND NOT COALESCE(v_is_preorder, false) THEN
    UPDATE public.store_products SET stock = stock + COALESCE(v_purchase.quantity, 1) WHERE id = v_purchase.product_id;
  END IF;

  -- Nota: não "des-usamos" chaves digitais porque podem já ter sido vistas.
  -- (Uma encomenda digital por pagar já não tem chave.)
END;
$$;


--
-- Name: reset_all_points(text, boolean, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_all_points(p_label text, p_reset_xp boolean, p_reset_gold boolean, p_confirm text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_label text := btrim(COALESCE(p_label, ''));
  v_me_name text;
  v_season_id uuid;
  v_members integer;
  v_xp integer;
  v_gold integer;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Apenas a coordenação pode fazer reset de pontos.';
  END IF;
  IF p_confirm IS DISTINCT FROM 'RESETAR' THEN
    RAISE EXCEPTION 'Confirmação inválida.';
  END IF;
  IF NOT COALESCE(p_reset_xp, false) AND NOT COALESCE(p_reset_gold, false) THEN
    RAISE EXCEPTION 'Escolhe XP, Ouro ou ambos.';
  END IF;
  IF v_label = '' THEN
    RAISE EXCEPTION 'Dá um nome à época (ex.: Época 2026).';
  END IF;

  -- Evita dois resets seguidos por engano (duplo clique, dois coordenadores ao mesmo tempo).
  PERFORM pg_advisory_xact_lock(hashtext('reset_all_points'));
  IF EXISTS (SELECT 1 FROM public.points_seasons WHERE created_at > now() - interval '1 minute') THEN
    RAISE EXCEPTION 'Foi feito um reset há menos de um minuto.';
  END IF;

  SELECT full_name INTO v_me_name FROM public.profiles WHERE id = auth.uid();

  -- Saldos atuais a partir do histórico (fonte de verdade).
  SELECT count(*) FILTER (WHERE (p_reset_xp AND xp <> 0) OR (p_reset_gold AND gold <> 0)),
         COALESCE(SUM(xp) FILTER (WHERE p_reset_xp), 0),
         COALESCE(SUM(gold) FILTER (WHERE p_reset_gold), 0)
    INTO v_members, v_xp, v_gold
    FROM public.points_balances_from_log();

  IF v_members = 0 THEN
    RAISE EXCEPTION 'Não há pontos para fazer reset.';
  END IF;

  -- 1. Arquivo da época
  INSERT INTO public.points_seasons (label, reset_xp, reset_gold, performed_by, performed_by_name, members_count, total_xp_removed, total_gold_removed)
  VALUES (v_label, p_reset_xp, p_reset_gold, auth.uid(), v_me_name, v_members, v_xp, v_gold)
  RETURNING id INTO v_season_id;

  INSERT INTO public.points_season_standings (season_id, user_id, full_name, avatar_url, section, role, xp, gold, rank)
  SELECT v_season_id, b.user_id, b.full_name, b.avatar_url, b.section, b.role, b.xp, b.gold,
         CASE WHEN b.role = 'desbravador'
              THEN rank() OVER (PARTITION BY (b.role = 'desbravador') ORDER BY b.xp DESC) END
  FROM public.points_balances_from_log() b
  WHERE b.xp <> 0 OR b.gold <> 0;

  -- 2. Movimentos de compensação (o trigger on_points_log_change põe os totais a 0)
  INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
  SELECT b.user_id, auth.uid(),
         CASE WHEN p_reset_xp THEN -b.xp ELSE 0 END,
         CASE WHEN p_reset_gold THEN -b.gold ELSE 0 END,
         'Reset de pontos: ' || v_label
  FROM public.points_balances_from_log() b
  WHERE (p_reset_xp AND b.xp <> 0) OR (p_reset_gold AND b.gold <> 0);

  RETURN json_build_object('season_id', v_season_id, 'members', v_members, 'xp', v_xp, 'gold', v_gold);
END;
$$;


--
-- Name: resolve_announcement_recipients(uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_announcement_recipients(p_target_user_id uuid, p_target_section text, p_target_role text, p_author_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE CASE
    WHEN p_target_user_id IS NOT NULL THEN
      p.id = p_target_user_id
    WHEN p_target_role = 'desbravador' THEN
      p.role = 'desbravador'
      AND (p_target_section IS NULL OR p.section::text = p_target_section)
    WHEN p_target_role IS NOT NULL THEN
      COALESCE(p.helper_role, p.role)::text = p_target_role
      AND (p_target_section IS NULL OR COALESCE(p.helper_section, p.leadership_section)::text = p_target_section)
    WHEN p_target_section IS NOT NULL THEN
      p.section::text = p_target_section
      OR (COALESCE(p.helper_role, p.role) = 'dirigente'
          AND COALESCE(p.helper_section, p.leadership_section)::text = p_target_section)
    ELSE true
  END
  AND (p_target_user_id IS NOT NULL OR p_author_id IS NULL OR p.id <> p_author_id);
$$;


--
-- Name: revert_event_points(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revert_event_points(p_event_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_role text := public.get_my_role();
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado.';
  END IF;

  -- Apenas coordenador, ou dirigente da secção-alvo do evento (mesma regra da gestão de eventos)
  IF NOT COALESCE(
    v_role = 'coordenador'
    OR (v_role = 'dirigente' AND v_event.target_section = public.get_my_leadership_section()),
    false
  ) THEN
    RAISE EXCEPTION 'Sem permissão para reverter este evento.';
  END IF;

  -- 1. Remover os pontos atribuídos por este evento.
  --    O gatilho on_points_log_change recalcula automaticamente os totais dos perfis.
  DELETE FROM public.points_log WHERE event_id = p_event_id;

  -- 2. Marcar presenças como não atribuídas (mantém o estado presente/atrasado/faltou para correção)
  UPDATE public.event_attendance
  SET points_awarded = false, awarded_at = NULL, updated_at = now()
  WHERE event_id = p_event_id;

  -- 3. Reabrir o evento
  UPDATE public.events
  SET is_finished = false, updated_at = now()
  WHERE id = p_event_id;
END;
$$;


--
-- Name: section_label(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.section_label(s text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE s
    WHEN 'rebentos'     THEN 'Rebentos'
    WHEN 'ticoes'       THEN 'Tições'
    WHEN 'exploradores' THEN 'Exploradores'
    WHEN 'companheiros' THEN 'Companheiros'
    WHEN 'embaixadores' THEN 'Embaixadores'
    ELSE initcap(s)
  END;
$$;


--
-- Name: section_rank(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.section_rank(s text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE s
    WHEN 'rebentos' THEN 1 WHEN 'ticoes' THEN 2 WHEN 'exploradores' THEN 3
    WHEN 'companheiros' THEN 4 WHEN 'embaixadores' THEN 5 ELSE 0
  END;
$$;


--
-- Name: send_announcement(text, text, text, text, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_announcement(p_title text, p_message text, p_audience text, p_section text DEFAULT NULL::text, p_member_ids uuid[] DEFAULT NULL::uuid[]) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role text := public.get_my_role();
  v_lead text;
  v_author_name text;
  v_title text := btrim(COALESCE(p_title, ''));
  v_message text := btrim(COALESCE(p_message, ''));
  v_target_user uuid;
  v_target_section text;
  v_target_role text;
  v_audience text := p_audience;
  v_n_members int := COALESCE(array_length(p_member_ids, 1), 0);
  v_id uuid;
  v_count int;
BEGIN
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('dirigente', 'coordenador') THEN
    RAISE EXCEPTION 'Sem permissão para enviar comunicados.';
  END IF;
  IF v_title = '' OR v_message = '' THEN
    RAISE EXCEPTION 'Preenche o título e a mensagem.';
  END IF;
  IF p_section IS NOT NULL THEN
    PERFORM p_section::public.app_section; -- valida a classe
  END IF;

  SELECT full_name, COALESCE(helper_section, leadership_section, section)::text
    INTO v_author_name, v_lead
    FROM public.profiles WHERE id = auth.uid();

  -- Dirigentes: só a própria classe ou membros dela.
  IF v_role = 'dirigente' THEN
    IF p_audience NOT IN ('section', 'members') THEN
      RAISE EXCEPTION 'Só podes enviar para a tua classe ou para membros dela.';
    END IF;
    IF p_audience = 'section' AND p_section IS DISTINCT FROM v_lead THEN
      RAISE EXCEPTION 'Só podes enviar para a tua classe.';
    END IF;
    IF p_audience = 'members' AND EXISTS (
      SELECT 1 FROM unnest(p_member_ids) AS m(id)
      LEFT JOIN public.profiles p ON p.id = m.id
      WHERE p.id IS NULL OR p.section::text <> v_lead
    ) THEN
      RAISE EXCEPTION 'Só podes enviar para membros da tua classe.';
    END IF;
  END IF;

  CASE p_audience
    WHEN 'global' THEN
      NULL;
    WHEN 'desbravadores' THEN
      v_target_role := 'desbravador';
    WHEN 'dirigentes' THEN
      v_target_role := 'dirigente';
    WHEN 'section' THEN
      IF p_section IS NULL THEN RAISE EXCEPTION 'Escolhe uma classe.'; END IF;
      v_target_section := p_section;
    WHEN 'section_leaders' THEN
      IF p_section IS NULL THEN RAISE EXCEPTION 'Escolhe uma classe.'; END IF;
      v_target_role := 'dirigente';
      v_target_section := p_section;
    WHEN 'members' THEN
      IF v_n_members = 0 THEN RAISE EXCEPTION 'Escolhe pelo menos um membro.'; END IF;
      IF v_n_members = 1 THEN
        v_target_user := p_member_ids[1];
        v_audience := 'member';
      END IF;
    ELSE
      RAISE EXCEPTION 'Destinatário inválido.';
  END CASE;

  INSERT INTO public.announcements (author_id, author_name, title, message, target_user_id, target_section, target_role, audience)
  VALUES (auth.uid(), v_author_name, left(v_title, 120), left(v_message, 2000), v_target_user, v_target_section, v_target_role, v_audience)
  RETURNING id INTO v_id;

  IF v_audience = 'members' THEN
    INSERT INTO public.announcement_recipients (announcement_id, user_id)
    SELECT v_id, p.id FROM public.profiles p WHERE p.id = ANY(p_member_ids)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT count(*) INTO v_count FROM public.announcement_recipients WHERE announcement_id = v_id;
  RETURN json_build_object('id', v_id, 'recipients', v_count);
END;
$$;


--
-- Name: set_event_rsvp(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_event_rsvp(p_event_id uuid, p_going boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entra outra vez.';
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado.';
  END IF;

  IF NOT v_event.rsvp_enabled THEN
    RAISE EXCEPTION 'Este evento não pede confirmação de presença.';
  END IF;

  IF v_event.is_finished OR now() >= COALESCE(v_event.rsvp_deadline, v_event.start_at) THEN
    RAISE EXCEPTION 'O prazo para responder já terminou.';
  END IF;

  -- Evento de uma secção: só os membros dessa secção (ou os seus dirigentes/ajudantes).
  IF v_event.target_section IS NOT NULL
     AND v_event.target_section::text IS DISTINCT FROM public.get_my_section()
     AND v_event.target_section::text IS DISTINCT FROM public.get_my_leadership_section() THEN
    RAISE EXCEPTION 'Este evento não é para a tua secção.';
  END IF;

  INSERT INTO public.event_rsvps (event_id, user_id, going)
  VALUES (p_event_id, v_uid, p_going)
  ON CONFLICT (event_id, user_id)
  DO UPDATE SET going = EXCLUDED.going, updated_at = now();
END;
$$;


--
-- Name: set_event_rsvp_for_member(uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_event_rsvp_for_member(p_event_id uuid, p_user_id uuid, p_going boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_role text := public.get_my_role();
  v_member_section text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entra outra vez.';
  END IF;

  IF COALESCE(v_role, '') NOT IN ('coordenador', 'dirigente') THEN
    RAISE EXCEPTION 'Sem permissão para responder por um membro.';
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado.';
  END IF;

  IF NOT v_event.rsvp_enabled THEN
    RAISE EXCEPTION 'Este evento não pede confirmação de presença.';
  END IF;

  IF v_event.is_finished THEN
    RAISE EXCEPTION 'Este evento já foi finalizado.';
  END IF;

  SELECT section::text INTO v_member_section FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membro não encontrado.';
  END IF;

  -- O membro tem de fazer parte do público-alvo do evento.
  IF v_event.target_section IS NOT NULL
     AND v_member_section IS DISTINCT FROM v_event.target_section::text THEN
    RAISE EXCEPTION 'Este membro não faz parte do público deste evento.';
  END IF;

  -- O dirigente (incluindo ajudante de dirigente) fica limitado à sua classe.
  IF v_role = 'dirigente'
     AND v_member_section IS DISTINCT FROM public.get_my_leadership_section() THEN
    RAISE EXCEPTION 'Só podes responder por membros da tua secção.';
  END IF;

  -- Não substitui o que o próprio membro já respondeu.
  PERFORM 1
  FROM public.event_rsvps
  WHERE event_id = p_event_id AND user_id = p_user_id;
  IF FOUND THEN
    RAISE EXCEPTION 'Este membro já respondeu.';
  END IF;

  INSERT INTO public.event_rsvps (event_id, user_id, going)
  VALUES (p_event_id, p_user_id, p_going);
END;
$$;


--
-- Name: set_member_invested(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_member_invested(p_member_id uuid, p_invested boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_section text;
BEGIN
  SELECT section::text INTO v_section FROM public.profiles WHERE id = p_member_id;
  IF v_section IS NULL THEN
    RAISE EXCEPTION 'Membro não encontrado.';
  END IF;

  IF NOT COALESCE(
    public.get_my_role() = 'coordenador'
    OR (public.get_my_role() = 'dirigente' AND v_section = public.get_my_leadership_section()),
    false
  ) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a investidura deste membro.';
  END IF;

  UPDATE public.profiles SET is_invested = p_invested WHERE id = p_member_id;
END;
$$;


--
-- Name: store_volume_discount_percent(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.store_volume_discount_percent(p_quantity integer) RETURNS numeric
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_quantity >= 10 THEN 10
    WHEN p_quantity >= 5 THEN 5
    ELSE 0
  END::numeric;
$$;


--
-- Name: transfer_gold(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transfer_gold(recipient_id uuid, amount integer, transfer_description text DEFAULT 'Transferência de Gold'::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  sender_id uuid := auth.uid();
  sender_gold integer;
  recipient_name text;
  sender_name text;
BEGIN
  -- 1. Validações iniciais
  IF amount <= 0 THEN
    RAISE EXCEPTION 'O valor da transferência deve ser superior a zero.';
  END IF;

  IF sender_id = recipient_id THEN
    RAISE EXCEPTION 'Não podes transferir Gold para ti mesmo.';
  END IF;

  -- 2. Verificar saldo do remetente
  SELECT current_gold, full_name INTO sender_gold, sender_name FROM public.profiles WHERE id = sender_id;
  
  IF sender_gold < amount THEN
    RAISE EXCEPTION 'Saldo insuficiente. Tens apenas % 🪙.', sender_gold;
  END IF;

  -- 3. Obter nome do destinatário para o log
  SELECT full_name INTO recipient_name FROM public.profiles WHERE id = recipient_id;
  IF recipient_name IS NULL THEN
    RAISE EXCEPTION 'Destinatário não encontrado.';
  END IF;

  -- 4. Registar a saída (Remetente)
  INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
  VALUES (sender_id, sender_id, 0, -amount, transfer_description || ' para ' || recipient_name);

  -- 5. Registar a entrada (Destinatário)
  INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
  VALUES (recipient_id, sender_id, 0, amount, transfer_description || ' de ' || sender_name);

  -- O gatilho 'on_points_log_change' tratará de atualizar os totais em 'public.profiles' automaticamente.
END;
$$;


--
-- Name: update_profile_totals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_profile_totals() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  uid uuid;
BEGIN
  -- Identificar o utilizador afetado
  IF (TG_OP = 'DELETE') THEN
    uid := OLD.target_user_id;
  ELSE
    uid := NEW.target_user_id;
  END IF;

  -- Recalcular totais baseados no histórico real
  UPDATE public.profiles
  SET 
    total_xp = COALESCE((SELECT SUM(amount_xp) FROM public.points_log WHERE target_user_id = uid), 0),
    current_gold = COALESCE((SELECT SUM(amount_gold) FROM public.points_log WHERE target_user_id = uid), 0),
    updated_at = now()
  WHERE id = uid;

  -- Se o target_user_id mudou num UPDATE (raro), atualizar também o utilizador antigo
  IF (TG_OP = 'UPDATE' AND OLD.target_user_id IS DISTINCT FROM NEW.target_user_id) THEN
    UPDATE public.profiles
    SET 
      total_xp = COALESCE((SELECT SUM(amount_xp) FROM public.points_log WHERE target_user_id = OLD.target_user_id), 0),
      current_gold = COALESCE((SELECT SUM(amount_gold) FROM public.points_log WHERE target_user_id = OLD.target_user_id), 0),
      updated_at = now()
    WHERE id = OLD.target_user_id;
  END IF;

  IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;


--
-- Name: vana_codigo_day_start(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vana_codigo_day_start() RETURNS timestamp with time zone
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT ((now() AT TIME ZONE 'Europe/Lisbon')::date)::timestamp AT TIME ZONE 'Europe/Lisbon';
$$;


--
-- Name: vanacamp_check_bot_in_test_session(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanacamp_check_bot_in_test_session() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.is_bot = true THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vanacamp_sessions s
      WHERE s.id = NEW.session_id AND s.is_test_session = true
    ) THEN
      RAISE EXCEPTION 'Bots só podem ser adicionados a sessões marcadas como teste.';
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


--
-- Name: vanacamp_get_my_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanacamp_get_my_role(p_session_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT role
  FROM public.vanacamp_players
  WHERE session_id = p_session_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;


--
-- Name: vanacamp_is_dead_player(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanacamp_is_dead_player(p_session_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vanacamp_players
    WHERE session_id = p_session_id
      AND user_id = auth.uid()
      AND is_alive = false
  );
$$;


--
-- Name: vanacamp_is_host(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanacamp_is_host(p_session_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vanacamp_sessions
    WHERE id = p_session_id AND host_id = auth.uid()
  );
$$;


--
-- Name: vanacamp_is_infiltrator(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanacamp_is_infiltrator(p_session_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vanacamp_players
    WHERE session_id = p_session_id
      AND user_id = auth.uid()
      AND role = 'infiltrator'
      AND is_alive = true
  );
$$;


--
-- Name: vanacoro_answers_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanacoro_answers_limit() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_key uuid := coalesce(NEW.profile_id, NEW.guest_id);
  v_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.question_id::text || ':' || v_key::text, 0));
  SELECT count(*) INTO v_count
  FROM public.vanacoro_answers
  WHERE question_id = NEW.question_id AND respondent_key = v_key;
  IF v_count >= 3 THEN
    RAISE EXCEPTION 'max_answers' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: vanacoro_apply_groups(uuid, jsonb, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanacoro_apply_groups(p_question_id uuid, p_groups jsonb, p_replace boolean) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  g jsonb;
  v_group uuid;
  v_count int := 0;
BEGIN
  IF p_replace THEN
    DELETE FROM public.vanacoro_groups
    WHERE question_id = p_question_id AND source IN ('auto', 'ai');
  END IF;

  FOR g IN SELECT * FROM jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) LOOP
    v_group := NULL;
    IF nullif(g->>'existing_group_id', '') IS NOT NULL THEN
      SELECT id INTO v_group FROM public.vanacoro_groups
      WHERE id = (g->>'existing_group_id')::uuid AND question_id = p_question_id;
    END IF;

    IF v_group IS NULL THEN
      INSERT INTO public.vanacoro_groups (question_id, label, emoji, hidden, source)
      VALUES (
        p_question_id,
        left(coalesce(nullif(trim(g->>'label'), ''), '?'), 40),
        nullif(left(coalesce(g->>'emoji', ''), 16), ''),
        coalesce((g->>'hidden')::boolean, false),
        CASE WHEN g->>'source' = 'ai' THEN 'ai' ELSE 'auto' END
      )
      RETURNING id INTO v_group;
      v_count := v_count + 1;
    END IF;

    UPDATE public.vanacoro_answers a
    SET group_id = v_group
    WHERE a.question_id = p_question_id
      AND a.id IN (SELECT jsonb_array_elements_text(coalesce(g->'answer_ids', '[]'::jsonb))::uuid)
      AND (a.group_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.vanacoro_groups m WHERE m.id = a.group_id AND m.source = 'manual'
      ));
  END LOOP;

  -- Grupos automáticos que ficaram vazios não interessam a ninguém.
  DELETE FROM public.vanacoro_groups gr
  WHERE gr.question_id = p_question_id AND gr.source <> 'manual'
    AND NOT EXISTS (SELECT 1 FROM public.vanacoro_answers a WHERE a.group_id = gr.id);

  UPDATE public.vanacoro_questions
  SET review_status = 'grouped'
  WHERE id = p_question_id AND review_status = 'pending';

  RETURN v_count;
END;
$$;


--
-- Name: vanacoro_bump(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanacoro_bump(p_session_id uuid) RETURNS void
    LANGUAGE sql
    SET search_path TO 'public'
    AS $$
  UPDATE public.vanacoro_sessions SET board_version = board_version + 1 WHERE id = p_session_id;
$$;


--
-- Name: vanacoro_freeze_board(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanacoro_freeze_board(p_question_id uuid, p_entries jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.vanacoro_questions WHERE id = p_question_id AND used_at IS NOT NULL) THEN
    RAISE EXCEPTION 'already_played';
  END IF;

  DELETE FROM public.vanacoro_board_entries WHERE question_id = p_question_id;

  INSERT INTO public.vanacoro_board_entries (question_id, rank, label, emoji, respondents, points)
  SELECT p_question_id, (e->>'rank')::int, e->>'label', nullif(e->>'emoji', ''),
         (e->>'respondents')::int, (e->>'points')::int
  FROM jsonb_array_elements(p_entries) e;

  UPDATE public.vanacoro_questions
  SET review_status = 'ready', ready_at = now()
  WHERE id = p_question_id;
END;
$$;


--
-- Name: vanacoro_question_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanacoro_question_stats() RETURNS TABLE(question_id uuid, respondents bigint, answers bigint, guest_respondents bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT a.question_id,
         count(DISTINCT a.respondent_key),
         count(*),
         count(DISTINCT a.guest_id)
  FROM public.vanacoro_answers a
  WHERE NOT a.hidden
  GROUP BY a.question_id;
$$;


--
-- Name: vanacoro_save_round(uuid, uuid, bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanacoro_save_round(p_session_id uuid, p_round_id uuid, p_last_event_id bigint, p_state jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
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
      faceoff_turn = nullif(p_state->>'faceoff_turn', ''),
      faceoff_first_team = nullif(p_state->>'faceoff_first_team', ''),
      faceoff_first_rank = (p_state->>'faceoff_first_rank')::int,
      team_a_score = v_a,
      team_b_score = v_b,
      board_version = board_version + 1
  WHERE id = p_session_id;
END;
$$;


--
-- Name: vanacoro_unfreeze_board(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanacoro_unfreeze_board(p_question_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.vanacoro_questions WHERE id = p_question_id AND used_at IS NOT NULL) THEN
    RAISE EXCEPTION 'already_played';
  END IF;
  DELETE FROM public.vanacoro_board_entries WHERE question_id = p_question_id;
  UPDATE public.vanacoro_questions
  SET review_status = 'grouped', ready_at = NULL
  WHERE id = p_question_id;
END;
$$;


--
-- Name: vanaespada_begin_round(uuid, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanaespada_begin_round(p_session_id uuid, p_round_index integer, p_force boolean DEFAULT false) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: vanaespada_close_round(uuid, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanaespada_close_round(p_session_id uuid, p_round_index integer, p_force boolean DEFAULT false) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: vanaespada_finish_session(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanaespada_finish_session(p_session_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.vanaespada_sessions
  SET status = 'finished', phase_ends_at = NULL, ended_at = now()
  WHERE id = p_session_id AND status <> 'finished';
  RETURN FOUND;
END;
$$;


--
-- Name: vanaespada_open_round(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanaespada_open_round(p_session_id uuid, p_round_index integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: vanaespada_show_leaderboard(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanaespada_show_leaderboard(p_session_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.vanaespada_sessions
  SET status = 'leaderboard', phase_started_at = now(), phase_ends_at = NULL
  WHERE id = p_session_id AND status = 'round_reveal';
  RETURN FOUND;
END;
$$;


--
-- Name: vanaespada_sync_answered(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanaespada_sync_answered(p_session_id uuid, p_round_index integer) RETURNS TABLE(answered integer, players integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: vanasketch_add_score(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanasketch_add_score(p_player_id uuid, p_delta integer) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE public.vanasketch_players SET score = score + p_delta WHERE id = p_player_id;
$$;


--
-- Name: vanasketch_check_bot(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanasketch_check_bot() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.is_bot = true THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vanasketch_sessions s
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: vanatrilha_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanatrilha_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station smallint NOT NULL,
    category text NOT NULL,
    difficulty text NOT NULL,
    prompt text NOT NULL,
    options jsonb NOT NULL,
    correct_index smallint NOT NULL,
    reference text,
    explanation text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vanatrilha_questions_category_check CHECK ((category = ANY (ARRAY['personagens'::text, 'lugares'::text, 'numeros'::text, 'milagres'::text, 'versiculos'::text]))),
    CONSTRAINT vanatrilha_questions_correct_index_check CHECK (((correct_index >= 0) AND (correct_index <= 3))),
    CONSTRAINT vanatrilha_questions_difficulty_check CHECK ((difficulty = ANY (ARRAY['facil'::text, 'media'::text, 'dificil'::text]))),
    CONSTRAINT vanatrilha_questions_explanation_check CHECK ((length(btrim(explanation)) > 0)),
    CONSTRAINT vanatrilha_questions_options_len CHECK (((jsonb_typeof(options) = 'array'::text) AND (jsonb_array_length(options) = 4))),
    CONSTRAINT vanatrilha_questions_prompt_check CHECK ((length(btrim(prompt)) > 0)),
    CONSTRAINT vanatrilha_questions_station_check CHECK (((station >= 1) AND (station <= 7)))
);


--
-- Name: vanatrilha_daily_questions(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanatrilha_daily_questions(p_date date) RETURNS SETOF public.vanatrilha_questions
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: vanatrilha_station_of_day(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanatrilha_station_of_day(p_date date) RETURNS smallint
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT (((((p_date - DATE '2026-01-01') % 7) + 7) % 7) + 1)::smallint;
$$;


--
-- Name: vanatrilha_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanatrilha_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: vanawords_check_bot(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vanawords_check_bot() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: announcement_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcement_recipients (
    announcement_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    author_id uuid,
    title text NOT NULL,
    message text NOT NULL,
    target_user_id uuid,
    target_section text,
    target_role text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    audience text,
    author_name text
);


--
-- Name: club_families; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.club_families (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT club_families_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 40)))
);


--
-- Name: club_family_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.club_family_invites (
    family_id uuid NOT NULL,
    code text NOT NULL,
    created_by uuid,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: club_family_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.club_family_members (
    family_id uuid NOT NULL,
    user_id uuid NOT NULL,
    kind text DEFAULT 'adult'::text NOT NULL,
    managed boolean DEFAULT false NOT NULL,
    added_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT club_family_members_kind_check CHECK ((kind = ANY (ARRAY['adult'::text, 'child'::text])))
);


--
-- Name: club_screens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.club_screens (
    host_id uuid NOT NULL,
    state jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: digital_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.digital_keys (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    product_id uuid NOT NULL,
    key_value text NOT NULL,
    is_used boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: digital_key_stock; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.digital_key_stock AS
 SELECT product_id,
    (count(*) FILTER (WHERE (is_used = false)))::integer AS available
   FROM public.digital_keys
  GROUP BY product_id;


--
-- Name: email_opt_outs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_opt_outs (
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_attendance (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status public.attendance_status DEFAULT 'presente'::public.attendance_status NOT NULL,
    points_awarded boolean DEFAULT false NOT NULL,
    awarded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    checkin_at timestamp with time zone
);


--
-- Name: event_guests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_guests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    name text NOT NULL,
    secret uuid DEFAULT gen_random_uuid() NOT NULL,
    ip_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_guests_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 40)))
);


--
-- Name: event_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_invites (
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    invited_by uuid,
    sent_to_family boolean DEFAULT false NOT NULL,
    sent_count integer DEFAULT 1 NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_rsvps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_rsvps (
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    going boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    description text,
    location text,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone,
    target_section text,
    xp_reward integer DEFAULT 0 NOT NULL,
    gold_reward integer DEFAULT 0 NOT NULL,
    late_discount_percent double precision DEFAULT 0.25 NOT NULL,
    absent_penalty_percent double precision DEFAULT 0 NOT NULL,
    created_by uuid,
    is_finished boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    rsvp_enabled boolean DEFAULT false NOT NULL,
    rsvp_deadline timestamp with time zone,
    location_lat double precision,
    location_lng double precision,
    is_online boolean DEFAULT false NOT NULL,
    online_url text,
    guests_count integer,
    CONSTRAINT events_location_coords_check CHECK ((((location_lat IS NULL) AND (location_lng IS NULL)) OR (((location_lat >= ('-90'::integer)::double precision) AND (location_lat <= (90)::double precision)) AND ((location_lng >= ('-180'::integer)::double precision) AND (location_lng <= (180)::double precision))))),
    CONSTRAINT events_online_url_check CHECK (((online_url IS NULL) OR (is_online AND (online_url ~* '^https?://\S+$'::text) AND (length(online_url) <= 2000))))
);


--
-- Name: family_account_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.family_account_links (
    owner_user_id uuid NOT NULL,
    associated_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT family_account_links_different_users CHECK ((owner_user_id <> associated_user_id))
);


--
-- Name: family_account_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.family_account_requests (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    owner_user_id uuid NOT NULL,
    code text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    accepted_by_user_id uuid,
    CONSTRAINT family_account_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])))
);


--
-- Name: game_plays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_plays (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id text NOT NULL,
    user_id uuid NOT NULL,
    mode text NOT NULL,
    play_date date NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    is_finished boolean DEFAULT false NOT NULL,
    is_won boolean DEFAULT false NOT NULL,
    attempts integer,
    CONSTRAINT game_plays_game_id_check CHECK ((game_id = ANY (ARRAY['vantur'::text, 'vana-codigo'::text, 'vana-trilha'::text, 'vana-sentinela'::text])))
);


--
-- Name: game_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_settings (
    game_id text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    allowed_roles text[] DEFAULT ARRAY['desbravador'::text, 'dirigente'::text, 'coordenador'::text] NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    hidden boolean DEFAULT false NOT NULL,
    points_multiplier numeric(4,2) DEFAULT 1 NOT NULL,
    multiplier_starts_at timestamp with time zone,
    multiplier_ends_at timestamp with time zone,
    CONSTRAINT game_settings_multiplier_range CHECK (((points_multiplier >= (1)::numeric) AND (points_multiplier <= (10)::numeric))),
    CONSTRAINT game_settings_roles_not_empty CHECK ((cardinality(allowed_roles) > 0)),
    CONSTRAINT game_settings_roles_valid CHECK ((allowed_roles <@ ARRAY['desbravador'::text, 'dirigente'::text, 'coordenador'::text]))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    avatar_url text,
    birth_date date,
    role public.app_role DEFAULT 'desbravador'::public.app_role NOT NULL,
    section public.app_section DEFAULT 'rebentos'::public.app_section NOT NULL,
    leadership_section public.app_section,
    total_xp integer DEFAULT 0 NOT NULL,
    current_gold integer DEFAULT 0 NOT NULL,
    is_invested boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    helper_role public.app_role,
    helper_section public.app_section,
    dismissed_section_suggestion public.app_section,
    gender text,
    CONSTRAINT profiles_gender_check CHECK ((gender = ANY (ARRAY['m'::text, 'f'::text])))
);


--
-- Name: leaderboard; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.leaderboard AS
 SELECT id,
    full_name,
    avatar_url,
        CASE
            WHEN (role = 'dirigente'::public.app_role) THEN COALESCE(leadership_section, section)
            ELSE section
        END AS section,
    role,
    total_xp,
    current_gold,
    (total_xp + current_gold) AS combined_score,
    is_invested
   FROM public.profiles
  WHERE ((role = ANY (ARRAY['desbravador'::public.app_role, 'dirigente'::public.app_role])) AND (NOT public.is_hidden_from_ranking(full_name)))
  ORDER BY total_xp DESC;


--
-- Name: VIEW leaderboard; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.leaderboard IS 'Public view for the club leaderboard: desbravadores and dirigentes (not coordenadores), without test accounts or accounts that only have an email.';


--
-- Name: points_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.points_log (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    target_user_id uuid NOT NULL,
    awarded_by_user_id uuid DEFAULT auth.uid(),
    amount_xp integer DEFAULT 0 NOT NULL,
    amount_gold integer DEFAULT 0 NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event_id uuid
);


--
-- Name: points_audit; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.points_audit WITH (security_invoker='true') AS
 SELECT id,
    created_at,
    target_user_id,
    target_name,
    target_avatar,
    target_section,
    target_role,
    awarded_by_user_id,
    awarded_by_name,
    awarded_by_role,
    awarded_by_real_role,
    awarded_by_helper_role,
    awarded_by_helper_section,
    amount_xp,
    amount_gold,
    description,
    event_id,
    is_self,
    category,
    ((is_self AND (awarded_by_real_role IS DISTINCT FROM 'coordenador'::text) AND (category = ANY (ARRAY['manual'::text, 'tarefa'::text, 'evento'::text, 'sugestao'::text]))) OR (category = 'outro'::text)) AS is_suspicious
   FROM ( SELECT x.id,
            x.created_at,
            x.target_user_id,
            x.target_name,
            x.target_avatar,
            x.target_section,
            x.target_role,
            x.awarded_by_user_id,
            x.awarded_by_name,
            x.awarded_by_role,
            x.awarded_by_real_role,
            x.awarded_by_helper_role,
            x.awarded_by_helper_section,
            x.amount_xp,
            x.amount_gold,
            x.description,
            x.event_id,
            x.is_self,
                CASE
                    WHEN (x.is_self AND (x.awarded_by_real_role = 'coordenador'::text) AND (x.base_category = ANY (ARRAY['manual'::text, 'sugestao'::text, 'outro'::text]))) THEN 'auto'::text
                    ELSE x.base_category
                END AS category
           FROM ( SELECT pl.id,
                    pl.created_at,
                    pl.target_user_id,
                    t.full_name AS target_name,
                    t.avatar_url AS target_avatar,
                    (t.section)::text AS target_section,
                    (t.role)::text AS target_role,
                    pl.awarded_by_user_id,
                    a.full_name AS awarded_by_name,
                    (COALESCE(a.helper_role, a.role))::text AS awarded_by_role,
                    (a.role)::text AS awarded_by_real_role,
                    (a.helper_role)::text AS awarded_by_helper_role,
                    (a.helper_section)::text AS awarded_by_helper_section,
                    pl.amount_xp,
                    pl.amount_gold,
                    pl.description,
                    pl.event_id,
                    ((pl.awarded_by_user_id IS NOT NULL) AND (pl.awarded_by_user_id = pl.target_user_id)) AS is_self,
                        CASE
                            WHEN (pl.description ~~* 'Reset de pontos%'::text) THEN 'reset'::text
                            WHEN (pl.event_id IS NOT NULL) THEN 'evento'::text
                            WHEN (pl.description ~~* 'Tarefa concluída%'::text) THEN 'tarefa'::text
                            WHEN ((pl.description ~~* 'Resgate de código%'::text) OR (pl.description ~~* 'Questão resolvida%'::text)) THEN 'qr'::text
                            WHEN (pl.description ~~* 'Recompensa por sugestão%'::text) THEN 'sugestao'::text
                            WHEN (pl.description ~~* 'Resposta a inquérito%'::text) THEN 'inquerito'::text
                            WHEN ((pl.description ~~* 'Compra na Loja%'::text) OR (pl.description ~~* 'Desconto na Loja%'::text) OR (pl.description ~~* 'Reembolso de compra%'::text)) THEN 'loja'::text
                            WHEN (pl.description ~~* 'Transferência%'::text) THEN 'transferencia'::text
                            WHEN (pl.description ~~* 'Pergunta da Semana%'::text) THEN 'pergunta'::text
                            WHEN ((pl.description ~~* 'Vantur%'::text) OR (pl.description ~~* 'Vana%'::text) OR (pl.description ~~* '%VanaWords%'::text) OR (pl.description ~~* '%VanaSketch%'::text)) THEN 'jogo'::text
                            WHEN ((COALESCE(a.helper_role, a.role))::text = ANY (ARRAY['dirigente'::text, 'coordenador'::text])) THEN 'manual'::text
                            ELSE 'outro'::text
                        END AS base_category
                   FROM ((public.points_log pl
                     LEFT JOIN public.profiles t ON ((t.id = pl.target_user_id)))
                     LEFT JOIN public.profiles a ON ((a.id = pl.awarded_by_user_id)))) x) y;


--
-- Name: points_audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.points_audit_events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    action text NOT NULL,
    log_id uuid,
    target_user_id uuid,
    target_name text,
    performed_by uuid,
    performed_by_name text,
    old_xp integer,
    old_gold integer,
    new_xp integer,
    new_gold integer,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: points_season_standings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.points_season_standings (
    season_id uuid NOT NULL,
    user_id uuid NOT NULL,
    full_name text,
    avatar_url text,
    section text,
    role text,
    xp integer NOT NULL,
    gold integer NOT NULL,
    rank integer
);


--
-- Name: points_seasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.points_seasons (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    label text NOT NULL,
    reset_xp boolean NOT NULL,
    reset_gold boolean NOT NULL,
    performed_by uuid,
    performed_by_name text,
    members_count integer DEFAULT 0 NOT NULL,
    total_xp_removed integer DEFAULT 0 NOT NULL,
    total_gold_removed integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: portuguese_words; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portuguese_words (
    word_clean text NOT NULL,
    word_display text NOT NULL
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: qr_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qr_codes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    content text,
    xp_reward integer DEFAULT 0 NOT NULL,
    gold_reward integer DEFAULT 0 NOT NULL,
    auto_claim boolean DEFAULT true NOT NULL,
    max_uses_global integer,
    is_question boolean DEFAULT false NOT NULL,
    correct_answers text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE qr_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.qr_codes IS 'Stores dynamic QR codes / short codes for reward attribution.';


--
-- Name: qr_scans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qr_scans (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    qr_code_id uuid NOT NULL,
    user_id uuid NOT NULL,
    points_awarded boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE qr_scans; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.qr_scans IS 'Tracks which users have redeemed which codes.';


--
-- Name: raffle_screens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.raffle_screens (
    host_id uuid NOT NULL,
    state jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: section_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.section_changes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    from_section public.app_section,
    to_section public.app_section NOT NULL,
    changed_by uuid,
    reason text DEFAULT 'manual'::text NOT NULL,
    investiture_reset boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: store_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_products (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    price integer DEFAULT 0 NOT NULL,
    type public.product_type NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    image_url text,
    restrictions jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    min_level integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    price_eur numeric(10,2) DEFAULT 0 NOT NULL,
    max_discount_percent integer DEFAULT 0 NOT NULL,
    is_preorder boolean DEFAULT false NOT NULL,
    preorder_deadline timestamp with time zone,
    cost_price numeric,
    CONSTRAINT store_products_cost_price_check CHECK (((cost_price IS NULL) OR (cost_price >= (0)::numeric))),
    CONSTRAINT store_products_max_discount_check CHECK (((max_discount_percent >= 0) AND (max_discount_percent <= 100))),
    CONSTRAINT store_products_min_level_check CHECK ((min_level >= 0)),
    CONSTRAINT store_products_preorder_physical_check CHECK (((NOT is_preorder) OR (type = 'physical'::public.product_type))),
    CONSTRAINT store_products_price_check CHECK ((price >= 0)),
    CONSTRAINT store_products_price_eur_check CHECK ((price_eur >= (0)::numeric))
);


--
-- Name: store_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_purchases (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    product_id uuid NOT NULL,
    status public.purchase_status DEFAULT 'pending'::public.purchase_status NOT NULL,
    digital_key_delivered text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    buyer_name text,
    price_eur numeric(10,2) DEFAULT 0 NOT NULL,
    discount_eur numeric(10,2) DEFAULT 0 NOT NULL,
    amount_due_eur numeric(10,2) DEFAULT 0 NOT NULL,
    gold_spent integer DEFAULT 0 NOT NULL,
    gold_rate numeric,
    paid_at timestamp with time zone,
    delivered_at timestamp with time zone,
    quantity integer DEFAULT 1 NOT NULL,
    cancel_token uuid DEFAULT gen_random_uuid(),
    volume_discount_percent numeric DEFAULT 0 NOT NULL,
    volume_discount_eur numeric DEFAULT 0 NOT NULL,
    CONSTRAINT store_purchases_buyer_check CHECK (((user_id IS NOT NULL) OR (buyer_name IS NOT NULL))),
    CONSTRAINT store_purchases_quantity_check CHECK (((quantity >= 1) AND (quantity <= 10)))
);


--
-- Name: store_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_settings (
    id boolean DEFAULT true NOT NULL,
    base_gold_per_euro numeric DEFAULT 100 NOT NULL,
    reference_total_gold numeric DEFAULT 10000 NOT NULL,
    min_rate_multiplier numeric DEFAULT 0.5 NOT NULL,
    max_rate_multiplier numeric DEFAULT 3 NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    unpaid_expiry_days integer DEFAULT 14 NOT NULL,
    max_guest_unpaid_orders integer DEFAULT 10 NOT NULL,
    CONSTRAINT store_settings_base_gold_per_euro_check CHECK ((base_gold_per_euro > (0)::numeric)),
    CONSTRAINT store_settings_id_check CHECK (id),
    CONSTRAINT store_settings_max_guest_unpaid_orders_check CHECK (((max_guest_unpaid_orders >= 0) AND (max_guest_unpaid_orders <= 1000))),
    CONSTRAINT store_settings_max_rate_multiplier_check CHECK ((max_rate_multiplier >= (1)::numeric)),
    CONSTRAINT store_settings_min_rate_multiplier_check CHECK ((min_rate_multiplier > (0)::numeric)),
    CONSTRAINT store_settings_reference_total_gold_check CHECK ((reference_total_gold > (0)::numeric)),
    CONSTRAINT store_settings_unpaid_expiry_days_check CHECK (((unpaid_expiry_days >= 1) AND (unpaid_expiry_days <= 365)))
);


--
-- Name: suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suggestions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    target text NOT NULL,
    content text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    points_awarded boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT suggestions_target_check CHECK ((target = ANY (ARRAY['dirigente'::text, 'coordenador'::text])))
);


--
-- Name: survey_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_options (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    survey_id uuid NOT NULL,
    label text NOT NULL,
    xp_reward integer DEFAULT 0 NOT NULL,
    gold_reward integer DEFAULT 0 NOT NULL,
    "position" integer DEFAULT 0 NOT NULL
);


--
-- Name: survey_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_responses (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    survey_id uuid NOT NULL,
    user_id uuid NOT NULL,
    option_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: surveys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.surveys (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    question text NOT NULL,
    description text,
    created_by_user_id uuid,
    deadline timestamp with time zone NOT NULL,
    show_results_live boolean DEFAULT false NOT NULL,
    is_definitive boolean DEFAULT true NOT NULL,
    finalized_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    opened_at timestamp with time zone DEFAULT now(),
    hide_rewards boolean DEFAULT false NOT NULL
);


--
-- Name: task_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_completions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    points_awarded boolean DEFAULT false NOT NULL,
    awarded_by_user_id uuid
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    description text,
    created_by_user_id uuid,
    target_section text,
    xp_reward integer DEFAULT 0 NOT NULL,
    gold_reward integer DEFAULT 0 NOT NULL,
    deadline date,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: team_screens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_screens (
    host_id uuid NOT NULL,
    state jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: timer_screens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timer_screens (
    host_id uuid NOT NULL,
    state jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trip_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trip_plans (
    event_id uuid NOT NULL,
    draft jsonb DEFAULT '{}'::jsonb NOT NULL,
    published jsonb,
    published_at timestamp with time zone,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vana_codigo_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vana_codigo_sessions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    mode text NOT NULL,
    code_type text NOT NULL,
    secret_text text NOT NULL,
    attempts text[] DEFAULT '{}'::text[] NOT NULL,
    revealed_indices integer[] DEFAULT '{}'::integer[] NOT NULL,
    is_finished boolean DEFAULT false NOT NULL,
    is_won boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vana_codigo_sessions_code_type_check CHECK ((code_type = ANY (ARRAY['morse'::text, 'semaforo'::text, 'cesar'::text, 'numeros'::text, 'atbash'::text]))),
    CONSTRAINT vana_codigo_sessions_mode_check CHECK ((mode = ANY (ARRAY['recruta'::text, 'explorador'::text, 'mestre'::text])))
);


--
-- Name: vana_quest_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vana_quest_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    question_id uuid NOT NULL,
    chosen_option text,
    elapsed_ms integer NOT NULL,
    is_correct boolean NOT NULL,
    speed_points numeric(10,3) DEFAULT 0 NOT NULL,
    streak_bonus numeric(10,3) DEFAULT 0 NOT NULL,
    final_points numeric(10,3) DEFAULT 0 NOT NULL,
    streak_at_answer integer DEFAULT 0 NOT NULL,
    answered_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vana_quest_answers_chosen_option_check CHECK ((chosen_option = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text])))
);


--
-- Name: vana_quest_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vana_quest_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid,
    guest_name text,
    is_guest boolean DEFAULT false NOT NULL,
    display_name text NOT NULL,
    total_points numeric(10,3) DEFAULT 0 NOT NULL,
    correct_answers integer DEFAULT 0 NOT NULL,
    current_streak integer DEFAULT 0 NOT NULL,
    max_streak integer DEFAULT 0 NOT NULL,
    rewards_recipient_id uuid,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    avatar_url text,
    rewards_skipped boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.vana_quest_participants REPLICA IDENTITY FULL;


--
-- Name: vana_quest_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vana_quest_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vana_quest_id uuid NOT NULL,
    question_text text NOT NULL,
    option_a text NOT NULL,
    option_b text NOT NULL,
    option_c text NOT NULL,
    option_d text NOT NULL,
    correct_option text NOT NULL,
    explanation text,
    time_seconds integer DEFAULT 20 NOT NULL,
    points_multiplier integer DEFAULT 1 NOT NULL,
    question_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vana_quest_questions_correct_option_check CHECK ((correct_option = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text]))),
    CONSTRAINT vana_quest_questions_points_multiplier_check CHECK ((points_multiplier = ANY (ARRAY[1, 2, 3])))
);


--
-- Name: vana_quest_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vana_quest_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vana_quest_id uuid NOT NULL,
    host_id uuid NOT NULL,
    pin text NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    current_question_index integer DEFAULT '-1'::integer NOT NULL,
    question_started_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    points_awarded_at timestamp with time zone,
    CONSTRAINT vana_quest_sessions_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'quest_intro'::text, 'question_intro'::text, 'question_active'::text, 'question_results'::text, 'question_leaderboard'::text, 'finished'::text])))
);


--
-- Name: vana_quests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vana_quests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vana_sentinela_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vana_sentinela_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pack text NOT NULL,
    user_id uuid,
    guest_id uuid,
    guest_name text,
    points integer NOT NULL,
    correct integer NOT NULL,
    total integer DEFAULT 15 NOT NULL,
    max_combo integer NOT NULL,
    duration_ms integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vana_sentinela_scores_correct_check CHECK (((correct >= 0) AND (correct <= 15))),
    CONSTRAINT vana_sentinela_scores_duration_ms_check CHECK ((duration_ms > 0)),
    CONSTRAINT vana_sentinela_scores_max_combo_check CHECK (((max_combo >= 0) AND (max_combo <= 15))),
    CONSTRAINT vana_sentinela_scores_player_chk CHECK ((((user_id IS NOT NULL) AND (guest_id IS NULL) AND (guest_name IS NULL)) OR ((user_id IS NULL) AND (guest_id IS NOT NULL) AND ((char_length(guest_name) >= 2) AND (char_length(guest_name) <= 20))))),
    CONSTRAINT vana_sentinela_scores_points_check CHECK ((points >= 0))
);


--
-- Name: vanacamp_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanacamp_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    day_number integer DEFAULT 0 NOT NULL,
    event_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vanacamp_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanacamp_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    channel text NOT NULL,
    sender_player_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vanacamp_messages_channel_check CHECK ((channel = ANY (ARRAY['lobby'::text, 'infiltrators'::text, 'day'::text, 'dead'::text])))
);


--
-- Name: vanacamp_night_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanacamp_night_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    day_number integer NOT NULL,
    phase text NOT NULL,
    actor_player_id uuid NOT NULL,
    target_player_id uuid NOT NULL,
    result text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vanacamp_night_actions_phase_check CHECK ((phase = ANY (ARRAY['infiltrators'::text, 'seer'::text, 'guardian'::text])))
);


--
-- Name: vanacamp_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanacamp_players (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid,
    display_name text NOT NULL,
    role text,
    is_mayor boolean DEFAULT false NOT NULL,
    is_alive boolean DEFAULT true NOT NULL,
    eliminated_on_day integer,
    eliminated_by text,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    is_bot boolean DEFAULT false NOT NULL,
    CONSTRAINT vanacamp_players_eliminated_by_check CHECK ((eliminated_by = ANY (ARRAY['sabotage'::text, 'vote'::text]))),
    CONSTRAINT vanacamp_players_role_check CHECK ((role = ANY (ARRAY['infiltrator'::text, 'seer'::text, 'guardian'::text, 'villager'::text])))
);


--
-- Name: vanacamp_players_public; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vanacamp_players_public AS
 SELECT id,
    session_id,
    user_id,
    display_name,
    is_mayor,
    is_alive,
    is_bot,
    eliminated_on_day,
    eliminated_by,
    joined_at
   FROM public.vanacamp_players;


--
-- Name: vanacamp_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanacamp_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_id uuid NOT NULL,
    code text NOT NULL,
    status text DEFAULT 'lobby'::text NOT NULL,
    phase_started_at timestamp with time zone,
    phase_ends_at timestamp with time zone,
    phase_paused_at timestamp with time zone,
    day_number integer DEFAULT 0 NOT NULL,
    chat_mode text DEFAULT 'presencial'::text NOT NULL,
    mayor_mode text DEFAULT 'none'::text NOT NULL,
    role_assignment_mode text DEFAULT 'auto'::text NOT NULL,
    config_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    winner_side text,
    rewards_awarded boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    is_test_session boolean DEFAULT false NOT NULL,
    CONSTRAINT vanacamp_sessions_chat_mode_check CHECK ((chat_mode = ANY (ARRAY['presencial'::text, 'remote'::text]))),
    CONSTRAINT vanacamp_sessions_mayor_mode_check CHECK ((mayor_mode = ANY (ARRAY['none'::text, 'auto'::text, 'vote_day1'::text, 'manual'::text]))),
    CONSTRAINT vanacamp_sessions_role_assignment_mode_check CHECK ((role_assignment_mode = ANY (ARRAY['auto'::text, 'auto_custom'::text, 'manual'::text]))),
    CONSTRAINT vanacamp_sessions_status_check CHECK ((status = ANY (ARRAY['lobby'::text, 'role_preview'::text, 'role_reveal'::text, 'mayor_election'::text, 'night_infiltrators'::text, 'night_seer'::text, 'night_guardian'::text, 'day_announce'::text, 'day_discussion'::text, 'day_vote'::text, 'day_result'::text, 'finished'::text, 'cancelled'::text]))),
    CONSTRAINT vanacamp_sessions_winner_side_check CHECK ((winner_side = ANY (ARRAY['infiltrators'::text, 'desbravadores'::text])))
);


--
-- Name: vanacamp_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanacamp_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    day_number integer NOT NULL,
    vote_type text NOT NULL,
    voter_player_id uuid NOT NULL,
    target_player_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vanacamp_votes_vote_type_check CHECK ((vote_type = ANY (ARRAY['mayor_election'::text, 'day_expulsion'::text])))
);


--
-- Name: vanacoro_answer_rewards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanacoro_answer_rewards (
    question_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    awarded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vanacoro_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanacoro_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    profile_id uuid,
    guest_id uuid,
    respondent_key uuid GENERATED ALWAYS AS (COALESCE(profile_id, guest_id)) STORED,
    ip_hash text,
    raw_text text NOT NULL,
    normalized_text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    group_id uuid,
    hidden boolean DEFAULT false NOT NULL,
    CONSTRAINT vanacoro_answers_normalized_text_check CHECK ((char_length(normalized_text) >= 1)),
    CONSTRAINT vanacoro_answers_one_identity CHECK (((profile_id IS NULL) <> (guest_id IS NULL))),
    CONSTRAINT vanacoro_answers_raw_text_check CHECK (((char_length(raw_text) >= 1) AND (char_length(raw_text) <= 40)))
);


--
-- Name: vanacoro_board_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanacoro_board_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    rank integer NOT NULL,
    label text NOT NULL,
    emoji text,
    respondents integer NOT NULL,
    points integer NOT NULL,
    CONSTRAINT vanacoro_board_entries_points_check CHECK (((points >= 0) AND (points <= 100))),
    CONSTRAINT vanacoro_board_entries_rank_check CHECK (((rank >= 1) AND (rank <= 5))),
    CONSTRAINT vanacoro_board_entries_respondents_check CHECK ((respondents >= 2))
);


--
-- Name: vanacoro_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanacoro_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    label text NOT NULL,
    emoji text,
    hidden boolean DEFAULT false NOT NULL,
    source text DEFAULT 'auto'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vanacoro_groups_emoji_check CHECK (((emoji IS NULL) OR (char_length(emoji) <= 16))),
    CONSTRAINT vanacoro_groups_label_check CHECK (((char_length(label) >= 1) AND (char_length(label) <= 40))),
    CONSTRAINT vanacoro_groups_source_check CHECK ((source = ANY (ARRAY['auto'::text, 'ai'::text, 'manual'::text])))
);


--
-- Name: vanacoro_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanacoro_players (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    profile_id uuid,
    guest_name text,
    display_name text NOT NULL,
    avatar_url text,
    team text,
    is_captain boolean DEFAULT false NOT NULL,
    is_bot boolean DEFAULT false NOT NULL,
    rewards_recipient_id uuid,
    rewards_skipped boolean DEFAULT false NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    roster_key text,
    CONSTRAINT vanacoro_players_display_name_check CHECK (((char_length(display_name) >= 1) AND (char_length(display_name) <= 40))),
    CONSTRAINT vanacoro_players_team_check CHECK ((team = ANY (ARRAY['a'::text, 'b'::text])))
);

ALTER TABLE ONLY public.vanacoro_players REPLICA IDENTITY FULL;


--
-- Name: vanacoro_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanacoro_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prompt text NOT NULL,
    allow_guests boolean DEFAULT true NOT NULL,
    opens_at timestamp with time zone,
    closes_at timestamp with time zone,
    review_status text DEFAULT 'pending'::text NOT NULL,
    ready_at timestamp with time zone,
    used_at timestamp with time zone,
    used_in_session_id uuid,
    push_sent_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vanacoro_questions_dates_valid CHECK ((((opens_at IS NULL) AND (closes_at IS NULL)) OR ((opens_at IS NOT NULL) AND (closes_at > opens_at)))),
    CONSTRAINT vanacoro_questions_prompt_check CHECK (((char_length(prompt) >= 5) AND (char_length(prompt) <= 140))),
    CONSTRAINT vanacoro_questions_review_status_check CHECK ((review_status = ANY (ARRAY['pending'::text, 'grouped'::text, 'ready'::text])))
);


--
-- Name: vanacoro_reveals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanacoro_reveals (
    round_id uuid NOT NULL,
    board_entry_id uuid NOT NULL,
    scored boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vanacoro_roster; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanacoro_roster (
    session_id uuid NOT NULL,
    key text NOT NULL,
    team text NOT NULL,
    name text NOT NULL,
    is_guest boolean DEFAULT false NOT NULL,
    CONSTRAINT vanacoro_roster_team_check CHECK ((team = ANY (ARRAY['a'::text, 'b'::text])))
);


--
-- Name: vanacoro_round_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanacoro_round_events (
    id bigint NOT NULL,
    round_id uuid NOT NULL,
    kind text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    undone boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vanacoro_round_events_kind_check CHECK ((kind = ANY (ARRAY['start'::text, 'buzz'::text, 'reveal'::text, 'strike'::text, 'control'::text, 'steal_result'::text, 'finish'::text])))
);


--
-- Name: vanacoro_round_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vanacoro_round_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vanacoro_round_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vanacoro_round_events_id_seq OWNED BY public.vanacoro_round_events.id;


--
-- Name: vanacoro_rounds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanacoro_rounds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    question_id uuid NOT NULL,
    round_number integer NOT NULL,
    multiplier integer DEFAULT 1 NOT NULL,
    winner_team text,
    banked_points integer DEFAULT 0 NOT NULL,
    CONSTRAINT vanacoro_rounds_winner_team_check CHECK ((winner_team = ANY (ARRAY['a'::text, 'b'::text])))
);


--
-- Name: vanacoro_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanacoro_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    host_id uuid NOT NULL,
    status text DEFAULT 'lobby'::text NOT NULL,
    phase text,
    current_round integer DEFAULT 0 NOT NULL,
    total_rounds integer DEFAULT 0 NOT NULL,
    question_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    team_a_name text DEFAULT 'Equipa A'::text NOT NULL,
    team_b_name text DEFAULT 'Equipa B'::text NOT NULL,
    team_a_score integer DEFAULT 0 NOT NULL,
    team_b_score integer DEFAULT 0 NOT NULL,
    control_team text,
    buzzed_team text,
    strikes integer DEFAULT 0 NOT NULL,
    strike_seq integer DEFAULT 0 NOT NULL,
    round_pot integer DEFAULT 0 NOT NULL,
    round_winner text,
    round_banked integer DEFAULT 0 NOT NULL,
    board_version integer DEFAULT 0 NOT NULL,
    is_test_session boolean DEFAULT false NOT NULL,
    rewards_awarded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    faceoff_turn text,
    faceoff_first_team text,
    faceoff_first_rank integer,
    uses_families boolean DEFAULT false NOT NULL,
    CONSTRAINT vanacoro_sessions_buzzed_team_check CHECK ((buzzed_team = ANY (ARRAY['a'::text, 'b'::text]))),
    CONSTRAINT vanacoro_sessions_control_team_check CHECK ((control_team = ANY (ARRAY['a'::text, 'b'::text]))),
    CONSTRAINT vanacoro_sessions_faceoff_first_team_check CHECK ((faceoff_first_team = ANY (ARRAY['a'::text, 'b'::text]))),
    CONSTRAINT vanacoro_sessions_faceoff_turn_check CHECK ((faceoff_turn = ANY (ARRAY['a'::text, 'b'::text]))),
    CONSTRAINT vanacoro_sessions_phase_check CHECK ((phase = ANY (ARRAY['intro'::text, 'faceoff'::text, 'playing'::text, 'steal'::text, 'reveal_rest'::text, 'round_end'::text]))),
    CONSTRAINT vanacoro_sessions_round_winner_check CHECK ((round_winner = ANY (ARRAY['a'::text, 'b'::text]))),
    CONSTRAINT vanacoro_sessions_status_check CHECK ((status = ANY (ARRAY['lobby'::text, 'playing'::text, 'finished'::text]))),
    CONSTRAINT vanacoro_sessions_strikes_check CHECK (((strikes >= 0) AND (strikes <= 3))),
    CONSTRAINT vanacoro_sessions_team_a_name_check CHECK (((char_length(team_a_name) >= 1) AND (char_length(team_a_name) <= 24))),
    CONSTRAINT vanacoro_sessions_team_b_name_check CHECK (((char_length(team_b_name) >= 1) AND (char_length(team_b_name) <= 24)))
);


--
-- Name: vanacoro_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanacoro_settings (
    id smallint DEFAULT 1 NOT NULL,
    invite_token text NOT NULL,
    invite_rotated_at timestamp with time zone DEFAULT now() NOT NULL,
    cadence_days integer DEFAULT 7 NOT NULL,
    open_days integer DEFAULT 7 NOT NULL,
    turbo boolean DEFAULT false NOT NULL,
    CONSTRAINT vanacoro_settings_cadence_days_check CHECK (((cadence_days >= 1) AND (cadence_days <= 60))),
    CONSTRAINT vanacoro_settings_id_check CHECK ((id = 1)),
    CONSTRAINT vanacoro_settings_open_days_check CHECK (((open_days >= 1) AND (open_days <= 60)))
);


--
-- Name: vanaespada_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanaespada_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    round_id uuid NOT NULL,
    player_id uuid NOT NULL,
    guess_book smallint,
    guess_chapter smallint,
    guess_verse smallint,
    found_at timestamp with time zone,
    chosen_index smallint,
    elapsed_ms integer,
    is_correct boolean,
    points integer DEFAULT 0 NOT NULL,
    breakdown jsonb,
    answered_at timestamp with time zone
);


--
-- Name: vanaespada_deck_rounds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanaespada_deck_rounds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deck_id uuid NOT NULL,
    "position" integer NOT NULL,
    kind text NOT NULL,
    verse_id uuid NOT NULL,
    prompt_id uuid,
    time_seconds integer,
    CONSTRAINT vanaespada_deck_rounds_kind_check CHECK ((kind = ANY (ARRAY['locate'::text, 'drill'::text]))),
    CONSTRAINT vanaespada_drill_needs_prompt CHECK (((kind <> 'drill'::text) OR (prompt_id IS NOT NULL)))
);


--
-- Name: vanaespada_decks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanaespada_decks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vanaespada_drill_prompts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanaespada_drill_prompts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    verse_id uuid NOT NULL,
    prompt text NOT NULL,
    options text[] NOT NULL,
    correct_index smallint NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vanaespada_drill_prompts_correct_index_check CHECK (((correct_index >= 0) AND (correct_index <= 3))),
    CONSTRAINT vanaespada_drill_prompts_options_check CHECK ((cardinality(options) = 4))
);


--
-- Name: vanaespada_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanaespada_players (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid,
    is_guest boolean DEFAULT false NOT NULL,
    display_name text NOT NULL,
    avatar_url text,
    total_points integer DEFAULT 0 NOT NULL,
    last_round_points integer,
    rewards_recipient_id uuid,
    rewards_skipped boolean DEFAULT false NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.vanaespada_players REPLICA IDENTITY FULL;


--
-- Name: vanaespada_session_rounds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanaespada_session_rounds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    round_index integer NOT NULL,
    kind text NOT NULL,
    verse_id uuid,
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
    started_at timestamp with time zone,
    closed_at timestamp with time zone,
    CONSTRAINT vanaespada_session_rounds_kind_check CHECK ((kind = ANY (ARRAY['locate'::text, 'drill'::text])))
);


--
-- Name: vanaespada_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanaespada_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_id uuid NOT NULL,
    deck_id uuid,
    pin text NOT NULL,
    status text DEFAULT 'lobby'::text NOT NULL,
    current_round integer DEFAULT '-1'::integer NOT NULL,
    total_rounds integer DEFAULT 0 NOT NULL,
    current_kind text,
    phase_started_at timestamp with time zone,
    phase_ends_at timestamp with time zone,
    answered_count integer DEFAULT 0 NOT NULL,
    found_count integer DEFAULT 0 NOT NULL,
    settings jsonb DEFAULT '{"physical_bible_only": true}'::jsonb NOT NULL,
    points_awarded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    CONSTRAINT vanaespada_sessions_current_kind_check CHECK ((current_kind = ANY (ARRAY['locate'::text, 'drill'::text]))),
    CONSTRAINT vanaespada_sessions_status_check CHECK ((status = ANY (ARRAY['lobby'::text, 'round_ready'::text, 'round_active'::text, 'round_reveal'::text, 'leaderboard'::text, 'finished'::text])))
);


--
-- Name: vanaespada_verses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanaespada_verses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id smallint NOT NULL,
    chapter smallint NOT NULL,
    verse_start smallint NOT NULL,
    verse_end smallint NOT NULL,
    excerpt text,
    translation text,
    difficulty text DEFAULT 'medium'::text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vanaespada_verse_range CHECK ((verse_end >= verse_start)),
    CONSTRAINT vanaespada_verses_book_id_check CHECK (((book_id >= 1) AND (book_id <= 66))),
    CONSTRAINT vanaespada_verses_chapter_check CHECK ((chapter >= 1)),
    CONSTRAINT vanaespada_verses_difficulty_check CHECK ((difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text]))),
    CONSTRAINT vanaespada_verses_verse_start_check CHECK ((verse_start >= 1))
);


--
-- Name: vanasketch_guesses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanasketch_guesses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    round_number integer NOT NULL,
    player_id uuid NOT NULL,
    guess_text text,
    is_correct boolean DEFAULT false NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.vanasketch_guesses REPLICA IDENTITY FULL;


--
-- Name: vanasketch_pack_words; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanasketch_pack_words (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pack_id uuid NOT NULL,
    word text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vanasketch_pack_words_word_check CHECK (((char_length(TRIM(BOTH FROM word)) >= 2) AND (char_length(TRIM(BOTH FROM word)) <= 30)))
);


--
-- Name: vanasketch_packs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanasketch_packs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    emoji text DEFAULT '🎨'::text NOT NULL,
    description text,
    is_default boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vanasketch_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanasketch_players (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid,
    display_name text NOT NULL,
    avatar_url text,
    section text,
    score integer DEFAULT 0 NOT NULL,
    draw_order integer,
    is_bot boolean DEFAULT false NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.vanasketch_players REPLICA IDENTITY FULL;


--
-- Name: vanasketch_rounds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanasketch_rounds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    round_number integer NOT NULL,
    drawer_player_id uuid NOT NULL,
    word_options jsonb DEFAULT '[]'::jsonb NOT NULL,
    word text,
    end_reason text,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vanasketch_rounds_end_reason_check CHECK ((end_reason = ANY (ARRAY['all_guessed'::text, 'timeout'::text, 'skipped'::text])))
);


--
-- Name: vanasketch_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanasketch_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_id uuid NOT NULL,
    code text NOT NULL,
    status text DEFAULT 'lobby'::text NOT NULL,
    phase text,
    round_number integer DEFAULT 0 NOT NULL,
    total_rounds integer DEFAULT 0 NOT NULL,
    rounds_per_player integer DEFAULT 1 NOT NULL,
    draw_seconds integer DEFAULT 90 NOT NULL,
    drawer_player_id uuid,
    word_masked text,
    revealed_word text,
    round_ends_at timestamp with time zone,
    canvas_version integer DEFAULT 0 NOT NULL,
    is_test_session boolean DEFAULT false NOT NULL,
    rewards_awarded boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    pack_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    CONSTRAINT vanasketch_sessions_draw_seconds_check CHECK (((draw_seconds >= 30) AND (draw_seconds <= 300))),
    CONSTRAINT vanasketch_sessions_phase_check CHECK ((phase = ANY (ARRAY['choosing'::text, 'drawing'::text, 'round_end'::text]))),
    CONSTRAINT vanasketch_sessions_rounds_per_player_check CHECK (((rounds_per_player >= 1) AND (rounds_per_player <= 3))),
    CONSTRAINT vanasketch_sessions_status_check CHECK ((status = ANY (ARRAY['lobby'::text, 'playing'::text, 'finished'::text])))
);


--
-- Name: vanasketch_strokes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanasketch_strokes (
    id uuid NOT NULL,
    session_id uuid NOT NULL,
    round_number integer NOT NULL,
    seq integer DEFAULT 0 NOT NULL,
    color text DEFAULT '#1a1a2e'::text NOT NULL,
    size integer DEFAULT 4 NOT NULL,
    points jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.vanasketch_strokes REPLICA IDENTITY FULL;


--
-- Name: vanatrilha_daily_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanatrilha_daily_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    run_date date DEFAULT ((now() AT TIME ZONE 'Europe/Lisbon'::text))::date NOT NULL,
    station smallint NOT NULL,
    question_ids uuid[] NOT NULL,
    reserve_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    current_question_id uuid,
    bonus_question_id uuid,
    bonus_pending boolean DEFAULT false NOT NULL,
    current_index smallint DEFAULT 0 NOT NULL,
    "position" smallint DEFAULT 0 NOT NULL,
    lives smallint DEFAULT 3 NOT NULL,
    correct_count smallint DEFAULT 0 NOT NULL,
    mistakes smallint DEFAULT 0 NOT NULL,
    turn smallint DEFAULT 0 NOT NULL,
    immune_next_error boolean DEFAULT false NOT NULL,
    bonus_gold smallint DEFAULT 0 NOT NULL,
    answers jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'playing'::text NOT NULL,
    rewards_awarded boolean DEFAULT false NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT vanatrilha_daily_runs_current_index_check CHECK (((current_index >= 0) AND (current_index <= 8))),
    CONSTRAINT vanatrilha_daily_runs_lives_check CHECK (((lives >= 0) AND (lives <= 3))),
    CONSTRAINT vanatrilha_daily_runs_position_check CHECK ((("position" >= 0) AND ("position" <= 8))),
    CONSTRAINT vanatrilha_daily_runs_station_check CHECK (((station >= 1) AND (station <= 7))),
    CONSTRAINT vanatrilha_daily_runs_status_check CHECK ((status = ANY (ARRAY['playing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: vanatrilha_station_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanatrilha_station_progress (
    user_id uuid NOT NULL,
    station smallint NOT NULL,
    first_completed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vanatrilha_station_progress_station_check CHECK (((station >= 1) AND (station <= 7)))
);


--
-- Name: vanawords_guesses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanawords_guesses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    word_id uuid NOT NULL,
    player_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.vanawords_guesses REPLICA IDENTITY FULL;


--
-- Name: vanawords_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanawords_players (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid,
    display_name text NOT NULL,
    avatar_url text,
    section text,
    team text,
    is_arauto boolean DEFAULT false NOT NULL,
    is_bot boolean DEFAULT false NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    swap_requested boolean DEFAULT false NOT NULL,
    arauto_response text DEFAULT 'pending'::text NOT NULL,
    CONSTRAINT vanawords_players_arauto_response_check CHECK ((arauto_response = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text]))),
    CONSTRAINT vanawords_players_team_check CHECK ((team = ANY (ARRAY['a'::text, 'b'::text])))
);

ALTER TABLE ONLY public.vanawords_players REPLICA IDENTITY FULL;


--
-- Name: vanawords_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanawords_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_id uuid NOT NULL,
    code text NOT NULL,
    status text DEFAULT 'lobby'::text NOT NULL,
    current_team text,
    current_phase text,
    current_hint text,
    current_hint_number integer,
    guesses_remaining integer DEFAULT 0,
    winner_team text,
    win_reason text,
    board_version integer DEFAULT 0 NOT NULL,
    is_test_session boolean DEFAULT false NOT NULL,
    rewards_awarded boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    arauto_reveal_a text DEFAULT 'spin'::text NOT NULL,
    arauto_reveal_b text DEFAULT 'spin'::text NOT NULL,
    CONSTRAINT vanawords_sessions_arauto_reveal_a_check CHECK ((arauto_reveal_a = ANY (ARRAY['spin'::text, 'instant'::text]))),
    CONSTRAINT vanawords_sessions_arauto_reveal_b_check CHECK ((arauto_reveal_b = ANY (ARRAY['spin'::text, 'instant'::text]))),
    CONSTRAINT vanawords_sessions_current_phase_check CHECK ((current_phase = ANY (ARRAY['hinting'::text, 'guessing'::text]))),
    CONSTRAINT vanawords_sessions_current_team_check CHECK ((current_team = ANY (ARRAY['a'::text, 'b'::text]))),
    CONSTRAINT vanawords_sessions_status_check CHECK ((status = ANY (ARRAY['lobby'::text, 'team_preview'::text, 'arauto_spin'::text, 'arauto_ready'::text, 'playing'::text, 'finished'::text]))),
    CONSTRAINT vanawords_sessions_win_reason_check CHECK ((win_reason = ANY (ARRAY['all_found'::text, 'black_hit'::text]))),
    CONSTRAINT vanawords_sessions_winner_team_check CHECK ((winner_team = ANY (ARRAY['a'::text, 'b'::text])))
);


--
-- Name: vanawords_turns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanawords_turns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    team text NOT NULL,
    hint_word text,
    hint_number integer,
    words_revealed jsonb DEFAULT '[]'::jsonb NOT NULL,
    end_reason text,
    turn_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vanawords_turns_end_reason_check CHECK ((end_reason = ANY (ARRAY['pass'::text, 'neutral'::text, 'opponent'::text, 'black'::text, 'limit'::text]))),
    CONSTRAINT vanawords_turns_team_check CHECK ((team = ANY (ARRAY['a'::text, 'b'::text])))
);

ALTER TABLE ONLY public.vanawords_turns REPLICA IDENTITY FULL;


--
-- Name: vanawords_word_bank; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanawords_word_bank (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    word text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vanawords_words; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vanawords_words (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    word text NOT NULL,
    team text NOT NULL,
    grid_pos integer NOT NULL,
    is_revealed boolean DEFAULT false NOT NULL,
    revealed_at timestamp with time zone,
    CONSTRAINT vanawords_words_grid_pos_check CHECK (((grid_pos >= 0) AND (grid_pos < 25))),
    CONSTRAINT vanawords_words_team_check CHECK ((team = ANY (ARRAY['a'::text, 'b'::text, 'neutral'::text, 'black'::text])))
);


--
-- Name: vantur_dictionary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vantur_dictionary (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    word text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vantur_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vantur_sessions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    mode text NOT NULL,
    secret_words text[] DEFAULT '{}'::text[] NOT NULL,
    attempts text[] DEFAULT '{}'::text[] NOT NULL,
    completed_indices integer[] DEFAULT '{}'::integer[] NOT NULL,
    is_finished boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vantur_sessions_mode_check CHECK ((mode = ANY (ARRAY['solo'::text, 'mix'::text, 'plex'::text])))
);


--
-- Name: vanacoro_round_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_round_events ALTER COLUMN id SET DEFAULT nextval('public.vanacoro_round_events_id_seq'::regclass);


--
-- Data for Name: announcement_recipients; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: announcements; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: club_families; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: club_family_invites; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: club_family_members; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: club_screens; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: digital_keys; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: email_opt_outs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: event_attendance; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: event_guests; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: event_invites; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: event_rsvps; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: family_account_links; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: family_account_requests; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: game_plays; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: game_settings; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.game_settings (game_id, enabled, allowed_roles, updated_by, updated_at, hidden, points_multiplier, multiplier_starts_at, multiplier_ends_at) VALUES ('vantur', true, '{desbravador,dirigente,coordenador}', NULL, '2026-11-03 21:30:17.677+00', false, 1.00, NULL, NULL);
INSERT INTO public.game_settings (game_id, enabled, allowed_roles, updated_by, updated_at, hidden, points_multiplier, multiplier_starts_at, multiplier_ends_at) VALUES ('vana-quest', true, '{desbravador,dirigente,coordenador}', NULL, '2026-11-03 21:30:17.677+00', false, 1.00, NULL, NULL);
INSERT INTO public.game_settings (game_id, enabled, allowed_roles, updated_by, updated_at, hidden, points_multiplier, multiplier_starts_at, multiplier_ends_at) VALUES ('vana-words', true, '{desbravador,dirigente,coordenador}', NULL, '2026-11-03 21:30:17.677+00', false, 1.00, NULL, NULL);
INSERT INTO public.game_settings (game_id, enabled, allowed_roles, updated_by, updated_at, hidden, points_multiplier, multiplier_starts_at, multiplier_ends_at) VALUES ('vana-trilha', true, '{desbravador,dirigente,coordenador}', NULL, '2026-11-03 21:30:17.677+00', false, 1.00, NULL, NULL);
INSERT INTO public.game_settings (game_id, enabled, allowed_roles, updated_by, updated_at, hidden, points_multiplier, multiplier_starts_at, multiplier_ends_at) VALUES ('vana-camp', true, '{desbravador,dirigente,coordenador}', NULL, '2026-11-03 21:30:17.677+00', false, 1.00, NULL, NULL);
INSERT INTO public.game_settings (game_id, enabled, allowed_roles, updated_by, updated_at, hidden, points_multiplier, multiplier_starts_at, multiplier_ends_at) VALUES ('vana-sketch', true, '{dirigente,coordenador}', NULL, '2026-11-03 21:30:17.702+00', true, 1.00, NULL, NULL);
INSERT INTO public.game_settings (game_id, enabled, allowed_roles, updated_by, updated_at, hidden, points_multiplier, multiplier_starts_at, multiplier_ends_at) VALUES ('vana-codigo', true, '{dirigente,coordenador}', NULL, '2026-11-03 21:30:17.704+00', true, 1.00, NULL, NULL);
INSERT INTO public.game_settings (game_id, enabled, allowed_roles, updated_by, updated_at, hidden, points_multiplier, multiplier_starts_at, multiplier_ends_at) VALUES ('vana-espada', true, '{dirigente,coordenador}', NULL, '2026-11-03 21:30:17.705+00', true, 1.00, NULL, NULL);
INSERT INTO public.game_settings (game_id, enabled, allowed_roles, updated_by, updated_at, hidden, points_multiplier, multiplier_starts_at, multiplier_ends_at) VALUES ('vana-sentinela', true, '{desbravador,dirigente,coordenador}', NULL, '2026-11-03 21:30:18.121+00', false, 1.00, NULL, NULL);
INSERT INTO public.game_settings (game_id, enabled, allowed_roles, updated_by, updated_at, hidden, points_multiplier, multiplier_starts_at, multiplier_ends_at) VALUES ('vana-coro', true, '{coordenador}', NULL, '2026-11-03 21:30:18.364+00', true, 1.00, NULL, NULL);


--
-- Data for Name: points_audit_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: points_log; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: points_season_standings; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: points_seasons; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: portuguese_words; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: push_subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: qr_codes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: qr_scans; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: raffle_screens; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: section_changes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: store_products; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: store_purchases; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: store_settings; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.store_settings (id, base_gold_per_euro, reference_total_gold, min_rate_multiplier, max_rate_multiplier, updated_at) VALUES (true, 100, 1000, 0.5, 3, '2026-11-03 21:30:17.274+00');


--
-- Data for Name: suggestions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: survey_options; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: survey_responses; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: surveys; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: task_completions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: team_screens; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: timer_screens; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: trip_plans; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vana_codigo_sessions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vana_quest_answers; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vana_quest_participants; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vana_quest_questions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vana_quest_sessions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vana_quests; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vana_sentinela_scores; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanacamp_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanacamp_messages; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanacamp_night_actions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanacamp_players; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanacamp_sessions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanacamp_votes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanacoro_answer_rewards; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanacoro_answers; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanacoro_board_entries; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanacoro_groups; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanacoro_players; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanacoro_questions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('a4a7cdfb-92fc-4620-84b5-3462739eace3', 'Diz um milagre de Jesus.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.463+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('726b6972-bab3-4276-8321-7f1baad7aad7', 'Diz uma comida que aparece na Bíblia.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.472+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('cc600664-67ee-494f-b930-5b12bb73ab41', 'Diz uma personagem bíblica que viveu numa cidade grande.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.499+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('3f142f02-a702-4dee-a523-de6ad63ff9fd', 'Diz uma coisa que os pais dizem sempre.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.467+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('1584ad8b-18be-4807-8166-e59127591624', 'Diz uma coisa que se faz ao sábado à tarde.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.471+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('19b47b96-349f-454f-a712-0796ae3da0ab', 'Diz uma coisa que se faz à volta de uma fogueira.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.464+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('0a55e0f5-67ed-4eaa-838f-a42da52fa303', 'Diz uma peça do uniforme de um desbravador.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.461+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('4b2292e2-62d1-4922-9794-3e80b9a64537', 'Diz uma coisa que se vê no céu à noite num acampamento.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.5+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('cd58f2b6-3aca-48d5-b4f9-92779ea9135e', 'Diz uma coisa que se faz nas férias de verão.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.497+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('7b1c9a8d-3f3e-4cd9-a44a-400d89791c09', 'Diz um desporto que se joga no recreio da escola.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.487+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('9a67aaa4-8920-4238-b6c5-559e9638e43f', 'Diz uma coisa que pode correr mal ao montar uma tenda.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.488+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('6a67c072-e937-4f42-82a2-340d3e89d5cd', 'Diz um animal que aparece na Bíblia.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.466+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('125825c3-bd21-41ad-bedc-19dc10f1c29c', 'O que é que se leva para a igreja ao sábado?', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.476+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('7545bd70-7e0b-45c5-9bf0-0ad0f589bdb9', 'Diz uma coisa que se esquece sempre de levar para um acampamento.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.47+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('c471bcae-5a33-43a8-9404-9ec7a81bdd5b', 'Diz um nó que um desbravador deve saber fazer.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.468+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('f8702436-2a4c-4be7-8cf0-5ec857987379', 'Diz uma coisa que se faz quando chove num acampamento.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.501+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('76a4d997-8a27-4cf2-9133-16a716624967', 'Diz um cântico que toda a gente sabe cantar.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.493+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('40d5b26a-ba51-4ee9-ac98-f26b78bee10f', 'Diz uma coisa que se usa para te orientares na natureza.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.491+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('b065f50b-2641-4527-8cf2-b811120b523e', 'Diz um bicho que pode aparecer na tenda durante a noite.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.474+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('5d1142d4-0adb-42eb-b56b-0b799aba2027', 'Diz um livro da Bíblia que toda a gente conhece.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.489+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('fdce7567-098a-4d86-bfe2-8034c6409d1c', 'Diz uma coisa que se encontra numa floresta.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.494+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('d55174b0-a0e0-46a2-9d5d-eac94b5973e3', 'Diz uma personagem da Bíblia que fugiu de alguém.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.492+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('f131be02-8d6b-4cdb-874d-166132735a97', 'O que nunca falta na mochila de um acampamento?', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.458+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('badeb34c-256d-44fc-98a6-81bc75874020', 'Diz uma coisa que distrai as pessoas durante o sermão.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.483+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('f0931f41-9daa-4002-bc1f-ab7d7e8a49f0', 'O que é que se cozinha numa fogueira?', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.485+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('6bc4860f-491c-445e-a3b7-1e6802a7a427', 'O que é que um desbravador leva sempre para uma reunião do clube?', false, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.498+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('0782555a-272e-4796-98e8-ae3b167b8fa0', 'O que é que se come ao pequeno-almoço?', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.462+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('efc1ff48-e21e-4afc-bce1-ea4bd9886dc0', 'Diz uma história da Bíblia em que aparece água.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.481+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('773d900d-e767-4ce3-a07e-5967a5fef6a8', 'Diz uma personagem da Bíblia que era muito corajosa.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.469+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('2a099803-fbd3-480f-b923-bd8d4e68a71a', 'Diz uma coisa que se faz antes de dormir.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.48+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('68aa45d7-d12e-496d-b9fe-8bb2f5ef89c8', 'Diz uma coisa que se aprende nos Desbravadores.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.477+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('3206c19c-0509-4c9f-b95c-d288900ae947', 'Diz uma coisa que faz um bom amigo.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.495+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('d6a59039-9c10-4dad-a15e-55f4c6afb929', 'Diz uma profissão que aparece na Bíblia.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.484+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('0105abed-1e17-4d90-ad43-ac4ad39a21d4', 'Diz uma frase que os dirigentes repetem muitas vezes.', false, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.49+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('5a5d7f8e-4645-4bb5-9f78-9a9878abc639', 'O que é que se come num almoço partilhado na igreja?', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.465+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('645c0de8-3c7a-40d7-9d29-c2e46b46bb9c', 'Diz uma parábola de Jesus.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.475+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('2f152ebc-1500-4431-94cb-cb98d330932a', 'Diz uma desculpa para chegar atrasado à igreja.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.46+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('e38a7843-aff5-4cbe-83d1-c0fa9043c8c1', 'Diz uma razão para não conseguires dormir num acampamento.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.479+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('01977d4d-2120-48db-9beb-3b904f7bf890', 'Diz uma personagem bíblica que passou fome.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.486+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('6aa42454-a12e-4973-9e01-5d3b678e8b74', 'Diz um rei da Bíblia.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.478+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('0f389e4c-c87f-422e-96d7-fbb626348071', 'Diz um sítio onde o clube devia ir numa saída.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.496+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('cedd8595-17b2-4073-8b18-20cd08313e59', 'Diz uma atividade que se faz numa reunião do clube.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.482+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('0cdfe0a0-ce4b-4079-8d58-8d45d3695774', 'Diz uma personagem bíblica que andou de barco.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.459+00');
INSERT INTO public.vanacoro_questions (id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, used_in_session_id, push_sent_at, created_by, created_at) VALUES ('0c834f02-7f52-4d6e-af8f-28ae520433b2', 'Diz uma coisa que se leva para a praia.', true, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, '2026-11-03 21:30:18.473+00');


--
-- Data for Name: vanacoro_reveals; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanacoro_roster; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanacoro_round_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanacoro_rounds; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanacoro_sessions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanacoro_settings; Type: TABLE DATA; Schema: public; Owner: -
--

-- Link de convite aleatório (8 caracteres base62); a coordenação pode gerar outro no admin.
INSERT INTO public.vanacoro_settings (id, invite_token)
SELECT 1, string_agg(
  substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
         get_byte(b, i) % 62 + 1, 1), '' ORDER BY i)
FROM (SELECT uuid_send(gen_random_uuid()) AS b) r, generate_series(0, 7) AS i
GROUP BY b;


--
-- Data for Name: vanaespada_answers; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanaespada_deck_rounds; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanaespada_decks; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanaespada_drill_prompts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanaespada_players; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanaespada_session_rounds; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanaespada_sessions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanaespada_verses; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('f79968b0-f08d-45af-8c96-1efac69bd994', 49, 6, 17, 17, 'Tomai também o capacete da salvação, e a espada do Espírito, que é a palavra de Deus.', 'Almeida (ACF)', 'easy', '{armadura,palavra}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('6d5cc3d5-83cf-420f-abf9-94632a53b94f', 43, 11, 35, 35, 'Jesus chorou.', 'Almeida (ACF)', 'medium', '{curiosidade}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('08907c4e-473d-4f8b-b2d4-1871b8852275', 1, 1, 1, 1, 'No princípio criou Deus os céus e a terra.', 'Almeida (ACF)', 'easy', '{criação,memorização}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('e00c71ed-275a-42c4-b98a-181b64e569de', 41, 16, 15, 15, 'E disse-lhes: Ide por todo o mundo, pregai o evangelho a toda criatura.', 'Almeida (ACF)', 'medium', '{missão}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('e36836aa-2309-4606-b264-313f00c7b49c', 42, 2, 7, 7, 'E deu à luz a seu filho primogênito, e envolveu-o em panos, e deitou-o numa manjedoura, porque não havia lugar para eles na estalagem.', 'Almeida (ACF)', 'medium', '{natal,história}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('90a676ba-0e1d-44f2-8f8f-b4980ab0e7e3', 40, 6, 33, 33, 'Mas, buscai primeiro o reino de Deus, e a sua justiça, e todas estas coisas vos serão acrescentadas.', 'Almeida (ACF)', 'easy', '{reino,memorização}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('9dde46ec-890f-49aa-bfd0-35fb2212e8c5', 62, 1, 9, 9, 'Se confessarmos os nossos pecados, ele é fiel e justo para nos perdoar os pecados, e nos purificar de toda a injustiça.', 'Almeida (ACF)', 'easy', '{perdão,memorização}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('433d7590-d04b-4380-bd9f-7d1779d695bc', 2, 20, 8, 8, 'Lembra-te do dia do sábado, para o santificar.', 'Almeida (ACF)', 'easy', '{sábado,memorização}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('89c2138a-cd34-4dea-b5f8-a6ed295e1ede', 50, 4, 13, 13, 'Posso todas as coisas em Cristo que me fortalece.', 'Almeida (ACF)', 'easy', '{força,memorização}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('4dee8909-c2d5-4421-bf78-ed9521f21ee1', 23, 41, 10, 10, 'Não temas, porque eu sou contigo; não te assombres, porque eu sou teu Deus; eu te fortaleço, e te ajudo, e te sustento com a destra da minha justiça.', 'Almeida (ACF)', 'hard', '{coragem,promessa}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('a8a9957a-5206-4bb2-a01f-4866f0920206', 19, 119, 105, 105, 'Lâmpada para os meus pés é tua palavra, e luz para o meu caminho.', 'Almeida (ACF)', 'easy', '{palavra,memorização}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('f7bb6663-8bbf-4bf6-8edd-e54d370b5475', 43, 3, 16, 16, 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna.', 'Almeida (ACF)', 'easy', '{salvação,memorização}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('54c26035-a7e9-4a88-a3a0-27a43eff92ab', 9, 16, 7, 7, 'Porque o SENHOR não vê como vê o homem, pois o homem vê o que está diante dos olhos, porém o SENHOR olha para o coração.', 'Almeida (ACF)', 'hard', '{carácter,história}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('a0133f1e-9c6d-4af3-a26b-0b5b14cb6262', 20, 3, 5, 6, 'Confia no SENHOR de todo o teu coração, e não te estribes no teu próprio entendimento. Reconhece-o em todos os teus caminhos, e ele endireitará as tuas veredas.', 'Almeida (ACF)', 'easy', '{confiança,desbravadores}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('59ac99f2-0a9f-4205-bd9f-de7175ec7669', 66, 14, 6, 6, 'E vi outro anjo voar pelo meio do céu, e tinha o evangelho eterno, para o proclamar aos que habitam sobre a terra, e a toda a nação, e tribo, e língua, e povo.', 'Almeida (ACF)', 'hard', '{profecia,missão}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('4116ecb4-c6e6-4fc0-855a-b2e97b7e907f', 2, 14, 14, 14, 'O SENHOR pelejará por vós, e vós vos calareis.', 'Almeida (ACF)', 'hard', '{confiança,história}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('33893502-232b-432a-9b8b-30bb5c6b2737', 45, 6, 23, 23, 'Porque o salário do pecado é a morte, mas o dom gratuito de Deus é a vida eterna, por Cristo Jesus nosso Senhor.', 'Almeida (ACF)', 'easy', '{salvação,memorização}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('8269be32-fa41-4018-865a-c232a0ef3329', 40, 5, 13, 13, 'Vós sois o sal da terra; e se o sal for insípido, com que se há de salgar?', 'Almeida (ACF)', 'medium', '{discipulado}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('bdf5e9a4-cda3-4809-8cef-bedf5767b7ab', 66, 21, 4, 4, 'E Deus limpará de seus olhos toda a lágrima; e não haverá mais morte, nem pranto, nem clamor, nem dor; porque já as primeiras coisas são passadas.', 'Almeida (ACF)', 'hard', '{esperança,promessa}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('6d66dec5-0cd7-41af-b097-12a121dd9df3', 45, 8, 28, 28, 'E sabemos que todas as coisas contribuem juntamente para o bem daqueles que amam a Deus, daqueles que são chamados segundo o seu propósito.', 'Almeida (ACF)', 'medium', '{promessa,memorização}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('aa76d2e1-f42d-4c87-8ada-47143ffc3a00', 19, 46, 1, 1, 'Deus é o nosso refúgio e fortaleza, socorro bem presente na angústia.', 'Almeida (ACF)', 'medium', '{confiança}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('350d4c58-61aa-4916-ab8e-0b65d2dfb120', 19, 23, 1, 1, 'O SENHOR é o meu pastor, nada me faltará.', 'Almeida (ACF)', 'easy', '{confiança,memorização}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('72a9daef-fa58-49b3-84ea-949f85ee9988', 1, 1, 27, 27, 'E criou Deus o homem à sua imagem; à imagem de Deus o criou; homem e mulher os criou.', 'Almeida (ACF)', 'hard', '{criação}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('9d630fad-2d35-4560-8147-4a0bf0cbce04', 20, 22, 6, 6, 'Educa a criança no caminho em que deve andar; e até quando envelhecer não se desviará dele.', 'Almeida (ACF)', 'hard', '{educação}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('48198247-b3f1-4c19-9014-db494ec87dba', 23, 40, 31, 31, 'Mas os que esperam no SENHOR renovarão as forças, subirão com asas como águias; correrão, e não se cansarão; caminharão, e não se fatigarão.', 'Almeida (ACF)', 'easy', '{esperança,memorização}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('3bf7dc63-5f45-49e9-aa70-ad560fa56abf', 24, 29, 11, 11, 'Porque eu bem sei os pensamentos que tenho a vosso respeito, diz o SENHOR; pensamentos de paz, e não de mal, para vos dar o fim que esperais.', 'Almeida (ACF)', 'medium', '{promessa,memorização}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('6a2da858-a6db-4a56-82d5-dd1ef3bc606b', 33, 6, 8, 8, 'Ele te declarou, ó homem, o que é bom; e que é o que o SENHOR pede de ti, senão que pratiques a justiça, e ames a benignidade, e andes humildemente com o teu Deus?', 'Almeida (ACF)', 'hard', '{justiça,humildade}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('614279bc-fe64-4d10-9480-ed71fa650f40', 40, 28, 19, 19, 'Portanto ide, fazei discípulos de todas as nações, batizando-os em nome do Pai, e do Filho, e do Espírito Santo.', 'Almeida (ACF)', 'medium', '{missão,memorização}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('fd8658c9-207a-4b9b-8079-d3521b5408d9', 44, 1, 8, 8, 'Mas recebereis o poder do Espírito Santo, que há de vir sobre vós; e ser-me-eis testemunhas, tanto em Jerusalém como em toda a Judeia e Samaria, e até aos confins da terra.', 'Almeida (ACF)', 'hard', '{missão,espírito}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('9063c665-253d-4b4a-b0b0-f9bad5209b57', 44, 2, 4, 4, 'E todos foram cheios do Espírito Santo, e começaram a falar noutras línguas, conforme o Espírito lhes concedia que falassem.', 'Almeida (ACF)', 'medium', '{espírito,história}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('76435836-26c6-4f25-8b57-8e613185f94a', 45, 12, 2, 2, 'E não sejais conformados com este mundo, mas sede transformados pela renovação do vosso entendimento, para que experimenteis qual seja a boa, agradável, e perfeita vontade de Deus.', 'Almeida (ACF)', 'hard', '{carácter}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('912f33cc-7cb2-4506-9f08-4b0fefd19020', 46, 13, 4, 4, 'O amor é sofredor, é benigno; o amor não é invejoso; o amor não trata com leviandade, não se ensoberbece.', 'Almeida (ACF)', 'medium', '{amor}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('ed53a7e0-794d-4cd1-acce-17ea5a8eaf4a', 55, 3, 16, 16, 'Toda a Escritura é divinamente inspirada, e proveitosa para ensinar, para repreender, para corrigir, para instruir em justiça.', 'Almeida (ACF)', 'medium', '{palavra,memorização}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('56bee79b-51fe-42a5-81f2-92e1bbd5f976', 58, 11, 1, 1, 'Ora, a fé é o firme fundamento das coisas que se esperam, e a prova das coisas que não se veem.', 'Almeida (ACF)', 'medium', '{fé,memorização}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('acb8c1d0-1658-45e5-882c-50eebfdef78a', 19, 133, 1, 1, 'Oh! Quão bom e quão suave é que os irmãos vivam em união.', 'Almeida (ACF)', 'hard', '{união,desbravadores}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('190ed64a-78fb-444d-afa0-be137683833a', 43, 14, 6, 6, 'Disse-lhe Jesus: Eu sou o caminho, e a verdade e a vida; ninguém vem ao Pai, senão por mim.', 'Almeida (ACF)', 'medium', '{salvação,memorização}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('ca22c7aa-cc1c-46f2-8659-5028679c5f76', 48, 5, 22, 23, 'Mas o fruto do Espírito é: amor, gozo, paz, longanimidade, benignidade, bondade, fé, mansidão, temperança. Contra estas coisas não há lei.', 'Almeida (ACF)', 'medium', '{espírito,desbravadores}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('4f894ead-0972-49bd-a1e0-1b34f322b22e', 51, 3, 23, 23, 'E tudo quanto fizerdes, fazei-o de todo o coração, como ao Senhor, e não aos homens.', 'Almeida (ACF)', 'hard', '{serviço,desbravadores}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('7ac2d647-6f5a-42ea-826e-b158dc7bfe4c', 5, 6, 5, 5, 'Amarás, pois, o SENHOR teu Deus de todo o teu coração, e de toda a tua alma, e de todas as tuas forças.', 'Almeida (ACF)', 'medium', '{amor,lei}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('1f82e167-102e-46c9-af87-8d4a399936c8', 6, 1, 9, 9, 'Não to mandei eu? Esforça-te, e tem bom ânimo; não temas, nem te espantes; porque o SENHOR teu Deus é contigo, por onde quer que andares.', 'Almeida (ACF)', 'easy', '{coragem,desbravadores}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('f4b7515f-fbec-4271-839c-3089b02be837', 9, 17, 45, 45, 'Davi, porém, disse ao filisteu: Tu vens a mim com espada, e com lança, e com escudo; porém eu venho a ti em nome do SENHOR dos Exércitos, o Deus dos exércitos de Israel, a quem tens afrontado.', 'Almeida (ACF)', 'hard', '{coragem,história}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('c5969398-dc5e-402e-a5b7-fad5d33fec1d', 21, 12, 1, 1, 'Lembra-te também do teu Criador nos dias da tua mocidade, antes que venham os maus dias…', 'Almeida (ACF)', 'hard', '{juventude,desbravadores}', true, NULL, '2026-11-03 21:30:17.865+00');
INSERT INTO public.vanaespada_verses (id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags, active, created_by, created_at) VALUES ('7fb9397e-ea50-4d5d-90ca-24a0cb5cbb3b', 27, 6, 22, 22, 'O meu Deus enviou o seu anjo, e fechou a boca dos leões, para que não me fizessem dano…', 'Almeida (ACF)', 'medium', '{proteção,história}', true, NULL, '2026-11-03 21:30:17.865+00');


--
-- Data for Name: vanasketch_guesses; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanasketch_pack_words; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('bc785321-5e8a-4580-bce9-3889b84456e7', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Arca de Noé', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('4a014a7e-6ec2-4640-a57d-b86a4bfb2f5f', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Cruz', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('12f73163-b843-4bcb-815f-06ed83bc8184', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Pomba', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('97978da9-19fe-4446-afc0-0ce8b05fe9a7', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Cordeiro', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('23657ec9-2703-4aae-ac3b-f4fb204b5b02', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Estrela', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('f96174a3-3ab7-4580-8806-717897541241', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Coroa', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('c3882319-8537-4c06-b756-699925737ba6', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Templo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('16462c50-fdd0-46c3-ba35-6f449a5b6481', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Serpente', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('6281bd0c-0e0c-43d2-8d34-126c271c0655', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Baleia', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('f31c1c19-e48c-41bb-aa07-6964a0a022c3', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Leão', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('7206e6bf-8511-49c2-806c-05f68f40f1c0', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Pão', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('90c1eb69-09b6-456f-be4b-cae68f3547ae', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Peixe', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('dbd7197a-fe3e-42e4-9c91-b4cf90f453a2', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Barco', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('9cf178a9-6598-4b8e-bc93-5b1cc6d332ca', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Rede', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('9b800ecb-3927-4ccd-924c-8f0939d3f2a9', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Espada', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('41691575-8a3a-4eb9-9bc8-01df29190f4a', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Escudo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('097241ac-cb81-4f88-b2b0-b9c1762f726b', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Harpa', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('3c1f05df-f874-42c4-af91-eebad6f7c2dd', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Trombeta', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('8c93c03d-b002-482e-b04f-8e56488bff32', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Poço', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('133583a6-1365-4800-8cc4-97c4b36725b3', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Videira', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('d8e633dc-0de7-40fa-9260-19405081b1e0', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Anjo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('e756243f-9f9b-4696-8c36-fc0bcebf2660', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Pastor', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('81359e69-8c29-4f5c-ad92-d9bd422f59ce', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Ovelha', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('bd4f0502-4ba4-4785-a2a2-894c533509f7', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Camelo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('05f7ff3d-a93b-4449-b18c-e0f87c1fa656', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Burro', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('18a5bea7-4788-464b-a902-601907b48fa1', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Arco-íris', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('7f45700c-e7ab-418c-95e1-a55d238483ff', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Nuvem', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('72fc17ab-42e0-4fce-b0f5-07202cce733b', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Relâmpago', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('9ed26d76-dcbe-4555-afca-0373234e1174', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Moeda', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('5947c190-52ab-43c1-aca4-f93e10759266', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Lâmpada', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('5904fc82-c507-4340-96c7-868c393b0cc3', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Uvas', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('dcb77ed1-1789-424e-bf8d-ff6acb5cb60a', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Figueira', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('aa959007-ec31-4cf3-8685-6a24cc2a7bdf', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Torre de Babel', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('d95b5f27-69f6-4df1-b814-c9bf919b5d13', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Mar Vermelho', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('06f9cf34-cc7f-41b2-9d36-54f22d12d3b2', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Funda', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('cb935aa1-21d0-4a60-9b0e-a14303dc6e53', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Gigante', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('236a1f04-3331-405e-ab68-d1e11f3b09ea', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Manjedoura', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('059fef67-2b54-4928-a085-b74af90b196b', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Tábuas da Lei', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('fe7d5eb0-cf20-4fdd-9451-714c18b6c880', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Sarça ardente', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('370cda7e-c156-4c6a-a39f-1a2a2f415f33', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Escada', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('c899b57d-e323-4db1-a3f7-d3603d3c6f33', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Muralha', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('ab325753-39f0-44e9-b501-1e40c8cca2ec', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Palmeira', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('8782a394-6449-4cb8-ad6b-93e5580c40a7', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Cesto', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('d98d3d3c-0ae3-492d-832a-0ca9dddd0c06', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Cântaro', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('62357ef8-e4d8-413e-8f1a-0a7e1c5d0454', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Sandálias', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('1dea43c8-aa1b-49fb-895c-f16e9477c503', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Coroa de espinhos', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('e411b383-d156-4ec2-8ae7-67d441477473', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Túmulo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('5e412dc6-9f18-4d28-8333-620ce8e59465', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Bastão', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('5c0feb8a-3671-405e-ad07-e637f2c89ce4', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Gafanhoto', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('c4e051f9-72a2-44f0-90a2-003d85ef514a', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Rã', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('b36f8227-3a54-4d87-b973-2cf7622d3208', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Jardim do Éden', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('b78f4248-990a-464a-9411-2e5b4a860189', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Maçã', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('fe6c2fc0-16ab-44e6-92a0-1f943862bee3', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Cajado', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('cbe2482c-80fb-4cb7-814e-f40a21b6595d', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Tenda', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('dbf8b9d7-b744-42ef-b5a5-1050cb13c8f0', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Fogo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('30e9f145-7263-4dd4-a2ee-91388f859594', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Chuva', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('5a2c43e0-e3d3-4fa0-91b5-83d31021a769', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Montanha', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('7481fafd-56c3-4a5f-85cd-24e020994994', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Rio', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('93ae835b-0015-46e0-b5d3-02b2b5909ecd', '6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Deserto', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('a1ec820e-1d9a-432f-95a0-7d55d91d190c', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Tenda', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('2e835631-0b6b-4619-bbcd-d928a0793f50', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Fogueira', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('a4974a07-7950-4278-aef5-88987cdc9078', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Bússola', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('fa727b01-6c20-4cc8-bf2a-0caa4e51e94f', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Mochila', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('6e7890f5-8aad-4168-bfaa-811db72982b3', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Lenço', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('4029db95-77c7-46e0-8671-352b073c1b37', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Apito', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('b9f704d9-39fe-44fa-8494-ea0036eacd9a', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Corda', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('11c5d702-bb16-457f-b9bf-c6e2521abe28', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Lanterna', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('aa693eb8-f4d9-46f1-aa6b-31905f25e4fb', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Mapa', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('71c63cfb-db70-45e5-a3aa-edac20849334', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Nó', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('ea25d8b3-0c0b-4fcd-b068-5b4dda624621', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Machado', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('fe4f7ee4-dbe4-4480-afb1-5f95a74767d9', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Saco-cama', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('7adaa3e3-0753-42fe-a9a1-740a81ec14ea', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Marshmallow', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('2c4c91de-3090-4bb3-a1a8-58e969f6bc46', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Cantil', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('f10efa9a-6523-4951-aecf-5abc15f40487', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Canivete', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('62c4b9f3-8e7d-43b7-8e7b-3b454d28c19c', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Binóculos', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('d02148d4-8629-45fe-96b2-0f8688d59942', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Bandeira', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('8968e520-eda3-484f-aab7-1a59727ecd87', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Floresta', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('e4aba10a-0eca-4842-9898-ea2e7a7c43f9', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Montanha', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('c8d943f1-9fb2-42de-8507-7ee75e67cb1f', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Rio', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('30de64a2-3bc2-42ab-b368-7f6f3644265b', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Canoa', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('d4d5cc83-b7eb-40ac-8c3f-9f4c92193971', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Pinheiro', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('4e7196d2-55ce-417d-b382-512630abf71a', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Cogumelo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('cc688bac-d82c-4613-aec7-26dcf080a091', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Esquilo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('6d23deb1-1802-4eb2-bce5-e8178a3840ee', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Mosquito', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('46caef02-b3e5-45e8-9cdb-fc4c6dc63848', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Lua', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('a6422681-c4ce-4867-8279-c291d2976efc', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Uniforme', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('3543c332-1adf-4641-8965-4900c3b39bee', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Árvore', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('478d1a60-a1e3-44bc-acff-688bc3e965b6', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Pegadas', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('7727a8de-bcde-4e6d-b0e0-921904227f75', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Cabana', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('1e0fdf92-3559-4589-85a5-30bb6337f628', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Ponte', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('74031ab0-3c3a-4aa7-99e6-dde7b8a0ce08', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Cascata', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('4ae92562-4e32-430f-869c-cd535eab84cc', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Pinha', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('7403de87-25e5-4add-bce5-60755e924110', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Fósforo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('a4bd04c1-6cd8-47a1-886a-a2120531eb0c', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Panela', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('4c6f3603-a68d-4399-a685-d1599189cfb9', 'fc786038-1957-4531-a3fd-ea05064ccf38', 'Lago', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('d898a6bd-ae53-4c74-b70f-717d3340ec0a', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Árvore de Natal', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('f3d9ba52-f6a0-4470-a922-15c4edf2b383', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Presépio', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('9617321c-4e46-463e-86ba-b01c488b309d', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Estrela de Belém', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('8725eb3b-2242-469b-9c4e-cec2675d3c15', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Pai Natal', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('7884ab49-0c36-4906-a8bd-5da4032a8b0b', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Rena', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('945e1b2d-5a52-41c8-a2ff-2fb00acba78d', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Presente', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('e88184af-9a97-49af-b32c-673c5fb87dc3', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Meia', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('ce0d0bca-a2ee-4aa0-9438-21b0b06a380a', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Sino', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('e0015a18-9634-4a89-9ee7-81e66dcdee14', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Vela', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('0cf28d9e-4d17-422f-9fb6-2132aa53109a', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Boneco de neve', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('2e88cd52-380b-43c4-958a-b92a2e16766b', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Floco de neve', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('c8148d81-cb37-4ecd-ae0b-102ee994240f', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Bolo-rei', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('8efaa085-5ac0-4c45-b9fa-cea64042b318', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Lareira', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('fc1d8d23-bc20-4e13-b1e8-c8330c582778', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Trenó', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('01b176ce-7414-4e04-a80f-3563e851f2c4', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Gorro', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('2015ed6f-f4e5-4260-ae52-301a9a326f76', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Bengala doce', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('f219ba23-08d9-4b51-9ba0-40c3ac196978', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Coroa de Advento', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('33b607fa-1bce-4e5c-80d7-acfeebb1372c', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Reis Magos', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('7f8db47b-6d88-4e68-b2dc-c2f0d137f175', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Camelo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('4bf9a115-b503-4335-a0eb-ba27531483df', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Pastores', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('ddb2a6f4-775a-4273-a858-4b4764a1c9d8', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Anjo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('3df45833-f025-403e-87f5-2f4434b37d24', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Manjedoura', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('f15d6ce2-fb81-40a9-bb13-e7ea8965d8e9', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Chocolate quente', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('22c93a3a-24db-41d5-af94-16749e52f6e4', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Bola de Natal', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('99ed15c6-2b76-4fa7-bceb-7283696c3fd5', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Luzes', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('34d43909-34ed-4743-b273-0f9607610b95', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Laço', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('3158e221-0dee-4955-ac7e-74d8605eab02', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Neve', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('cd16248d-f2f9-4751-aaa0-a43861c06137', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Bolachas', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('695e065c-b5e1-4d92-bc10-09190698956a', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Chaminé', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('747afe43-a0db-4d42-a66f-aa802bac584f', '1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Azevinho', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('9affca6c-b61f-4c69-95da-babddc8bb82e', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Praia', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('c41e270c-9d75-4d43-b017-6db0ac87fff4', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Sol', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('2e65f1d8-2ccb-48e2-9afc-3bbc273a23ae', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Guarda-sol', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('34834aba-81e2-4710-950a-267a1d918cd1', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Toalha', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('54844516-026d-4b91-b985-60b5552da5b7', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Óculos de sol', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('9f06fe66-e258-4fbf-a2fa-70966c26ca8b', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Gelado', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('48a00247-bfaa-40d9-afd7-4cbfdb489b83', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Melancia', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('36e9101f-d399-4ac0-b360-8024480375a0', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Castelo de areia', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('637762be-1e90-4b8d-804e-f48a602f4252', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Balde', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('ad1792d9-b025-4440-8231-005f2f9d5518', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Concha', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('a7ec7280-baa9-4d6b-a400-0d21495bbc25', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Estrela-do-mar', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('31d70dc9-c0c8-4e2b-a2de-66d1fadb801d', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Caranguejo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('81632482-0964-4085-b726-62cc412f2a1a', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Onda', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('dbf5f8a3-8122-46ae-af31-4ac8154f24e5', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Prancha de surf', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('b5fb3460-60e9-4993-878a-a355ec44ea68', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Barbatanas', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('5fe9ac54-eeec-4bf5-887f-4022927ff906', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Piscina', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('5ce35e7b-ba95-4750-afec-52bd1cefc7b1', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Boia', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('5c5b36a2-cc47-4817-88a3-8936f845c7d3', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Chinelos', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('132062e8-4156-4e57-8bdc-f141f44ff6cd', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Protetor solar', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('11c0a77e-07a0-40bc-bee5-cf2583e3b77e', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Ventoinha', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('814b8e86-d6e2-4670-a4d6-afa0e6ff76fd', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Limonada', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('d70fb622-c128-4cc4-a524-52831ff58fda', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Gaivota', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('4b495743-8df5-4444-83af-7e935f6a4eab', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Farol', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('3273f67e-9313-4752-8b15-51cda759b327', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Barco à vela', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('e9b6ab86-880f-4d60-b080-373dbe467ae1', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Bola de praia', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('bda96ef9-07fc-4346-bf7c-a5b214184f17', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Golfinho', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('6d941fe8-8ecd-448b-9e45-eb1427834653', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Palmeira', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('fd7603c2-a9a4-457f-99ac-454b2f7ad28a', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Mergulho', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('27233425-c547-464c-b010-edfa50a992b4', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Chapéu de palha', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('b396b7df-426d-402c-87af-17167efac8af', '166f18a9-dea8-4350-a9f4-17582f267a53', 'Ilha', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('d7530cdd-c511-42fe-8610-4bda6c2cf6ec', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Ovo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('54debe3e-0f19-4b07-96fa-be701d2bfcfc', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Coelho', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('96ac6ee5-a16d-4299-be95-1063521ae957', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Pinto', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('845842d0-9480-4ffb-8ac2-55c1330610cb', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Túmulo vazio', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('b669f93d-5e15-4f33-95c6-e2a4974c5adc', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Cruz', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('0ea8d8b4-342b-47fe-8fa8-f467f0f0853d', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Pedra', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('32d1aa77-8cd6-4fdf-b229-c3cfe2ddef8c', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Jardim', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('c5be6fa4-2ae3-4a14-8984-ab547a4de210', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Folar', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('754ec092-4234-4cd3-9948-dc4cf9aa7e05', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Amêndoas', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('73eb2212-5ecc-492a-98fd-90e09cf5e428', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Cesta', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('f9691799-dcc8-403d-9757-4efad51298f9', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Flores', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('4cf8bb25-5c55-4151-918d-0b6e9436b6e1', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Borboleta', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('56a417b6-17fb-4bb6-9464-6678052a3486', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Folha de palmeira', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('aa173029-0967-4bd2-8c59-3019d382fe4a', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Jumento', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('7df9508e-cc25-476b-bbb1-1d5093f909fd', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Galo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('56a61d59-6a61-411c-b335-d92c5f99b149', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Sol nascente', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('7507b77d-6f22-4cd3-80c3-034845450640', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Pão', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('a400944f-1522-4342-a3c3-86bbdf51727b', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Cálice', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('f78f3cf1-85ad-41b9-93fb-c7ca9a03cbe8', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Coroa de espinhos', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('41eea8af-e8fa-4c69-9c6b-eb5d6a7da7b1', 'a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Lençol', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('4a227617-7372-4e9f-8008-83f90f0e62e9', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Elefante', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('7e49ef0a-b020-4dd5-82cf-8f2935655a46', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Girafa', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('12e60571-440b-43a5-8833-1d605afd91ee', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Leão', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('a9be7122-a50e-4620-a623-28afd9a86afb', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Tigre', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('6364ea32-acc7-4615-b2fd-7542a83a69a9', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Macaco', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('d0a814bb-69ed-440e-b2a5-e465b8038b12', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Cobra', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('296886dc-98d7-4d89-baf2-57cd920214d5', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Tubarão', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('58b44101-ef9d-4d7c-9eb4-7d8c4b0d380d', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Polvo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('6fb77acb-b246-4eb4-98d0-287c0472ab19', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Tartaruga', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('0e7fbfdd-8a03-4317-98aa-0b2d01323fca', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Pinguim', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('f403e8be-9cb3-4f81-9dc5-7eac8b2811ec', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Coruja', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('9d58e55c-7a41-49f5-8546-0b90b4fc3a54', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Papagaio', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('0b103b02-b685-4615-ad8d-1944e38307b3', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Galinha', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('9f72e89c-f208-46cd-84d4-518bce7817cb', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Vaca', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('d1e30baa-536e-41bf-9e8c-3040d0224055', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Porco', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('0fe88626-5240-4579-b0e1-073ea2b90e20', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Cavalo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('afd449e3-ec5d-48df-81de-a2dee123d751', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Cão', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('37fd781a-1534-4669-8f8e-90c4d6d75f25', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Gato', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('e03898cd-fb59-4f83-9af7-687ea820bb59', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Rato', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('db71428d-de47-4e4d-b625-eeb9b90a7073', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Coelho', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('ab9badd9-c8a9-4c65-9192-7ad0f6668c3b', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Urso', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('7c1a321e-449c-4b61-b420-3a2688c0d3e6', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Raposa', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('f1befce4-f3ae-44b1-949f-6cc985f0b004', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Lobo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('9cd22c9b-c32c-49dd-8692-f68633330f86', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Sapo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('d1484527-fae3-4891-8fd8-271296ef2ee1', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Abelha', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('a14ef10e-217c-46f3-abc8-8edf6db72773', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Aranha', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('adf71cfb-dabf-4c9d-bef6-944f3c48551b', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Caracol', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('e774c641-e31a-49b4-81f3-e97ef375fa03', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Formiga', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('a7f49fd2-a5bb-458a-9148-8311280b0989', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Borboleta', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('e2ee1cf8-d5e6-419a-a718-ad8a52ec94ff', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Canguru', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('5bb17650-9f0e-422e-b98e-cb76f2e3b7d3', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Zebra', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('24761e9f-3ab3-4d39-b0c0-8548693d8488', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Hipopótamo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('2f6a200a-dd82-431c-8553-19be8329399a', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Crocodilo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('3190d82d-ea7f-4fdd-a851-a152b253a5a2', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Baleia', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('da52b7ee-5a05-4604-ae1c-ded5deeadb68', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Morcego', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('dd3121ee-6920-4cee-a0b2-fe10ee0ef66f', '7c2b64f0-d3c4-4220-94e0-35389f108690', 'Ovelha', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('2243acaf-4a3d-4d73-95ff-85bb1731fd0e', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Telemóvel', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('dcdbc511-63b3-4460-839b-cbf9a05745d4', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Óculos', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('70e81f0b-2a1b-49bb-95e4-8945497af9a5', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Relógio', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('8847ea81-0c39-40d8-a02a-e51fa63695d1', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Chave', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('bd0c7c59-f50a-4577-9f9b-fa4cd92629eb', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Guarda-chuva', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('65e898f9-1590-4e69-a477-490009196b52', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Tesoura', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('e7d35088-c748-43ff-9722-5dc3dd066ad9', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Lápis', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('9869236b-f31a-4e32-8093-f95458544f4a', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Livro', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('ca63c5b6-7d42-48e3-aaef-9f1d865aeafa', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Cadeira', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('affff7a4-a78f-48fb-a0bd-54fc9bd36858', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Cama', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('611ef642-5e86-42fa-84c3-92311257abfe', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Televisão', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('92f0853b-d83e-45c5-8e39-850ec4d99617', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Frigorífico', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('2b69e71c-81e0-4bb7-8e13-82739ccd65d5', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Escova de dentes', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('74b40e49-2bef-4329-915f-e191ce0264cd', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Sapato', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('97471c4f-bafe-4f9f-8672-73a9b329db79', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Chapéu', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('8f21a1e0-5f8c-4ff0-96d1-46fa990de2b0', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Bicicleta', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('af9542a4-4101-4b2a-982f-f540647f9d51', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Carro', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('860af8f4-90b9-46cb-b5d0-8246b024de2a', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Avião', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('9e3e9f3c-1006-401e-a899-3fe24605cfef', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Comboio', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('8de5e56a-04b4-4d2e-bcf1-8d201f00a427', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Foguetão', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('26dc2739-4abe-48ee-823c-e8fe368a52d8', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Bola', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('4c176df7-1a64-4037-afca-399ebcdd4944', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Guitarra', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('ee9fb0f2-a75d-43f1-b528-2ab2e6b1e56d', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Piano', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('d305dfe5-38ed-41c5-ad10-308d0a804232', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Bolo', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('914bc137-5dd4-4e24-868a-d97cff9c5f3d', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Pizza', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('1f1d759f-d865-4763-bb64-29dfb64b36cd', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Hambúrguer', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('b97e2bf7-f983-4a99-bde8-9aced405bfba', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Banana', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('e7316ec6-1724-44d0-9edc-878295481cd0', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Cenoura', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('e854917d-3419-4032-ba48-dc0b4fddad64', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Ananás', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('1383c323-66f9-4801-b7b3-88b86ba71521', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Escola', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('c8f960c7-39e3-42c7-b659-5f1292b11a61', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Casa', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('5fca800e-278f-4482-9a69-8be261991c82', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Computador', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('0968da93-f27b-42a1-9e48-87687fc2516a', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Mochila', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('8bb42f58-5fab-4874-a261-d914c2f57626', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Bateria', '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_pack_words (id, pack_id, word, created_at) VALUES ('a74d93a0-eadf-433d-bc12-b413022c2fd9', 'ff7f4c0e-00dd-48be-9581-f73344624e44', 'Robô', '2026-11-03 21:30:18.289+00');


--
-- Data for Name: vanasketch_packs; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.vanasketch_packs (id, name, emoji, description, is_default, sort_order, created_at) VALUES ('6a868e4f-d33d-4b09-8801-47bbacfddb01', 'Bíblia', '📖', 'Personagens, objetos e histórias da Bíblia', true, 1, '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_packs (id, name, emoji, description, is_default, sort_order, created_at) VALUES ('fc786038-1957-4531-a3fd-ea05064ccf38', 'Acampamento', '🏕️', 'Desbravadores, natureza e vida ao ar livre', true, 2, '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_packs (id, name, emoji, description, is_default, sort_order, created_at) VALUES ('1a5924a7-b7c8-4b0d-a291-5aa664c5bc7a', 'Natal', '🎄', 'Para os eventos de Natal', false, 3, '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_packs (id, name, emoji, description, is_default, sort_order, created_at) VALUES ('166f18a9-dea8-4350-a9f4-17582f267a53', 'Verão', '☀️', 'Praia, calor e férias', false, 4, '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_packs (id, name, emoji, description, is_default, sort_order, created_at) VALUES ('a9890bc1-fc23-4585-bdc0-d4053eb5e263', 'Páscoa', '🐣', 'Para os eventos da Páscoa', false, 5, '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_packs (id, name, emoji, description, is_default, sort_order, created_at) VALUES ('7c2b64f0-d3c4-4220-94e0-35389f108690', 'Animais', '🐾', 'Fácil para os mais novos', false, 6, '2026-11-03 21:30:18.289+00');
INSERT INTO public.vanasketch_packs (id, name, emoji, description, is_default, sort_order, created_at) VALUES ('ff7f4c0e-00dd-48be-9581-f73344624e44', 'Dia a dia', '🏠', 'Objetos, comida e transportes', false, 7, '2026-11-03 21:30:18.289+00');


--
-- Data for Name: vanasketch_players; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanasketch_rounds; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanasketch_sessions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanasketch_strokes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanatrilha_daily_runs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanatrilha_questions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('aa4caf2e-a08c-4104-a0ce-597e74b7ed1c', 1, 'personagens', 'facil', 'Quem foi escolhido por Deus para tirar o povo de Israel do Egito?', '["Arão", "Moisés", "José", "Josué"]', 1, 'Êxodo 3:10', 'Na sarça ardente, Deus disse a Moisés: «Vem agora, e eu te enviarei a Faraó, para que tires o meu povo do Egito.»', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('eba7f635-4d9d-4c58-8c3a-a84bed809241', 1, 'milagres', 'facil', 'De onde falou Deus com Moisés no monte Horebe?', '["De uma nuvem escura", "De uma sarça que ardia sem se queimar", "De uma coluna de fogo", "Do meio de um rio"]', 1, 'Êxodo 3:2', 'Moisés viu uma sarça (um arbusto) a arder, mas o fogo não a consumia. Foi dali que Deus o chamou.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('6246c5a3-05ff-425b-894a-5a0740169577', 1, 'personagens', 'facil', 'Quem encontrou o bebé Moisés num cesto junto ao rio?', '["A filha de Faraó", "Miriã, a irmã dele", "Uma escrava egípcia", "A mulher de Faraó"]', 0, 'Êxodo 2:5-6', 'A filha de Faraó foi lavar-se ao rio, viu o cesto entre os juncos e teve compaixão do menino.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('31fe40a4-12f7-4cde-99c8-7e6ab28d0287', 1, 'lugares', 'facil', 'Em que rio do Egito foi posto o cesto com o bebé Moisés?', '["Jordão", "Eufrates", "Nilo", "Tigre"]', 2, 'Êxodo 2:3', 'A mãe de Moisés pôs o cesto nos juncos à beira do rio do Egito, o Nilo, para o esconder da ordem de Faraó.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('0299760e-8cc6-4469-bec2-4e39d4a7c737', 1, 'numeros', 'facil', 'Quantas pragas enviou Deus sobre o Egito?', '["7", "10", "12", "3"]', 1, 'Êxodo 7–12', 'Foram dez pragas, desde a água em sangue até à morte dos primogénitos, antes de Faraó deixar o povo sair.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('e3437e31-6526-4006-9c6d-62de29a03af6', 1, 'milagres', 'media', 'Qual foi a primeira praga do Egito?', '["Rãs por todo o lado", "Gafanhotos", "A água do rio transformou-se em sangue", "Três dias de trevas"]', 2, 'Êxodo 7:20', 'Arão levantou a vara e feriu as águas do rio: toda a água se tornou em sangue e os peixes morreram.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('33689bf0-9e9e-4628-978a-39b19a0630fe', 1, 'personagens', 'media', 'Quem ajudou Moisés a falar com Faraó, porque falava bem?', '["Arão, o seu irmão", "Josué, o seu ajudante", "Jetro, o seu sogro", "Calebe, o espia"]', 0, 'Êxodo 4:14-16', 'Moisés dizia que não sabia falar bem. Deus respondeu que Arão, o seu irmão, falaria ao povo por ele.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('b068f258-b8cf-4bb8-9f80-92abde9d257c', 1, 'versiculos', 'media', 'Completa a mensagem de Deus a Faraó: «Deixa ir o meu povo, para que me ___ no deserto.»', '["abandone", "sirva", "procure", "esqueça"]', 1, 'Êxodo 7:16', 'Deus queria o seu povo livre para O servir e adorar: «Deixa ir o meu povo, para que me sirva no deserto.»', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('b5c43872-d2ac-4a22-a643-a58a6853d37f', 1, 'lugares', 'media', 'Em que terra do Egito viviam os israelitas?', '["Gósen", "Canaã", "Midiã", "Moabe"]', 0, 'Êxodo 8:22', 'Os israelitas viviam em Gósen. Durante as pragas, Deus protegeu essa terra, e as moscas não chegaram lá.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('4d3dd029-eb20-4ab4-8815-4a40147e5a1b', 1, 'versiculos', 'media', 'Quando Moisés perguntou o nome de Deus, o que Ele respondeu?', '["EU SOU O QUE SOU", "O Todo-Poderoso", "O Bom Pastor", "O Rei dos reis"]', 0, 'Êxodo 3:14', 'Deus disse a Moisés: «EU SOU O QUE SOU». Mostra que Deus sempre existiu e nunca muda.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('e46261a1-10d2-4a1b-89b3-36415fbfaa28', 1, 'personagens', 'dificil', 'Como se chamavam as parteiras que não obedeceram à ordem de Faraó de matar os meninos?', '["Sifrá e Puá", "Raquel e Lia", "Débora e Jael", "Rute e Noemi"]', 0, 'Êxodo 1:15-17', 'Sifrá e Puá temiam a Deus e deixaram viver os meninos, apesar da ordem do rei do Egito.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('55d9db71-798e-4f09-be61-49006dadeeeb', 1, 'lugares', 'dificil', 'Para onde fugiu Moisés depois de matar um egípcio?', '["Para Gósen", "Para a terra de Midiã", "Para Edom", "Para a Babilónia"]', 1, 'Êxodo 2:15', 'Moisés fugiu de Faraó e foi viver para a terra de Midiã, onde se casou com Zípora e foi pastor.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('24c666b8-07ba-4003-8416-c88bbfef0bb1', 1, 'numeros', 'dificil', 'Que idade tinha Moisés quando falou com Faraó?', '["40 anos", "60 anos", "80 anos", "120 anos"]', 2, 'Êxodo 7:7', 'Moisés tinha 80 anos e Arão 83 quando falaram com Faraó. Deus usa pessoas de todas as idades!', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('166f04f4-12fc-4245-af62-91f8a890b476', 1, 'milagres', 'dificil', 'Qual destes sinais Deus deu a Moisés junto à sarça ardente?', '["A sua vara floresceu", "A sua cara passou a brilhar", "A sua mão ficou leprosa e depois voltou a ficar sã", "Caiu fogo do céu"]', 2, 'Êxodo 4:6-7', 'Moisés pôs a mão no peito e ela ficou leprosa, branca como a neve. Voltou a pô-la e ficou curada.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('7c0c39db-0300-4ccc-a83f-92f34d056399', 1, 'numeros', 'dificil', 'Em que dia do primeiro mês devia ser morto o cordeiro da Páscoa?', '["No dia 1", "No dia 7", "No dia 10", "No dia 14"]', 3, 'Êxodo 12:6', 'O cordeiro era escolhido no dia 10 e sacrificado ao fim da tarde do dia 14. O sangue nas portas protegia as famílias.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('0f63c011-67ee-4ee2-a6c5-3c2e5c6df651', 2, 'milagres', 'facil', 'O que aconteceu ao mar quando Moisés estendeu a mão?', '["Secou para sempre", "Ficou gelado", "Abriu-se e o povo passou em seco", "Ficou vermelho como sangue"]', 2, 'Êxodo 14:21-22', 'Deus abriu o mar e os israelitas passaram pelo meio, em terra seca, com as águas como um muro à direita e à esquerda.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('8d3f0b79-59ef-4c80-9ff7-f0d15d373433', 2, 'milagres', 'facil', 'O que guiava o povo de Israel de dia e de noite?', '["Uma estrela brilhante", "Uma coluna de nuvem de dia e uma coluna de fogo de noite", "Um anjo com uma tocha", "O sol e a lua"]', 1, 'Êxodo 13:21', 'Deus ia à frente do povo: de dia numa coluna de nuvem para os guiar, de noite numa coluna de fogo para os iluminar.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('ceddedc7-e33b-4e14-ae47-6de29b00744a', 2, 'personagens', 'facil', 'Que rei perseguiu os israelitas com os seus carros até ao Mar Vermelho?', '["Nabucodonosor", "Herodes", "Saul", "Faraó"]', 3, 'Êxodo 14:8', 'Faraó arrependeu-se de deixar o povo sair e perseguiu-os com o exército e os carros do Egito.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('97b544f2-ba5e-47d3-b7de-1bc6f6de5a3c', 2, 'personagens', 'facil', 'Quem pegou num tamboril e cantou com as mulheres depois da travessia?', '["Miriã", "Débora", "Raabe", "Ana"]', 0, 'Êxodo 15:20-21', 'Miriã, irmã de Moisés e Arão, tocou tamboril e cantou: «Cantai ao Senhor, porque sumamente se exaltou.»', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('9a123f31-1dc6-479e-86e1-f302cf414178', 2, 'versiculos', 'facil', 'Completa o que Moisés disse ao povo junto ao mar: «Não temais; estai quietos e vede o ___ do Senhor.»', '["castigo", "livramento", "templo", "rosto"]', 1, 'Êxodo 14:13', 'Com o exército de Faraó atrás e o mar à frente, Moisés pediu ao povo que confiasse: Deus ia salvá-los.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('dfe682c4-c663-47d7-ab6c-62978d4407e2', 2, 'milagres', 'media', 'No Mar Vermelho, o que fez o vento forte que Deus mandou durante toda a noite?', '["Separou as águas do mar", "Derrubou as tendas", "Apagou a coluna de fogo", "Levou os egípcios para longe"]', 0, 'Êxodo 14:21', 'Deus fez soprar um forte vento oriental toda a noite, que abriu as águas e secou o fundo do mar.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('92f3064b-aa0e-42c0-bda2-ce715712f412', 2, 'personagens', 'media', 'De quem eram os ossos que Moisés levou ao sair do Egito?', '["De Abraão", "De José", "De Jacó", "De Isaque"]', 1, 'Êxodo 13:19', 'José tinha pedido que os seus ossos fossem levados para a Terra Prometida quando Deus libertasse o povo.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('3312c3a2-c8e5-4d44-aa8b-5fbabdd88c96', 2, 'lugares', 'media', 'Porque é que Deus não levou o povo pelo caminho da terra dos filisteus, que era mais curto?', '["Porque o caminho estava inundado", "Porque lá viviam gigantes", "Para o povo não desistir ao ver a guerra", "Porque Faraó guardava esse caminho"]', 2, 'Êxodo 13:17', 'Deus sabia que o povo podia ter medo da guerra e querer voltar ao Egito. Por isso levou-os pelo deserto.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('810596f7-2a52-4523-ad6d-52bbc990ef78', 2, 'milagres', 'media', 'Na noite antes da travessia, para onde foi a coluna de nuvem?', '["Para cima do Egito", "Para o meio do mar", "Para entre o exército egípcio e o povo de Israel", "Para o alto do monte"]', 2, 'Êxodo 14:19-20', 'A nuvem pôs-se atrás do povo: era escuridão para os egípcios e luz para Israel, e assim não se aproximaram.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('a7eac7a5-2ed2-4e37-9088-108cc72a9ef4', 2, 'versiculos', 'media', 'Completa o cântico de Moisés: «O Senhor é a minha força e o meu ___.»', '["escudo", "cântico", "pastor", "refúgio"]', 1, 'Êxodo 15:2', 'Depois de atravessarem o mar, Moisés e o povo cantaram: «O Senhor é a minha força e o meu cântico; ele me foi por salvação.»', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('cb02ffb7-8583-4352-b0c7-f0c6c8e91336', 2, 'numeros', 'dificil', 'Quantos carros escolhidos levou Faraó para perseguir Israel?', '["100", "300", "600", "1000"]', 2, 'Êxodo 14:7', 'Faraó levou 600 carros escolhidos e todos os outros carros do Egito. Mesmo assim, Deus salvou o seu povo.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('7c9e8157-c878-418d-9c14-09ad53ad2278', 2, 'lugares', 'dificil', 'Junto de que lugar acamparam os israelitas antes de atravessar o mar?', '["Pi-Hairote", "Jericó", "Betel", "Hebrom"]', 0, 'Êxodo 14:2', 'Deus mandou o povo acampar diante de Pi-Hairote, entre Migdol e o mar, diante de Baal-Zefom.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('adf0be6b-8334-4a09-aecb-9aeff9c4c4e9', 2, 'milagres', 'dificil', 'O que aconteceu às rodas dos carros egípcios dentro do mar?', '["Pegaram fogo", "Deus tirou-lhes as rodas e os carros andavam com dificuldade", "Transformaram-se em pedra", "Ficaram presas em gelo"]', 1, 'Êxodo 14:25', 'Deus fez com que as rodas saíssem dos carros. Os egípcios disseram: «Fujamos, porque o Senhor peleja por eles.»', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('559c09ac-d6b7-43de-84a9-9a5ee461a621', 2, 'lugares', 'dificil', 'Em que deserto entrou o povo logo a seguir ao Mar Vermelho, andando três dias sem água?', '["Deserto de Sin", "Deserto de Parã", "Deserto de Sur", "Deserto de Zim"]', 2, 'Êxodo 15:22', 'Depois do Mar Vermelho, Moisés levou o povo ao deserto de Sur. Andaram três dias sem encontrar água.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('466258b1-59f4-45ba-9507-e463e6e4c962', 2, 'numeros', 'dificil', 'Quantos anos viveram os filhos de Israel no Egito?', '["40 anos", "120 anos", "430 anos", "1000 anos"]', 2, 'Êxodo 12:40-41', 'Os filhos de Israel viveram no Egito 430 anos. No fim desse tempo, no mesmo dia, saíram todos.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('4cad19b5-336a-44ca-9c89-7f8dd738b416', 3, 'milagres', 'facil', 'Que alimento Deus mandou do céu todas as manhãs no deserto?', '["Figos", "Maná", "Peixe", "Pão de trigo"]', 1, 'Êxodo 16:14-15', 'De manhã, o chão aparecia coberto de uma coisa miúda e branca. Os israelitas chamaram-lhe maná.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('919b2411-19b9-4cb2-9c4e-37cb108274aa', 3, 'milagres', 'facil', 'Em Refidim, de onde saiu água para o povo beber?', '["De um poço antigo", "De uma nuvem", "De uma rocha que Moisés feriu com a vara", "De um rio escondido"]', 2, 'Êxodo 17:6', 'Deus mandou Moisés ferir a rocha com a vara, e dela saiu água para todo o povo.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('70ed2bcd-86b5-4df6-8030-67f9c059c316', 3, 'personagens', 'facil', 'Contra quem murmurou (se queixou) o povo no deserto por falta de comida?', '["Contra Josué e Calebe", "Contra Moisés e Arão", "Contra Faraó", "Contra Jetro"]', 1, 'Êxodo 16:2', 'O povo queixou-se contra Moisés e Arão, dizendo que no Egito tinham pão com fartura. Mas Deus cuidou deles.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('3c837c57-cb44-47b6-ad97-cec3443a01f5', 3, 'numeros', 'facil', 'Em que dia da semana não caía maná?', '["No primeiro dia", "No terceiro dia", "No sétimo dia, o sábado", "Caía todos os dias"]', 2, 'Êxodo 16:26', 'Durante seis dias caía maná. No sétimo dia, o sábado, não caía: era dia de descanso.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('6ef2887c-6c90-4c5e-a851-b4b5ce84be58', 3, 'milagres', 'facil', 'Que aves Deus enviou ao fim da tarde para o povo comer carne?', '["Pombas", "Codornizes", "Galinhas", "Águias"]', 1, 'Êxodo 16:13', 'À tarde vieram codornizes que cobriram o arraial, e de manhã havia maná à volta do acampamento.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('54d79c4c-1793-4cb6-a47c-66b673432fc7', 3, 'numeros', 'media', 'No sexto dia, quanto maná devia cada pessoa apanhar?', '["Metade", "O mesmo de sempre", "O dobro", "Nenhum"]', 2, 'Êxodo 16:22-23', 'No sexto dia apanhavam o dobro, para terem comida no sábado, o dia santo de descanso.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('62a456b8-2813-4f6e-b5cd-59246a728918', 3, 'milagres', 'media', 'O que acontecia ao maná guardado para o dia seguinte (sem ser para o sábado)?', '["Transformava-se em pedra", "Criava bichos e cheirava mal", "Ficava mais doce", "Transformava-se em ouro"]', 1, 'Êxodo 16:20', 'Alguns guardaram maná para o dia seguinte, mas ele criou bichos e cheirou mal. Deus queria que confiassem n''Ele cada dia.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('a0dc2162-0338-4fa8-9e76-6b22ff4c6c96', 3, 'versiculos', 'media', 'Segundo a Bíblia, o maná era branco como semente de coentro e o seu sabor era como…', '["bolos de mel", "sal", "uvas", "azeite"]', 0, 'Êxodo 16:31', 'A Bíblia diz que o maná era branco como semente de coentro, e o seu sabor como bolos de mel.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('a20a900b-08bc-4f7a-a347-1bc3247fa2fc', 3, 'personagens', 'media', 'Quem segurou os braços de Moisés durante a batalha contra Amaleque?', '["Josué e Calebe", "Arão e Hur", "Nadabe e Abiú", "Eleazar e Finéias"]', 1, 'Êxodo 17:12', 'Enquanto Moisés tinha as mãos levantadas, Israel vencia. Quando se cansou, Arão e Hur seguraram-lhe as mãos até ao pôr do sol.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('d02d6bbe-e99b-4e53-a3d0-049855d98b01', 3, 'lugares', 'media', 'Em que lugar a água amarga ficou doce depois de Moisés lançar nela um pedaço de madeira?', '["Elim", "Refidim", "Mara", "Sinai"]', 2, 'Êxodo 15:23-25', 'Em Mara a água era amarga. Deus mostrou a Moisés um lenho; ele lançou-o na água e ela ficou doce.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('c62bbc66-a064-4e63-8ee0-6c1a26d4eb54', 3, 'numeros', 'dificil', 'Qual era a porção de maná que cada pessoa devia apanhar por dia?', '["Um ómer", "Um efa", "Um talento", "Um siclo"]', 0, 'Êxodo 16:16', 'Deus mandou apanhar um ómer por pessoa, conforme o número de pessoas de cada tenda.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('cae53c30-442e-4bc8-af4a-175a2c28e57d', 3, 'lugares', 'dificil', 'Que nomes deu Moisés ao lugar onde o povo discutiu por causa da água?', '["Mara e Elim", "Massá e Meribá", "Gilgal e Betel", "Sin e Sur"]', 1, 'Êxodo 17:7', 'Chamou-lhe Massá (prova) e Meribá (contenda), porque o povo discutiu e duvidou se o Senhor estava com eles.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('b2ec0c79-a610-4cba-834c-7022d57c4c60', 3, 'personagens', 'dificil', 'Quem comandou os soldados de Israel na batalha contra Amaleque?', '["Calebe", "Arão", "Josué", "Hur"]', 2, 'Êxodo 17:9-10', 'Moisés mandou Josué escolher homens e lutar contra Amaleque, enquanto ele orava no alto do outeiro.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('b11dea26-e7b7-4556-83b7-db4201dc4ab7', 3, 'numeros', 'dificil', 'Durante quantos anos comeu o povo de Israel o maná?', '["7 anos", "12 anos", "40 anos", "70 anos"]', 2, 'Êxodo 16:35', 'Os filhos de Israel comeram maná 40 anos, até chegarem à fronteira da terra de Canaã.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('7406bf31-c6fe-4249-a2ab-bf0273d0ab5d', 3, 'versiculos', 'dificil', 'Depois de vencer Amaleque, Moisés construiu um altar. Que nome lhe deu?', '["O Senhor proverá", "O Senhor é paz", "O Senhor é a minha bandeira", "O Senhor é o meu pastor"]', 2, 'Êxodo 17:15', 'Moisés chamou ao altar «O Senhor é a minha bandeira» (Jeová-Nissi), porque a vitória veio de Deus.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('549006c5-3396-4013-914b-0695128ad10e', 4, 'numeros', 'facil', 'Quantos mandamentos Deus deu no monte Sinai?', '["5", "7", "10", "12"]', 2, 'Êxodo 20:1-17', 'Deus deu os Dez Mandamentos, que mostram como amar a Deus e amar as outras pessoas.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('3ee1c8bd-f6be-46f6-8b9b-5ba12c1e27a2', 4, 'milagres', 'facil', 'Onde escreveu Deus os Dez Mandamentos?', '["Em rolos de papiro", "Em duas tábuas de pedra", "Numa parede do templo", "Em peles de animais"]', 1, 'Êxodo 31:18', 'Deus deu a Moisés duas tábuas de pedra, escritas pelo dedo de Deus.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('297f132b-29e5-4aa7-9922-cdc61b40b5e9', 4, 'personagens', 'facil', 'Quem subiu ao monte Sinai para falar com Deus e receber a Lei?', '["Arão", "Josué", "Moisés", "Faraó"]', 2, 'Êxodo 19:20', 'Deus desceu sobre o monte Sinai e chamou Moisés ao cimo do monte. Moisés subiu.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('6dfd4de8-c860-4ab5-b25a-ea63723cbcd2', 4, 'versiculos', 'facil', 'Completa o quarto mandamento: «Lembra-te do dia do ___, para o santificar.»', '["jejum", "sábado", "perdão", "trabalho"]', 1, 'Êxodo 20:8', 'O quarto mandamento pede para guardarmos o sábado como dia santo, de descanso e de encontro com Deus.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('61434132-036f-4c42-b196-0cff8dbad5fa', 4, 'lugares', 'facil', 'Em que monte recebeu Moisés os Dez Mandamentos?', '["Monte Carmelo", "Monte das Oliveiras", "Monte Ararate", "Monte Sinai"]', 3, 'Êxodo 19:20; 31:18', 'Foi no monte Sinai que Deus falou com Moisés e lhe deu as tábuas da Lei.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('78f0c9e8-814d-4a2f-9701-975ecb77fd8a', 4, 'numeros', 'media', 'Quantos dias e noites esteve Moisés no monte com Deus?', '["7", "12", "40", "100"]', 2, 'Êxodo 24:18', 'Moisés entrou na nuvem, subiu ao monte e lá esteve quarenta dias e quarenta noites.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('09d9749e-d6b0-43bd-b2b5-a9c4ad820cbf', 4, 'personagens', 'media', 'Quem fez o bezerro de ouro quando o povo se cansou de esperar por Moisés?', '["Josué", "Arão", "Hur", "Calebe"]', 1, 'Êxodo 32:2-4', 'Arão pediu ao povo os brincos de ouro e fez com eles um bezerro. Foi um grande pecado contra Deus.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('45ed0b1a-8103-4472-b221-2a0ed0f0158b', 4, 'milagres', 'media', 'O que aconteceu à cara de Moisés quando desceu do monte?', '["Brilhava", "Ficou leprosa", "Ficou cheia de rugas", "Ficou queimada pelo sol"]', 0, 'Êxodo 34:29-30', 'Moisés tinha estado com Deus e a pele do seu rosto resplandecia. O povo até teve medo de se aproximar.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('6df53bec-b038-45ac-bdda-6cfc3ebac633', 4, 'versiculos', 'media', 'Completa o primeiro mandamento: «Não terás outros ___ diante de mim.»', '["reis", "amigos", "deuses", "templos"]', 2, 'Êxodo 20:3', 'O primeiro mandamento ensina que só Deus merece o primeiro lugar na nossa vida.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('c708979c-9bda-4c3f-8138-3fc18e053b9a', 4, 'milagres', 'media', 'Como estava o monte Sinai quando Deus desceu sobre ele?', '["Coberto de neve", "Fumegava e tremia", "Cheio de flores", "Em silêncio e às escuras"]', 1, 'Êxodo 19:18', 'O monte fumegava, porque o Senhor desceu sobre ele em fogo, e todo o monte tremia muito.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('f4012a0f-bd6a-4dfa-b3a7-11cef1f171a9', 4, 'milagres', 'dificil', 'O que fez Moisés às primeiras tábuas da Lei quando viu o bezerro de ouro?', '["Escondeu-as numa caverna", "Deu-as a Arão", "Atirou-as e partiu-as ao pé do monte", "Enterrou-as"]', 2, 'Êxodo 32:19', 'Moisés ficou muito triste e irado ao ver o povo a adorar o bezerro. Atirou as tábuas e partiu-as. Depois Deus deu-lhe outras.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('d8d47400-b2ce-4ce0-9673-afa2cfb6c341', 4, 'versiculos', 'dificil', 'Qual destes mandamentos vem com a promessa de uma vida longa?', '["Não furtarás", "Honra a teu pai e a tua mãe", "Não matarás", "Não dirás falso testemunho"]', 1, 'Êxodo 20:12', '«Honra a teu pai e a tua mãe, para que se prolonguem os teus dias na terra.» É o mandamento com promessa (Efésios 6:2).', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('3ba1b4a5-b4ba-468b-a41e-3d714196deb9', 4, 'personagens', 'dificil', 'Quem acompanhou Moisés quando ele subiu ao monte de Deus?', '["Arão, o seu irmão", "Josué, o seu servidor", "Calebe", "Jetro, o seu sogro"]', 1, 'Êxodo 24:13', 'Moisés levantou-se com Josué, o seu servidor, e subiu ao monte de Deus. Josué estava a ser preparado para ser líder.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('3a364e6e-3d3b-47e9-bff1-b16ca6dc3710', 4, 'numeros', 'dificil', 'Em que mês depois de sair do Egito chegou o povo ao deserto do Sinai?', '["No primeiro mês", "No terceiro mês", "No sétimo mês", "No décimo segundo mês"]', 1, 'Êxodo 19:1', 'No terceiro mês depois de saírem do Egito, os filhos de Israel chegaram ao deserto do Sinai.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('5793a6c0-6f15-4882-a731-a124208a98e2', 4, 'lugares', 'dificil', 'Que outro nome dá a Bíblia ao monte de Deus onde foi feita a aliança com Israel?', '["Horebe", "Carmelo", "Moriá", "Sião"]', 0, 'Êxodo 3:1; Deuteronómio 5:2', 'O monte de Deus também é chamado Horebe. Foi lá que Moisés viu a sarça e que Deus fez aliança com o povo.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('27451d71-c36d-4e34-834d-b5118b8dbadb', 5, 'numeros', 'facil', 'Quantos espias enviou Moisés à terra de Canaã?', '["2", "7", "10", "12"]', 3, 'Números 13:2-16', 'Moisés enviou 12 espias, um de cada tribo de Israel, para ver como era a terra.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('5600e4ff-b79c-453b-a44a-d24e3500ef05', 5, 'personagens', 'facil', 'Quais foram os dois espias que confiaram em Deus e deram um bom relatório?', '["Arão e Hur", "Josué e Calebe", "Moisés e Arão", "Nadabe e Abiú"]', 1, 'Números 14:6-9', 'Josué e Calebe disseram: «A terra é muito boa… o Senhor é connosco; não os temais.»', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('352f0c4a-061b-43db-b440-1675754534f6', 5, 'versiculos', 'facil', 'Os espias disseram que Canaã era uma terra que mana…', '["ouro e prata", "leite e mel", "água e vinho", "azeite e trigo"]', 1, 'Números 13:27', '«Fomos à terra a que nos enviaste; e verdadeiramente mana leite e mel.» Era uma terra muito rica.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('3ce42a4f-8256-4429-88e7-e6cbed593b71', 5, 'personagens', 'facil', 'Que espia acalmou o povo e disse «Subamos animosamente» para conquistar a terra?', '["Josué", "Calebe", "Arão", "Coré"]', 1, 'Números 13:30', 'Calebe fez calar o povo e disse: «Subamos animosamente e possuamo-la em herança; porque certamente prevaleceremos.»', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('21ea287a-2dd8-429e-8221-88c9a3392681', 5, 'milagres', 'facil', 'Quando o povo foi mordido por serpentes, o que mandou Deus Moisés fazer?', '["Um altar de pedra", "Uma serpente de bronze numa haste", "Um bezerro de ouro", "Uma tenda nova"]', 1, 'Números 21:8-9', 'Quem olhasse para a serpente de bronze posta na haste ficava curado. Jesus comparou-se a esta serpente (João 3:14).', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('714ab418-c70e-4347-8e0d-f3e6f8b61663', 5, 'numeros', 'media', 'Durante quantos dias os espias observaram a terra de Canaã?', '["7 dias", "12 dias", "30 dias", "40 dias"]', 3, 'Números 13:25', 'Ao fim de quarenta dias, os espias voltaram de espiar a terra.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('dba52807-fea0-4a76-b738-e12ce2f29771', 5, 'numeros', 'media', 'Por cada dia que os espias andaram na terra, quanto tempo teve o povo de andar no deserto?', '["Um mês", "Um ano", "Uma semana", "Dois anos"]', 1, 'Números 14:34', 'Os espias andaram 40 dias; por não confiar em Deus, o povo andou 40 anos no deserto, um ano por cada dia.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('9322b909-961c-4843-9b32-74bca3d334b6', 5, 'personagens', 'media', 'O que disseram os dez espias com medo sobre os habitantes de Canaã?', '["Que eram gigantes, e eles pareciam gafanhotos", "Que eram amigos de Israel", "Que já tinham fugido", "Que eram poucos e fracos"]', 0, 'Números 13:33', 'Disseram: «Também vimos ali gigantes… e éramos aos nossos olhos como gafanhotos.» Esqueceram-se de que Deus era maior.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('31597500-c143-4bb4-8033-4efbcbcaa460', 5, 'milagres', 'media', 'Em Meribá, Deus mandou Moisés falar à rocha. O que fez Moisés?', '["Falou-lhe com calma", "Feriu a rocha duas vezes com a vara", "Partiu-a com uma pedra", "Deitou-lhe azeite"]', 1, 'Números 20:8-11', 'Moisés, irritado com o povo, feriu a rocha duas vezes em vez de lhe falar. Saiu água, mas Moisés desobedeceu a Deus.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('cb02440f-c673-4f17-9a3b-863326780b45', 5, 'personagens', 'media', 'Que irmã de Moisés morreu e foi sepultada em Cades?', '["Zípora", "Miriã", "Raabe", "Débora"]', 1, 'Números 20:1', 'O povo chegou a Cades e ali morreu Miriã, irmã de Moisés e Arão, e ali foi sepultada.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('7e32df17-ecc5-4907-b522-a8b05dfd06ca', 5, 'lugares', 'dificil', 'Como se chamava o vale onde os espias cortaram um cacho de uvas tão grande que era levado por dois homens?', '["Vale de Escol", "Vale de Hinom", "Vale de Jezreel", "Vale de Acor"]', 0, 'Números 13:23-24', 'Chamaram-lhe vale de Escol (que quer dizer «cacho») por causa do enorme cacho de uvas levado numa vara.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('27c4737c-2398-4eb3-bfd7-25a2e8a840b3', 5, 'personagens', 'dificil', 'Qual era o nome de Josué antes de Moisés o mudar?', '["Eliseu", "Oseias", "Isaías", "Eleazar"]', 1, 'Números 13:16', 'Josué chamava-se Oseias, filho de Num. Moisés chamou-lhe Josué, que quer dizer «o Senhor salva».', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('28c4e13f-5ba7-417a-88da-5d936eafbc75', 5, 'numeros', 'dificil', 'A partir de que idade os que murmuraram contra Deus não entrariam em Canaã?', '["De 12 anos para cima", "De 20 anos para cima", "De 30 anos para cima", "De 50 anos para cima"]', 1, 'Números 14:29-30', 'Os que tinham 20 anos ou mais e murmuraram morreriam no deserto, exceto Calebe e Josué. Os mais novos entrariam na terra.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('6684f588-846b-4003-bb5f-05db1427bd1f', 5, 'personagens', 'dificil', 'De que tribo era Calebe, o espia fiel?', '["Levi", "Benjamim", "Judá", "Rúben"]', 2, 'Números 13:6', 'Calebe, filho de Jefoné, representava a tribo de Judá entre os doze espias.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('44117fdd-02a5-4084-a4bc-4ad3195b40b3', 5, 'versiculos', 'dificil', 'Completa as palavras de Josué e Calebe: «o Senhor é ___; não os temais.»', '["connosco", "o nosso rei", "a nossa espada", "poderoso"]', 0, 'Números 14:9', 'Josué e Calebe lembraram ao povo que não havia razão para ter medo: «o Senhor é connosco; não os temais.»', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('22262de1-dd5c-4c99-b047-e11193e7d623', 6, 'milagres', 'facil', 'O que aconteceu às águas do rio Jordão quando os sacerdotes entraram com a arca?', '["Transformaram-se em vinho", "Pararam e o povo passou em seco", "Ficaram vermelhas", "Subiram até ao céu"]', 1, 'Josué 3:15-17', 'Assim que os pés dos sacerdotes tocaram na água, as águas pararam e todo o povo passou em terra seca.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('1c36f11f-7a59-4070-a760-86265faa5cae', 6, 'personagens', 'facil', 'Quem liderou o povo na travessia do Jordão, depois da morte de Moisés?', '["Calebe", "Arão", "Gideão", "Josué"]', 3, 'Josué 1:2; 3:7', 'Deus disse a Josué: «Como fui com Moisés, assim serei contigo.» E Josué levou o povo através do Jordão.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('e5b1062e-cc26-4541-97f7-1b86d13d1016', 6, 'milagres', 'facil', 'O que levavam os sacerdotes à frente do povo, ao atravessar o Jordão?', '["A arca da aliança", "O bezerro de ouro", "A serpente de bronze", "Um cesto de maná"]', 0, 'Josué 3:6', 'Os sacerdotes levavam a arca da aliança, que lembrava que Deus ia à frente do seu povo.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('1f0a56fc-7ce7-4008-8405-db118dbd85b4', 6, 'personagens', 'facil', 'Que mulher de Jericó escondeu os dois espias de Israel?', '["Rute", "Raabe", "Miriã", "Ester"]', 1, 'Josué 2:1-4', 'Raabe escondeu os espias no telhado, debaixo de canas de linho, e salvou-lhes a vida.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('dd6b8133-b706-471f-a526-11c5a3b232a3', 6, 'numeros', 'facil', 'Quantas pedras tiraram do meio do Jordão para fazer um memorial?', '["7", "10", "12", "40"]', 2, 'Josué 4:3-8', 'Doze homens tiraram doze pedras do meio do rio, para lembrar às próximas gerações o que Deus fez.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('865c2280-27e8-408b-b2a2-c5283f6ee8a5', 6, 'personagens', 'media', 'Como fugiram os espias da casa de Raabe?', '["Por um túnel", "Disfarçados de soldados", "Desceram por uma corda pela janela", "Escondidos numa carroça de palha"]', 2, 'Josué 2:15', 'A casa de Raabe ficava no muro da cidade. Ela fê-los descer por uma corda pela janela.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('d39963a1-5417-447d-99f2-03a298be26c4', 6, 'lugares', 'media', 'Onde atou Raabe o cordão de fio vermelho (escarlate), como sinal combinado com os espias?', '["Na janela da sua casa", "Na porta da cidade", "No poço", "No telhado"]', 0, 'Josué 2:18-21', 'O cordão vermelho na janela era o sinal para que ela e a sua família fossem salvas quando Israel tomasse Jericó.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('12adeade-bfe9-4aa4-8f2e-c7537603d594', 6, 'lugares', 'media', 'Onde acampou o povo depois de atravessar o Jordão, e onde Josué colocou as 12 pedras?', '["Betel", "Siló", "Gilgal", "Hebrom"]', 2, 'Josué 4:19-20', 'O povo acampou em Gilgal, a oriente de Jericó, e Josué levantou lá as doze pedras tiradas do Jordão.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('741b081a-b9c4-40b8-99ee-817cbbeac8a7', 6, 'numeros', 'media', 'O que representavam as 12 pedras tiradas do rio Jordão?', '["Os 12 meses do ano", "As 12 tribos de Israel", "Os 12 espias", "Os 12 apóstolos"]', 1, 'Josué 4:5-8', 'Cada pedra representava uma das doze tribos dos filhos de Israel.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('17185fc7-07f5-4e3c-b517-5072fcc42248', 6, 'personagens', 'media', 'Porque é que Raabe ajudou os espias de Israel?', '["Porque lhe pagaram com ouro", "Porque era israelita", "Porque tinha ouvido o que Deus fez e creu n''Ele", "Porque o rei de Jericó mandou"]', 2, 'Josué 2:9-11', 'Raabe ouviu como Deus secou o Mar Vermelho e disse: «O Senhor, vosso Deus, é Deus em cima nos céus e em baixo na terra.»', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('dd976b61-7279-4bef-a533-ffaeed8d01f7', 6, 'numeros', 'dificil', 'A que distância da arca devia ficar o povo durante a travessia?', '["100 côvados", "500 côvados", "2000 côvados", "10 000 côvados"]', 2, 'Josué 3:4', 'O povo devia ficar a cerca de dois mil côvados (quase um quilómetro) da arca, para todos verem o caminho.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('35e4edb2-6702-4900-aa34-5064ec01ca50', 6, 'lugares', 'dificil', 'Junto de que cidade se amontoaram as águas do Jordão?', '["Adão", "Siquém", "Zoar", "Ai"]', 0, 'Josué 3:16', 'As águas que desciam pararam e levantaram-se num montão, muito longe, junto à cidade de Adão.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('8e16e66a-9185-4310-afd3-b9cee3c37e58', 6, 'lugares', 'dificil', 'De que lugar Josué enviou os dois espias a Jericó?', '["Gilgal", "Cades", "Sitim", "Betel"]', 2, 'Josué 2:1', 'Josué, filho de Num, enviou secretamente dois espias desde Sitim, para verem a terra e Jericó.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('e0aec57c-efde-45ea-a2a3-08248fd0c53b', 6, 'numeros', 'dificil', 'Quantos homens armados das tribos de Rúben, Gade e meia tribo de Manassés passaram o Jordão à frente do povo?', '["Cerca de 4 mil", "Cerca de 40 mil", "Cerca de 400 mil", "Cerca de 4 milhões"]', 1, 'Josué 4:12-13', 'Quase quarenta mil homens armados passaram diante do Senhor para a batalha, nas campinas de Jericó.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('98dda574-09eb-43cb-be41-e5d5a3be71df', 6, 'versiculos', 'dificil', 'Completa: as pedras do Jordão serviam «para que todos os povos da terra conheçam a mão do Senhor, que é ___».', '["forte", "santa", "eterna", "bondosa"]', 0, 'Josué 4:24', 'O memorial mostrava a todos os povos que a mão do Senhor é forte, e ensinava Israel a temer a Deus para sempre.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('8935cf0b-4b2d-4f34-9d1c-5b01ecfd8e3e', 7, 'lugares', 'facil', 'Que cidade caiu depois de o povo marchar à sua volta?', '["Ai", "Jericó", "Jerusalém", "Babilónia"]', 1, 'Josué 6:20', 'Os israelitas marcharam à volta de Jericó como Deus mandou, e as muralhas caíram.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('fe4e7ad2-04c0-4cee-bb11-08a6a15fb7e2', 7, 'versiculos', 'facil', 'Completa a frase de Josué: «Eu e a minha casa serviremos ao ___.»', '["rei", "Senhor", "povo", "Moisés"]', 1, 'Josué 24:15', 'Já velho, Josué desafiou o povo a escolher a quem servir e disse: «Eu e a minha casa serviremos ao Senhor.»', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('f49a34cd-7585-4c61-b8b9-37f3164e3782', 7, 'numeros', 'facil', 'Durante quantos dias marcharam os israelitas à volta de Jericó?', '["3", "7", "12", "40"]', 1, 'Josué 6:3-4,15', 'Durante seis dias deram uma volta por dia. No sétimo dia deram sete voltas.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('94671814-b003-4b60-babf-f34a01ec4ed9', 7, 'milagres', 'facil', 'O que aconteceu às muralhas de Jericó quando o povo gritou?', '["Ficaram mais altas", "Pegaram fogo", "Caíram", "Abriram-se as portas"]', 2, 'Josué 6:20', 'Quando as trombetas tocaram e o povo gritou, o muro caiu e o povo entrou na cidade.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('b50aadde-5a68-4556-a142-0c6f13c22d6e', 7, 'personagens', 'facil', 'A quem disse Deus: «Sê forte e corajoso; não temas»?', '["Davi", "Gideão", "Sansão", "Josué"]', 3, 'Josué 1:9', 'Deus animou Josué antes de ele levar o povo para Canaã: «o Senhor, teu Deus, é contigo por onde quer que andares.»', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('637c9af8-2fdd-4ccb-a7af-7e8716f9e7bd', 7, 'numeros', 'media', 'No sétimo dia, quantas voltas deram à cidade de Jericó?', '["1", "3", "7", "12"]', 2, 'Josué 6:15-16', 'No sétimo dia levantaram-se de madrugada e deram sete voltas à cidade. À sétima, Josué mandou gritar.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('506cb935-7826-470f-8f44-fdeae35dbe1b', 7, 'milagres', 'media', 'O que deixou de cair quando o povo comeu dos frutos da terra de Canaã?', '["A chuva", "O orvalho", "O maná", "As codornizes"]', 2, 'Josué 5:12', 'No dia seguinte a comerem do fruto da terra, o maná parou. Deus tinha-os alimentado até ao fim da viagem.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('f69e7093-9782-438f-a526-cde23480d6cb', 7, 'personagens', 'media', 'O que mandou o Príncipe do exército do Senhor que Josué fizesse, perto de Jericó?', '["Afiar a espada", "Contar os soldados", "Tirar as sandálias, porque o lugar era santo", "Construir uma torre"]', 2, 'Josué 5:13-15', 'Josué adorou-O, e Ele disse: «Descalça os sapatos dos teus pés, porque o lugar em que estás é santo.»', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('25db470c-773f-4088-b00e-8951af073b39', 7, 'versiculos', 'media', 'Completa o conselho de Deus a Josué sobre o livro da Lei: «medita nele ___».', '["uma vez por semana", "dia e noite", "ao sábado", "quando puderes"]', 1, 'Josué 1:8', '«Não se aparte da tua boca o livro desta Lei; antes medita nele dia e noite.» Ler a Bíblia todos os dias faz-nos crescer.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('91525ee7-f276-4bd7-904b-6e989a6eb5bf', 7, 'lugares', 'media', 'Que cidade pediu Calebe como herança, com já 85 anos?', '["Jericó", "Siquém", "Betel", "Hebrom"]', 3, 'Josué 14:12-14', 'Calebe pediu o monte de Hebrom, onde viviam gigantes. Josué abençoou-o e deu-lhe Hebrom, porque seguiu fielmente o Senhor.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('833403ab-65f2-4d8a-8cd6-c493ee6cd98d', 7, 'numeros', 'dificil', 'Que idade tinha Calebe quando pediu a sua herança em Canaã?', '["40 anos", "70 anos", "85 anos", "120 anos"]', 2, 'Josué 14:10-11', 'Calebe disse: «Hoje tenho oitenta e cinco anos… e estou tão forte como no dia em que Moisés me enviou.»', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('ddc8172d-77a6-4963-8344-3b5385b3c0de', 7, 'numeros', 'dificil', 'Com que idade morreu Josué?', '["100 anos", "110 anos", "120 anos", "130 anos"]', 1, 'Josué 24:29', 'Josué, servo do Senhor, morreu com 110 anos. (Moisés tinha morrido com 120.)', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('69933eba-97fd-41fd-b93f-7001ce65f148', 7, 'lugares', 'dificil', 'Em que cidade reuniu Josué todas as tribos para o seu último discurso?', '["Gilgal", "Siquém", "Jericó", "Hebrom"]', 1, 'Josué 24:1', 'Josué reuniu as tribos em Siquém e lembrou-lhes tudo o que Deus tinha feito, desde Abraão até Canaã.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('e66b451f-c26c-4ab6-aec8-c0d13793c4a8', 7, 'personagens', 'dificil', 'Quem guardou para si coisas proibidas de Jericó, fazendo Israel perder a batalha de Ai?', '["Calebe", "Finéias", "Acã", "Coré"]', 2, 'Josué 7:1,20-21', 'Acã escondeu uma capa, prata e ouro na sua tenda. A desobediência de um trouxe problemas a todo o povo.', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');
INSERT INTO public.vanatrilha_questions (id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_by, created_at, updated_at) VALUES ('8f555696-b55e-4c10-a4ca-d278017484c0', 7, 'versiculos', 'dificil', 'Completa: «Palavra alguma ___ de todas as boas palavras que o Senhor falara à casa de Israel; tudo se cumpriu.»', '["mudou", "falhou", "se perdeu", "se escreveu"]', 1, 'Josué 21:45', 'Deus cumpriu todas as promessas que fez ao seu povo. É por isso que esta viagem se chama A Rota da Promessa!', true, NULL, '2026-11-03 21:30:17.518+00', '2026-11-03 21:30:17.518+00');


--
-- Data for Name: vanatrilha_station_progress; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanawords_guesses; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanawords_players; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanawords_sessions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanawords_turns; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanawords_word_bank; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vanawords_words; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vantur_dictionary; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: vantur_sessions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Name: vanacoro_round_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.vanacoro_round_events_id_seq', 1, false);


--
-- Name: announcement_recipients announcement_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_recipients
    ADD CONSTRAINT announcement_recipients_pkey PRIMARY KEY (announcement_id, user_id);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: club_families club_families_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_families
    ADD CONSTRAINT club_families_pkey PRIMARY KEY (id);


--
-- Name: club_family_invites club_family_invites_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_family_invites
    ADD CONSTRAINT club_family_invites_code_key UNIQUE (code);


--
-- Name: club_family_invites club_family_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_family_invites
    ADD CONSTRAINT club_family_invites_pkey PRIMARY KEY (family_id);


--
-- Name: club_family_members club_family_members_one_family; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_family_members
    ADD CONSTRAINT club_family_members_one_family UNIQUE (user_id);


--
-- Name: club_family_members club_family_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_family_members
    ADD CONSTRAINT club_family_members_pkey PRIMARY KEY (family_id, user_id);


--
-- Name: club_screens club_screens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_screens
    ADD CONSTRAINT club_screens_pkey PRIMARY KEY (host_id);


--
-- Name: digital_keys digital_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_keys
    ADD CONSTRAINT digital_keys_pkey PRIMARY KEY (id);


--
-- Name: email_opt_outs email_opt_outs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_opt_outs
    ADD CONSTRAINT email_opt_outs_pkey PRIMARY KEY (user_id);


--
-- Name: event_attendance event_attendance_event_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_attendance
    ADD CONSTRAINT event_attendance_event_id_user_id_key UNIQUE (event_id, user_id);


--
-- Name: event_attendance event_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_attendance
    ADD CONSTRAINT event_attendance_pkey PRIMARY KEY (id);


--
-- Name: event_guests event_guests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_guests
    ADD CONSTRAINT event_guests_pkey PRIMARY KEY (id);


--
-- Name: event_invites event_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_pkey PRIMARY KEY (event_id, user_id);


--
-- Name: event_rsvps event_rsvps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_rsvps
    ADD CONSTRAINT event_rsvps_pkey PRIMARY KEY (event_id, user_id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: family_account_links family_account_links_associated_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_account_links
    ADD CONSTRAINT family_account_links_associated_unique UNIQUE (associated_user_id);


--
-- Name: family_account_links family_account_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_account_links
    ADD CONSTRAINT family_account_links_pkey PRIMARY KEY (owner_user_id, associated_user_id);


--
-- Name: family_account_requests family_account_requests_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_account_requests
    ADD CONSTRAINT family_account_requests_code_key UNIQUE (code);


--
-- Name: family_account_requests family_account_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_account_requests
    ADD CONSTRAINT family_account_requests_pkey PRIMARY KEY (id);


--
-- Name: game_plays game_plays_game_id_user_id_mode_play_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_plays
    ADD CONSTRAINT game_plays_game_id_user_id_mode_play_date_key UNIQUE (game_id, user_id, mode, play_date);


--
-- Name: game_plays game_plays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_plays
    ADD CONSTRAINT game_plays_pkey PRIMARY KEY (id);


--
-- Name: game_settings game_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_settings
    ADD CONSTRAINT game_settings_pkey PRIMARY KEY (game_id);


--
-- Name: points_audit_events points_audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_audit_events
    ADD CONSTRAINT points_audit_events_pkey PRIMARY KEY (id);


--
-- Name: points_log points_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_log
    ADD CONSTRAINT points_log_pkey PRIMARY KEY (id);


--
-- Name: points_season_standings points_season_standings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_season_standings
    ADD CONSTRAINT points_season_standings_pkey PRIMARY KEY (season_id, user_id);


--
-- Name: points_seasons points_seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_seasons
    ADD CONSTRAINT points_seasons_pkey PRIMARY KEY (id);


--
-- Name: portuguese_words portuguese_words_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portuguese_words
    ADD CONSTRAINT portuguese_words_pkey PRIMARY KEY (word_clean);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_user_id_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (user_id, endpoint);


--
-- Name: qr_codes qr_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_codes
    ADD CONSTRAINT qr_codes_code_key UNIQUE (code);


--
-- Name: qr_codes qr_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_codes
    ADD CONSTRAINT qr_codes_pkey PRIMARY KEY (id);


--
-- Name: qr_scans qr_scans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_scans
    ADD CONSTRAINT qr_scans_pkey PRIMARY KEY (id);


--
-- Name: qr_scans qr_scans_qr_code_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_scans
    ADD CONSTRAINT qr_scans_qr_code_id_user_id_key UNIQUE (qr_code_id, user_id);


--
-- Name: raffle_screens raffle_screens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raffle_screens
    ADD CONSTRAINT raffle_screens_pkey PRIMARY KEY (host_id);


--
-- Name: section_changes section_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_changes
    ADD CONSTRAINT section_changes_pkey PRIMARY KEY (id);


--
-- Name: store_products store_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_products
    ADD CONSTRAINT store_products_pkey PRIMARY KEY (id);


--
-- Name: store_purchases store_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_purchases
    ADD CONSTRAINT store_purchases_pkey PRIMARY KEY (id);


--
-- Name: store_settings store_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_settings
    ADD CONSTRAINT store_settings_pkey PRIMARY KEY (id);


--
-- Name: suggestions suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suggestions
    ADD CONSTRAINT suggestions_pkey PRIMARY KEY (id);


--
-- Name: survey_options survey_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_options
    ADD CONSTRAINT survey_options_pkey PRIMARY KEY (id);


--
-- Name: survey_responses survey_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_pkey PRIMARY KEY (id);


--
-- Name: survey_responses survey_responses_survey_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_survey_id_user_id_key UNIQUE (survey_id, user_id);


--
-- Name: surveys surveys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surveys
    ADD CONSTRAINT surveys_pkey PRIMARY KEY (id);


--
-- Name: task_completions task_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_completions
    ADD CONSTRAINT task_completions_pkey PRIMARY KEY (id);


--
-- Name: task_completions task_completions_task_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_completions
    ADD CONSTRAINT task_completions_task_id_user_id_key UNIQUE (task_id, user_id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: team_screens team_screens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_screens
    ADD CONSTRAINT team_screens_pkey PRIMARY KEY (host_id);


--
-- Name: timer_screens timer_screens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timer_screens
    ADD CONSTRAINT timer_screens_pkey PRIMARY KEY (host_id);


--
-- Name: trip_plans trip_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_plans
    ADD CONSTRAINT trip_plans_pkey PRIMARY KEY (event_id);


--
-- Name: vana_codigo_sessions vana_codigo_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_codigo_sessions
    ADD CONSTRAINT vana_codigo_sessions_pkey PRIMARY KEY (id);


--
-- Name: vana_codigo_sessions vana_codigo_sessions_user_id_mode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_codigo_sessions
    ADD CONSTRAINT vana_codigo_sessions_user_id_mode_key UNIQUE (user_id, mode);


--
-- Name: vana_quest_answers vana_quest_answers_participant_id_question_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_quest_answers
    ADD CONSTRAINT vana_quest_answers_participant_id_question_id_key UNIQUE (participant_id, question_id);


--
-- Name: vana_quest_answers vana_quest_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_quest_answers
    ADD CONSTRAINT vana_quest_answers_pkey PRIMARY KEY (id);


--
-- Name: vana_quest_participants vana_quest_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_quest_participants
    ADD CONSTRAINT vana_quest_participants_pkey PRIMARY KEY (id);


--
-- Name: vana_quest_questions vana_quest_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_quest_questions
    ADD CONSTRAINT vana_quest_questions_pkey PRIMARY KEY (id);


--
-- Name: vana_quest_sessions vana_quest_sessions_pin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_quest_sessions
    ADD CONSTRAINT vana_quest_sessions_pin_key UNIQUE (pin);


--
-- Name: vana_quest_sessions vana_quest_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_quest_sessions
    ADD CONSTRAINT vana_quest_sessions_pkey PRIMARY KEY (id);


--
-- Name: vana_quests vana_quests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_quests
    ADD CONSTRAINT vana_quests_pkey PRIMARY KEY (id);


--
-- Name: vana_sentinela_scores vana_sentinela_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_sentinela_scores
    ADD CONSTRAINT vana_sentinela_scores_pkey PRIMARY KEY (id);


--
-- Name: vanacamp_events vanacamp_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_events
    ADD CONSTRAINT vanacamp_events_pkey PRIMARY KEY (id);


--
-- Name: vanacamp_messages vanacamp_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_messages
    ADD CONSTRAINT vanacamp_messages_pkey PRIMARY KEY (id);


--
-- Name: vanacamp_night_actions vanacamp_night_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_night_actions
    ADD CONSTRAINT vanacamp_night_actions_pkey PRIMARY KEY (id);


--
-- Name: vanacamp_night_actions vanacamp_night_actions_session_id_day_number_phase_actor_pl_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_night_actions
    ADD CONSTRAINT vanacamp_night_actions_session_id_day_number_phase_actor_pl_key UNIQUE (session_id, day_number, phase, actor_player_id);


--
-- Name: vanacamp_players vanacamp_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_players
    ADD CONSTRAINT vanacamp_players_pkey PRIMARY KEY (id);


--
-- Name: vanacamp_sessions vanacamp_sessions_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_sessions
    ADD CONSTRAINT vanacamp_sessions_code_key UNIQUE (code);


--
-- Name: vanacamp_sessions vanacamp_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_sessions
    ADD CONSTRAINT vanacamp_sessions_pkey PRIMARY KEY (id);


--
-- Name: vanacamp_votes vanacamp_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_votes
    ADD CONSTRAINT vanacamp_votes_pkey PRIMARY KEY (id);


--
-- Name: vanacamp_votes vanacamp_votes_session_id_day_number_vote_type_voter_player_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_votes
    ADD CONSTRAINT vanacamp_votes_session_id_day_number_vote_type_voter_player_key UNIQUE (session_id, day_number, vote_type, voter_player_id);


--
-- Name: vanacoro_answer_rewards vanacoro_answer_rewards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_answer_rewards
    ADD CONSTRAINT vanacoro_answer_rewards_pkey PRIMARY KEY (question_id, profile_id);


--
-- Name: vanacoro_answers vanacoro_answers_no_repeat; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_answers
    ADD CONSTRAINT vanacoro_answers_no_repeat UNIQUE (question_id, respondent_key, normalized_text);


--
-- Name: vanacoro_answers vanacoro_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_answers
    ADD CONSTRAINT vanacoro_answers_pkey PRIMARY KEY (id);


--
-- Name: vanacoro_board_entries vanacoro_board_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_board_entries
    ADD CONSTRAINT vanacoro_board_entries_pkey PRIMARY KEY (id);


--
-- Name: vanacoro_board_entries vanacoro_board_entries_rank_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_board_entries
    ADD CONSTRAINT vanacoro_board_entries_rank_unique UNIQUE (question_id, rank);


--
-- Name: vanacoro_groups vanacoro_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_groups
    ADD CONSTRAINT vanacoro_groups_pkey PRIMARY KEY (id);


--
-- Name: vanacoro_players vanacoro_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_players
    ADD CONSTRAINT vanacoro_players_pkey PRIMARY KEY (id);


--
-- Name: vanacoro_questions vanacoro_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_questions
    ADD CONSTRAINT vanacoro_questions_pkey PRIMARY KEY (id);


--
-- Name: vanacoro_reveals vanacoro_reveals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_reveals
    ADD CONSTRAINT vanacoro_reveals_pkey PRIMARY KEY (round_id, board_entry_id);


--
-- Name: vanacoro_roster vanacoro_roster_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_roster
    ADD CONSTRAINT vanacoro_roster_pkey PRIMARY KEY (session_id, key);


--
-- Name: vanacoro_round_events vanacoro_round_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_round_events
    ADD CONSTRAINT vanacoro_round_events_pkey PRIMARY KEY (id);


--
-- Name: vanacoro_rounds vanacoro_rounds_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_rounds
    ADD CONSTRAINT vanacoro_rounds_number_unique UNIQUE (session_id, round_number);


--
-- Name: vanacoro_rounds vanacoro_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_rounds
    ADD CONSTRAINT vanacoro_rounds_pkey PRIMARY KEY (id);


--
-- Name: vanacoro_sessions vanacoro_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_sessions
    ADD CONSTRAINT vanacoro_sessions_pkey PRIMARY KEY (id);


--
-- Name: vanacoro_settings vanacoro_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_settings
    ADD CONSTRAINT vanacoro_settings_pkey PRIMARY KEY (id);


--
-- Name: vanaespada_answers vanaespada_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_answers
    ADD CONSTRAINT vanaespada_answers_pkey PRIMARY KEY (id);


--
-- Name: vanaespada_answers vanaespada_answers_round_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_answers
    ADD CONSTRAINT vanaespada_answers_round_id_player_id_key UNIQUE (round_id, player_id);


--
-- Name: vanaespada_deck_rounds vanaespada_deck_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_deck_rounds
    ADD CONSTRAINT vanaespada_deck_rounds_pkey PRIMARY KEY (id);


--
-- Name: vanaespada_decks vanaespada_decks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_decks
    ADD CONSTRAINT vanaespada_decks_pkey PRIMARY KEY (id);


--
-- Name: vanaespada_drill_prompts vanaespada_drill_prompts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_drill_prompts
    ADD CONSTRAINT vanaespada_drill_prompts_pkey PRIMARY KEY (id);


--
-- Name: vanaespada_players vanaespada_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_players
    ADD CONSTRAINT vanaespada_players_pkey PRIMARY KEY (id);


--
-- Name: vanaespada_session_rounds vanaespada_session_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_session_rounds
    ADD CONSTRAINT vanaespada_session_rounds_pkey PRIMARY KEY (id);


--
-- Name: vanaespada_session_rounds vanaespada_session_rounds_session_id_round_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_session_rounds
    ADD CONSTRAINT vanaespada_session_rounds_session_id_round_index_key UNIQUE (session_id, round_index);


--
-- Name: vanaespada_sessions vanaespada_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_sessions
    ADD CONSTRAINT vanaespada_sessions_pkey PRIMARY KEY (id);


--
-- Name: vanaespada_verses vanaespada_verses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_verses
    ADD CONSTRAINT vanaespada_verses_pkey PRIMARY KEY (id);


--
-- Name: vanasketch_guesses vanasketch_guesses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_guesses
    ADD CONSTRAINT vanasketch_guesses_pkey PRIMARY KEY (id);


--
-- Name: vanasketch_pack_words vanasketch_pack_words_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_pack_words
    ADD CONSTRAINT vanasketch_pack_words_pkey PRIMARY KEY (id);


--
-- Name: vanasketch_packs vanasketch_packs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_packs
    ADD CONSTRAINT vanasketch_packs_pkey PRIMARY KEY (id);


--
-- Name: vanasketch_players vanasketch_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_players
    ADD CONSTRAINT vanasketch_players_pkey PRIMARY KEY (id);


--
-- Name: vanasketch_players vanasketch_players_session_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_players
    ADD CONSTRAINT vanasketch_players_session_id_user_id_key UNIQUE (session_id, user_id);


--
-- Name: vanasketch_rounds vanasketch_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_rounds
    ADD CONSTRAINT vanasketch_rounds_pkey PRIMARY KEY (id);


--
-- Name: vanasketch_rounds vanasketch_rounds_session_id_round_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_rounds
    ADD CONSTRAINT vanasketch_rounds_session_id_round_number_key UNIQUE (session_id, round_number);


--
-- Name: vanasketch_sessions vanasketch_sessions_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_sessions
    ADD CONSTRAINT vanasketch_sessions_code_key UNIQUE (code);


--
-- Name: vanasketch_sessions vanasketch_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_sessions
    ADD CONSTRAINT vanasketch_sessions_pkey PRIMARY KEY (id);


--
-- Name: vanasketch_strokes vanasketch_strokes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_strokes
    ADD CONSTRAINT vanasketch_strokes_pkey PRIMARY KEY (id);


--
-- Name: vanatrilha_daily_runs vanatrilha_daily_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanatrilha_daily_runs
    ADD CONSTRAINT vanatrilha_daily_runs_pkey PRIMARY KEY (id);


--
-- Name: vanatrilha_daily_runs vanatrilha_daily_runs_user_id_run_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanatrilha_daily_runs
    ADD CONSTRAINT vanatrilha_daily_runs_user_id_run_date_key UNIQUE (user_id, run_date);


--
-- Name: vanatrilha_questions vanatrilha_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanatrilha_questions
    ADD CONSTRAINT vanatrilha_questions_pkey PRIMARY KEY (id);


--
-- Name: vanatrilha_station_progress vanatrilha_station_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanatrilha_station_progress
    ADD CONSTRAINT vanatrilha_station_progress_pkey PRIMARY KEY (user_id, station);


--
-- Name: vanawords_guesses vanawords_guesses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_guesses
    ADD CONSTRAINT vanawords_guesses_pkey PRIMARY KEY (id);


--
-- Name: vanawords_guesses vanawords_guesses_word_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_guesses
    ADD CONSTRAINT vanawords_guesses_word_id_player_id_key UNIQUE (word_id, player_id);


--
-- Name: vanawords_players vanawords_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_players
    ADD CONSTRAINT vanawords_players_pkey PRIMARY KEY (id);


--
-- Name: vanawords_sessions vanawords_sessions_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_sessions
    ADD CONSTRAINT vanawords_sessions_code_key UNIQUE (code);


--
-- Name: vanawords_sessions vanawords_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_sessions
    ADD CONSTRAINT vanawords_sessions_pkey PRIMARY KEY (id);


--
-- Name: vanawords_turns vanawords_turns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_turns
    ADD CONSTRAINT vanawords_turns_pkey PRIMARY KEY (id);


--
-- Name: vanawords_word_bank vanawords_word_bank_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_word_bank
    ADD CONSTRAINT vanawords_word_bank_pkey PRIMARY KEY (id);


--
-- Name: vanawords_word_bank vanawords_word_bank_word_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_word_bank
    ADD CONSTRAINT vanawords_word_bank_word_unique UNIQUE (word);


--
-- Name: vanawords_words vanawords_words_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_words
    ADD CONSTRAINT vanawords_words_pkey PRIMARY KEY (id);


--
-- Name: vanawords_words vanawords_words_session_id_grid_pos_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_words
    ADD CONSTRAINT vanawords_words_session_id_grid_pos_key UNIQUE (session_id, grid_pos);


--
-- Name: vantur_dictionary vantur_dictionary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vantur_dictionary
    ADD CONSTRAINT vantur_dictionary_pkey PRIMARY KEY (id);


--
-- Name: vantur_dictionary vantur_dictionary_word_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vantur_dictionary
    ADD CONSTRAINT vantur_dictionary_word_key UNIQUE (word);


--
-- Name: vantur_sessions vantur_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vantur_sessions
    ADD CONSTRAINT vantur_sessions_pkey PRIMARY KEY (id);


--
-- Name: vantur_sessions vantur_sessions_user_id_mode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vantur_sessions
    ADD CONSTRAINT vantur_sessions_user_id_mode_key UNIQUE (user_id, mode);


--
-- Name: club_family_members_family_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX club_family_members_family_idx ON public.club_family_members USING btree (family_id);


--
-- Name: event_guests_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_guests_event_idx ON public.event_guests USING btree (event_id, created_at);


--
-- Name: event_rsvps_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_rsvps_user_idx ON public.event_rsvps USING btree (user_id);


--
-- Name: family_account_requests_one_pending_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX family_account_requests_one_pending_owner ON public.family_account_requests USING btree (owner_user_id) WHERE (status = 'pending'::text);


--
-- Name: game_plays_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX game_plays_date_idx ON public.game_plays USING btree (play_date);


--
-- Name: idx_announcement_recipients_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcement_recipients_user ON public.announcement_recipients USING btree (user_id, created_at DESC);


--
-- Name: idx_points_audit_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_points_audit_events_created ON public.points_audit_events USING btree (created_at DESC);


--
-- Name: idx_points_log_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_points_log_event_id ON public.points_log USING btree (event_id);


--
-- Name: idx_section_changes_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_section_changes_user ON public.section_changes USING btree (user_id, created_at DESC);


--
-- Name: idx_vana_codigo_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vana_codigo_sessions_user ON public.vana_codigo_sessions USING btree (user_id);


--
-- Name: idx_vana_sentinela_scores_guest_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vana_sentinela_scores_guest_created ON public.vana_sentinela_scores USING btree (guest_id, created_at DESC);


--
-- Name: idx_vana_sentinela_scores_pack_points; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vana_sentinela_scores_pack_points ON public.vana_sentinela_scores USING btree (pack, points DESC);


--
-- Name: idx_vana_sentinela_scores_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vana_sentinela_scores_user_created ON public.vana_sentinela_scores USING btree (user_id, created_at DESC);


--
-- Name: idx_vantur_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vantur_sessions_user ON public.vantur_sessions USING btree (user_id);


--
-- Name: survey_options_survey_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_options_survey_id_idx ON public.survey_options USING btree (survey_id);


--
-- Name: survey_responses_survey_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_responses_survey_id_idx ON public.survey_responses USING btree (survey_id);


--
-- Name: vanacamp_events_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanacamp_events_session_idx ON public.vanacamp_events USING btree (session_id, created_at);


--
-- Name: vanacamp_messages_session_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanacamp_messages_session_channel_idx ON public.vanacamp_messages USING btree (session_id, channel, created_at);


--
-- Name: vanacamp_night_actions_session_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanacamp_night_actions_session_day_idx ON public.vanacamp_night_actions USING btree (session_id, day_number);


--
-- Name: vanacamp_players_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanacamp_players_session_idx ON public.vanacamp_players USING btree (session_id);


--
-- Name: vanacamp_players_session_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vanacamp_players_session_user_unique ON public.vanacamp_players USING btree (session_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: vanacamp_sessions_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanacamp_sessions_code_idx ON public.vanacamp_sessions USING btree (code);


--
-- Name: vanacamp_sessions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanacamp_sessions_status_idx ON public.vanacamp_sessions USING btree (status);


--
-- Name: vanacamp_votes_session_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanacamp_votes_session_day_idx ON public.vanacamp_votes USING btree (session_id, day_number, vote_type);


--
-- Name: vanacoro_answers_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanacoro_answers_group_idx ON public.vanacoro_answers USING btree (group_id);


--
-- Name: vanacoro_answers_ip_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanacoro_answers_ip_idx ON public.vanacoro_answers USING btree (ip_hash, created_at);


--
-- Name: vanacoro_answers_question_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanacoro_answers_question_idx ON public.vanacoro_answers USING btree (question_id);


--
-- Name: vanacoro_answers_respondent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanacoro_answers_respondent_idx ON public.vanacoro_answers USING btree (respondent_key, created_at);


--
-- Name: vanacoro_groups_question_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanacoro_groups_question_idx ON public.vanacoro_groups USING btree (question_id);


--
-- Name: vanacoro_players_one_per_member; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vanacoro_players_one_per_member ON public.vanacoro_players USING btree (session_id, profile_id) WHERE (profile_id IS NOT NULL);


--
-- Name: vanacoro_players_one_per_roster_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vanacoro_players_one_per_roster_key ON public.vanacoro_players USING btree (session_id, roster_key) WHERE (roster_key IS NOT NULL);


--
-- Name: vanacoro_players_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanacoro_players_session_idx ON public.vanacoro_players USING btree (session_id, joined_at);


--
-- Name: vanacoro_questions_opens_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanacoro_questions_opens_idx ON public.vanacoro_questions USING btree (opens_at);


--
-- Name: vanacoro_round_events_round_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanacoro_round_events_round_idx ON public.vanacoro_round_events USING btree (round_id, id);


--
-- Name: vanacoro_sessions_code_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vanacoro_sessions_code_active ON public.vanacoro_sessions USING btree (code) WHERE (status <> 'finished'::text);


--
-- Name: vanacoro_sessions_host_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanacoro_sessions_host_idx ON public.vanacoro_sessions USING btree (host_id, created_at DESC);


--
-- Name: vanaespada_answers_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanaespada_answers_session_idx ON public.vanaespada_answers USING btree (session_id);


--
-- Name: vanaespada_deck_rounds_deck_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanaespada_deck_rounds_deck_idx ON public.vanaespada_deck_rounds USING btree (deck_id, "position");


--
-- Name: vanaespada_drill_prompts_verse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanaespada_drill_prompts_verse_idx ON public.vanaespada_drill_prompts USING btree (verse_id);


--
-- Name: vanaespada_players_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanaespada_players_session_idx ON public.vanaespada_players USING btree (session_id);


--
-- Name: vanaespada_sessions_host_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanaespada_sessions_host_idx ON public.vanaespada_sessions USING btree (host_id, created_at DESC);


--
-- Name: vanaespada_sessions_pin_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vanaespada_sessions_pin_live ON public.vanaespada_sessions USING btree (pin) WHERE (status <> 'finished'::text);


--
-- Name: vanaespada_verses_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanaespada_verses_active_idx ON public.vanaespada_verses USING btree (active, difficulty);


--
-- Name: vanasketch_guesses_one_correct; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vanasketch_guesses_one_correct ON public.vanasketch_guesses USING btree (session_id, round_number, player_id) WHERE is_correct;


--
-- Name: vanasketch_guesses_session_round; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanasketch_guesses_session_round ON public.vanasketch_guesses USING btree (session_id, round_number, created_at);


--
-- Name: vanasketch_pack_words_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vanasketch_pack_words_unique ON public.vanasketch_pack_words USING btree (pack_id, lower(word));


--
-- Name: vanasketch_packs_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vanasketch_packs_name_unique ON public.vanasketch_packs USING btree (lower(name));


--
-- Name: vanasketch_strokes_session_round; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanasketch_strokes_session_round ON public.vanasketch_strokes USING btree (session_id, round_number, seq);


--
-- Name: vanatrilha_daily_runs_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanatrilha_daily_runs_date_idx ON public.vanatrilha_daily_runs USING btree (run_date);


--
-- Name: vanatrilha_daily_runs_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanatrilha_daily_runs_user_idx ON public.vanatrilha_daily_runs USING btree (user_id, run_date DESC);


--
-- Name: vanatrilha_questions_station_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vanatrilha_questions_station_idx ON public.vanatrilha_questions USING btree (station, difficulty) WHERE is_active;


--
-- Name: vanatrilha_questions_station_prompt_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vanatrilha_questions_station_prompt_uidx ON public.vanatrilha_questions USING btree (station, prompt);


--
-- Name: vanawords_players_session_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vanawords_players_session_user_unique ON public.vanawords_players USING btree (session_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: club_family_members club_family_members_delete_empty; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER club_family_members_delete_empty AFTER DELETE ON public.club_family_members FOR EACH ROW EXECUTE FUNCTION public.delete_empty_club_family();


--
-- Name: family_account_links enforce_family_account_link_exclusive; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_family_account_link_exclusive BEFORE INSERT ON public.family_account_links FOR EACH ROW EXECUTE FUNCTION public.enforce_family_account_link_exclusive();


--
-- Name: events events_close_guests_on_finish; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER events_close_guests_on_finish AFTER UPDATE OF is_finished ON public.events FOR EACH ROW EXECUTE FUNCTION public.events_close_guests_on_finish();


--
-- Name: announcements on_announcement_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_announcement_created AFTER INSERT ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.fill_announcement_recipients();


--
-- Name: points_log on_points_log_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_points_log_change AFTER INSERT OR DELETE OR UPDATE ON public.points_log FOR EACH ROW EXECUTE FUNCTION public.update_profile_totals();


--
-- Name: profiles on_profile_lifecycle; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_profile_lifecycle BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_lifecycle_changes();


--
-- Name: survey_responses on_survey_response_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_survey_response_insert AFTER INSERT ON public.survey_responses FOR EACH ROW EXECUTE FUNCTION public.award_survey_response_points();


--
-- Name: qr_scans tr_check_qr_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_check_qr_limit BEFORE INSERT ON public.qr_scans FOR EACH ROW EXECUTE FUNCTION public.check_qr_limit();


--
-- Name: vana_codigo_sessions trg_game_plays_vana_codigo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_game_plays_vana_codigo AFTER INSERT OR UPDATE ON public.vana_codigo_sessions FOR EACH ROW EXECUTE FUNCTION public.log_singleplayer_play('vana-codigo');


--
-- Name: vana_sentinela_scores trg_game_plays_vana_sentinela; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_game_plays_vana_sentinela AFTER INSERT ON public.vana_sentinela_scores FOR EACH ROW EXECUTE FUNCTION public.log_vana_sentinela_play();


--
-- Name: vanatrilha_daily_runs trg_game_plays_vana_trilha; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_game_plays_vana_trilha AFTER INSERT OR UPDATE ON public.vanatrilha_daily_runs FOR EACH ROW EXECUTE FUNCTION public.log_singleplayer_play('vana-trilha');


--
-- Name: vantur_sessions trg_game_plays_vantur; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_game_plays_vantur AFTER INSERT OR UPDATE ON public.vantur_sessions FOR EACH ROW EXECUTE FUNCTION public.log_singleplayer_play('vantur');


--
-- Name: points_log trg_log_points_log_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_points_log_delete BEFORE DELETE ON public.points_log FOR EACH ROW EXECUTE FUNCTION public.log_points_log_change();


--
-- Name: points_log trg_log_points_log_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_points_log_update AFTER UPDATE ON public.points_log FOR EACH ROW EXECUTE FUNCTION public.log_points_log_change();


--
-- Name: profiles trg_normalize_role_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_normalize_role_change BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.normalize_role_change();


--
-- Name: profiles trg_protect_gender_column; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_gender_column BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_gender_column();


--
-- Name: profiles trg_protect_point_totals; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_point_totals BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_point_totals();


--
-- Name: profiles trg_protect_role_columns; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_role_columns BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_role_columns();


--
-- Name: vanacoro_answers trg_vanacoro_answers_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_vanacoro_answers_limit BEFORE INSERT ON public.vanacoro_answers FOR EACH ROW EXECUTE FUNCTION public.vanacoro_answers_limit();


--
-- Name: vanatrilha_questions trg_vanatrilha_questions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_vanatrilha_questions_updated_at BEFORE UPDATE ON public.vanatrilha_questions FOR EACH ROW EXECUTE FUNCTION public.vanatrilha_touch_updated_at();


--
-- Name: vanacamp_players vanacamp_check_bot_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vanacamp_check_bot_trigger BEFORE INSERT OR UPDATE ON public.vanacamp_players FOR EACH ROW EXECUTE FUNCTION public.vanacamp_check_bot_in_test_session();


--
-- Name: vanasketch_players vanasketch_bot_check; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vanasketch_bot_check BEFORE INSERT OR UPDATE ON public.vanasketch_players FOR EACH ROW EXECUTE FUNCTION public.vanasketch_check_bot();


--
-- Name: vanawords_players vanawords_bot_check; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vanawords_bot_check BEFORE INSERT OR UPDATE ON public.vanawords_players FOR EACH ROW EXECUTE FUNCTION public.vanawords_check_bot();


--
-- Name: announcement_recipients announcement_recipients_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_recipients
    ADD CONSTRAINT announcement_recipients_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;


--
-- Name: announcement_recipients announcement_recipients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_recipients
    ADD CONSTRAINT announcement_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: announcements announcements_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: announcements announcements_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: club_families club_families_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_families
    ADD CONSTRAINT club_families_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: club_family_invites club_family_invites_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_family_invites
    ADD CONSTRAINT club_family_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: club_family_invites club_family_invites_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_family_invites
    ADD CONSTRAINT club_family_invites_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.club_families(id) ON DELETE CASCADE;


--
-- Name: club_family_members club_family_members_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_family_members
    ADD CONSTRAINT club_family_members_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: club_family_members club_family_members_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_family_members
    ADD CONSTRAINT club_family_members_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.club_families(id) ON DELETE CASCADE;


--
-- Name: club_family_members club_family_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_family_members
    ADD CONSTRAINT club_family_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: club_screens club_screens_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_screens
    ADD CONSTRAINT club_screens_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: digital_keys digital_keys_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_keys
    ADD CONSTRAINT digital_keys_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.store_products(id) ON DELETE CASCADE;


--
-- Name: email_opt_outs email_opt_outs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_opt_outs
    ADD CONSTRAINT email_opt_outs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: event_attendance event_attendance_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_attendance
    ADD CONSTRAINT event_attendance_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_attendance event_attendance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_attendance
    ADD CONSTRAINT event_attendance_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: event_guests event_guests_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_guests
    ADD CONSTRAINT event_guests_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_invites event_invites_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_invites event_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: event_invites event_invites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: event_rsvps event_rsvps_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_rsvps
    ADD CONSTRAINT event_rsvps_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_rsvps event_rsvps_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_rsvps
    ADD CONSTRAINT event_rsvps_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: events events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: family_account_links family_account_links_associated_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_account_links
    ADD CONSTRAINT family_account_links_associated_user_id_fkey FOREIGN KEY (associated_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: family_account_links family_account_links_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_account_links
    ADD CONSTRAINT family_account_links_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: family_account_requests family_account_requests_accepted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_account_requests
    ADD CONSTRAINT family_account_requests_accepted_by_user_id_fkey FOREIGN KEY (accepted_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: family_account_requests family_account_requests_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_account_requests
    ADD CONSTRAINT family_account_requests_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: game_plays game_plays_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_plays
    ADD CONSTRAINT game_plays_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: points_log points_log_awarded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_log
    ADD CONSTRAINT points_log_awarded_by_user_id_fkey FOREIGN KEY (awarded_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: points_log points_log_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_log
    ADD CONSTRAINT points_log_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: points_log points_log_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_log
    ADD CONSTRAINT points_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: points_season_standings points_season_standings_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_season_standings
    ADD CONSTRAINT points_season_standings_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.points_seasons(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: qr_scans qr_scans_qr_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_scans
    ADD CONSTRAINT qr_scans_qr_code_id_fkey FOREIGN KEY (qr_code_id) REFERENCES public.qr_codes(id) ON DELETE CASCADE;


--
-- Name: qr_scans qr_scans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_scans
    ADD CONSTRAINT qr_scans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: raffle_screens raffle_screens_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raffle_screens
    ADD CONSTRAINT raffle_screens_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: section_changes section_changes_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_changes
    ADD CONSTRAINT section_changes_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: section_changes section_changes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_changes
    ADD CONSTRAINT section_changes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: store_purchases store_purchases_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_purchases
    ADD CONSTRAINT store_purchases_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.store_products(id) ON DELETE CASCADE;


--
-- Name: store_purchases store_purchases_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_purchases
    ADD CONSTRAINT store_purchases_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: suggestions suggestions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suggestions
    ADD CONSTRAINT suggestions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: survey_options survey_options_survey_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_options
    ADD CONSTRAINT survey_options_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.surveys(id) ON DELETE CASCADE;


--
-- Name: survey_responses survey_responses_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.survey_options(id) ON DELETE CASCADE;


--
-- Name: survey_responses survey_responses_survey_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.surveys(id) ON DELETE CASCADE;


--
-- Name: survey_responses survey_responses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: surveys surveys_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surveys
    ADD CONSTRAINT surveys_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: task_completions task_completions_awarded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_completions
    ADD CONSTRAINT task_completions_awarded_by_user_id_fkey FOREIGN KEY (awarded_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: task_completions task_completions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_completions
    ADD CONSTRAINT task_completions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_completions task_completions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_completions
    ADD CONSTRAINT task_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: team_screens team_screens_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_screens
    ADD CONSTRAINT team_screens_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: timer_screens timer_screens_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timer_screens
    ADD CONSTRAINT timer_screens_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: trip_plans trip_plans_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_plans
    ADD CONSTRAINT trip_plans_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: trip_plans trip_plans_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_plans
    ADD CONSTRAINT trip_plans_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vana_codigo_sessions vana_codigo_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_codigo_sessions
    ADD CONSTRAINT vana_codigo_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: vana_quest_answers vana_quest_answers_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_quest_answers
    ADD CONSTRAINT vana_quest_answers_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.vana_quest_participants(id) ON DELETE CASCADE;


--
-- Name: vana_quest_answers vana_quest_answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_quest_answers
    ADD CONSTRAINT vana_quest_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.vana_quest_questions(id) ON DELETE CASCADE;


--
-- Name: vana_quest_answers vana_quest_answers_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_quest_answers
    ADD CONSTRAINT vana_quest_answers_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vana_quest_sessions(id) ON DELETE CASCADE;


--
-- Name: vana_quest_participants vana_quest_participants_rewards_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_quest_participants
    ADD CONSTRAINT vana_quest_participants_rewards_recipient_id_fkey FOREIGN KEY (rewards_recipient_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vana_quest_participants vana_quest_participants_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_quest_participants
    ADD CONSTRAINT vana_quest_participants_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vana_quest_sessions(id) ON DELETE CASCADE;


--
-- Name: vana_quest_participants vana_quest_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_quest_participants
    ADD CONSTRAINT vana_quest_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vana_quest_questions vana_quest_questions_vana_quest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_quest_questions
    ADD CONSTRAINT vana_quest_questions_vana_quest_id_fkey FOREIGN KEY (vana_quest_id) REFERENCES public.vana_quests(id) ON DELETE CASCADE;


--
-- Name: vana_quest_sessions vana_quest_sessions_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_quest_sessions
    ADD CONSTRAINT vana_quest_sessions_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: vana_quest_sessions vana_quest_sessions_vana_quest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_quest_sessions
    ADD CONSTRAINT vana_quest_sessions_vana_quest_id_fkey FOREIGN KEY (vana_quest_id) REFERENCES public.vana_quests(id) ON DELETE CASCADE;


--
-- Name: vana_quests vana_quests_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_quests
    ADD CONSTRAINT vana_quests_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vana_sentinela_scores vana_sentinela_scores_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vana_sentinela_scores
    ADD CONSTRAINT vana_sentinela_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: vanacamp_events vanacamp_events_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_events
    ADD CONSTRAINT vanacamp_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanacamp_sessions(id) ON DELETE CASCADE;


--
-- Name: vanacamp_messages vanacamp_messages_sender_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_messages
    ADD CONSTRAINT vanacamp_messages_sender_player_id_fkey FOREIGN KEY (sender_player_id) REFERENCES public.vanacamp_players(id) ON DELETE CASCADE;


--
-- Name: vanacamp_messages vanacamp_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_messages
    ADD CONSTRAINT vanacamp_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanacamp_sessions(id) ON DELETE CASCADE;


--
-- Name: vanacamp_night_actions vanacamp_night_actions_actor_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_night_actions
    ADD CONSTRAINT vanacamp_night_actions_actor_player_id_fkey FOREIGN KEY (actor_player_id) REFERENCES public.vanacamp_players(id) ON DELETE CASCADE;


--
-- Name: vanacamp_night_actions vanacamp_night_actions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_night_actions
    ADD CONSTRAINT vanacamp_night_actions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanacamp_sessions(id) ON DELETE CASCADE;


--
-- Name: vanacamp_night_actions vanacamp_night_actions_target_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_night_actions
    ADD CONSTRAINT vanacamp_night_actions_target_player_id_fkey FOREIGN KEY (target_player_id) REFERENCES public.vanacamp_players(id) ON DELETE CASCADE;


--
-- Name: vanacamp_players vanacamp_players_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_players
    ADD CONSTRAINT vanacamp_players_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanacamp_sessions(id) ON DELETE CASCADE;


--
-- Name: vanacamp_players vanacamp_players_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_players
    ADD CONSTRAINT vanacamp_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: vanacamp_sessions vanacamp_sessions_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_sessions
    ADD CONSTRAINT vanacamp_sessions_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: vanacamp_votes vanacamp_votes_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_votes
    ADD CONSTRAINT vanacamp_votes_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanacamp_sessions(id) ON DELETE CASCADE;


--
-- Name: vanacamp_votes vanacamp_votes_target_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_votes
    ADD CONSTRAINT vanacamp_votes_target_player_id_fkey FOREIGN KEY (target_player_id) REFERENCES public.vanacamp_players(id) ON DELETE CASCADE;


--
-- Name: vanacamp_votes vanacamp_votes_voter_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacamp_votes
    ADD CONSTRAINT vanacamp_votes_voter_player_id_fkey FOREIGN KEY (voter_player_id) REFERENCES public.vanacamp_players(id) ON DELETE CASCADE;


--
-- Name: vanacoro_answer_rewards vanacoro_answer_rewards_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_answer_rewards
    ADD CONSTRAINT vanacoro_answer_rewards_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: vanacoro_answer_rewards vanacoro_answer_rewards_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_answer_rewards
    ADD CONSTRAINT vanacoro_answer_rewards_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.vanacoro_questions(id) ON DELETE CASCADE;


--
-- Name: vanacoro_answers vanacoro_answers_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_answers
    ADD CONSTRAINT vanacoro_answers_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.vanacoro_groups(id) ON DELETE SET NULL;


--
-- Name: vanacoro_answers vanacoro_answers_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_answers
    ADD CONSTRAINT vanacoro_answers_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: vanacoro_answers vanacoro_answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_answers
    ADD CONSTRAINT vanacoro_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.vanacoro_questions(id) ON DELETE CASCADE;


--
-- Name: vanacoro_board_entries vanacoro_board_entries_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_board_entries
    ADD CONSTRAINT vanacoro_board_entries_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.vanacoro_questions(id) ON DELETE CASCADE;


--
-- Name: vanacoro_groups vanacoro_groups_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_groups
    ADD CONSTRAINT vanacoro_groups_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.vanacoro_questions(id) ON DELETE CASCADE;


--
-- Name: vanacoro_players vanacoro_players_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_players
    ADD CONSTRAINT vanacoro_players_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vanacoro_players vanacoro_players_rewards_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_players
    ADD CONSTRAINT vanacoro_players_rewards_recipient_id_fkey FOREIGN KEY (rewards_recipient_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vanacoro_players vanacoro_players_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_players
    ADD CONSTRAINT vanacoro_players_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanacoro_sessions(id) ON DELETE CASCADE;


--
-- Name: vanacoro_questions vanacoro_questions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_questions
    ADD CONSTRAINT vanacoro_questions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vanacoro_questions vanacoro_questions_used_session_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_questions
    ADD CONSTRAINT vanacoro_questions_used_session_fk FOREIGN KEY (used_in_session_id) REFERENCES public.vanacoro_sessions(id) ON DELETE SET NULL;


--
-- Name: vanacoro_reveals vanacoro_reveals_board_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_reveals
    ADD CONSTRAINT vanacoro_reveals_board_entry_id_fkey FOREIGN KEY (board_entry_id) REFERENCES public.vanacoro_board_entries(id) ON DELETE CASCADE;


--
-- Name: vanacoro_reveals vanacoro_reveals_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_reveals
    ADD CONSTRAINT vanacoro_reveals_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.vanacoro_rounds(id) ON DELETE CASCADE;


--
-- Name: vanacoro_roster vanacoro_roster_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_roster
    ADD CONSTRAINT vanacoro_roster_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanacoro_sessions(id) ON DELETE CASCADE;


--
-- Name: vanacoro_round_events vanacoro_round_events_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_round_events
    ADD CONSTRAINT vanacoro_round_events_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.vanacoro_rounds(id) ON DELETE CASCADE;


--
-- Name: vanacoro_rounds vanacoro_rounds_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_rounds
    ADD CONSTRAINT vanacoro_rounds_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.vanacoro_questions(id) ON DELETE CASCADE;


--
-- Name: vanacoro_rounds vanacoro_rounds_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_rounds
    ADD CONSTRAINT vanacoro_rounds_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanacoro_sessions(id) ON DELETE CASCADE;


--
-- Name: vanacoro_sessions vanacoro_sessions_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanacoro_sessions
    ADD CONSTRAINT vanacoro_sessions_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: vanaespada_answers vanaespada_answers_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_answers
    ADD CONSTRAINT vanaespada_answers_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.vanaespada_players(id) ON DELETE CASCADE;


--
-- Name: vanaespada_answers vanaespada_answers_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_answers
    ADD CONSTRAINT vanaespada_answers_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.vanaespada_session_rounds(id) ON DELETE CASCADE;


--
-- Name: vanaespada_answers vanaespada_answers_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_answers
    ADD CONSTRAINT vanaespada_answers_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanaespada_sessions(id) ON DELETE CASCADE;


--
-- Name: vanaespada_deck_rounds vanaespada_deck_rounds_deck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_deck_rounds
    ADD CONSTRAINT vanaespada_deck_rounds_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.vanaespada_decks(id) ON DELETE CASCADE;


--
-- Name: vanaespada_deck_rounds vanaespada_deck_rounds_prompt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_deck_rounds
    ADD CONSTRAINT vanaespada_deck_rounds_prompt_id_fkey FOREIGN KEY (prompt_id) REFERENCES public.vanaespada_drill_prompts(id) ON DELETE CASCADE;


--
-- Name: vanaespada_deck_rounds vanaespada_deck_rounds_verse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_deck_rounds
    ADD CONSTRAINT vanaespada_deck_rounds_verse_id_fkey FOREIGN KEY (verse_id) REFERENCES public.vanaespada_verses(id) ON DELETE CASCADE;


--
-- Name: vanaespada_decks vanaespada_decks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_decks
    ADD CONSTRAINT vanaespada_decks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vanaespada_drill_prompts vanaespada_drill_prompts_verse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_drill_prompts
    ADD CONSTRAINT vanaespada_drill_prompts_verse_id_fkey FOREIGN KEY (verse_id) REFERENCES public.vanaespada_verses(id) ON DELETE CASCADE;


--
-- Name: vanaespada_players vanaespada_players_rewards_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_players
    ADD CONSTRAINT vanaespada_players_rewards_recipient_id_fkey FOREIGN KEY (rewards_recipient_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vanaespada_players vanaespada_players_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_players
    ADD CONSTRAINT vanaespada_players_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanaespada_sessions(id) ON DELETE CASCADE;


--
-- Name: vanaespada_players vanaespada_players_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_players
    ADD CONSTRAINT vanaespada_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vanaespada_session_rounds vanaespada_session_rounds_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_session_rounds
    ADD CONSTRAINT vanaespada_session_rounds_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanaespada_sessions(id) ON DELETE CASCADE;


--
-- Name: vanaespada_session_rounds vanaespada_session_rounds_verse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_session_rounds
    ADD CONSTRAINT vanaespada_session_rounds_verse_id_fkey FOREIGN KEY (verse_id) REFERENCES public.vanaespada_verses(id) ON DELETE SET NULL;


--
-- Name: vanaespada_sessions vanaespada_sessions_deck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_sessions
    ADD CONSTRAINT vanaespada_sessions_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.vanaespada_decks(id) ON DELETE SET NULL;


--
-- Name: vanaespada_sessions vanaespada_sessions_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_sessions
    ADD CONSTRAINT vanaespada_sessions_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: vanaespada_verses vanaespada_verses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanaespada_verses
    ADD CONSTRAINT vanaespada_verses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vanasketch_guesses vanasketch_guesses_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_guesses
    ADD CONSTRAINT vanasketch_guesses_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.vanasketch_players(id) ON DELETE CASCADE;


--
-- Name: vanasketch_guesses vanasketch_guesses_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_guesses
    ADD CONSTRAINT vanasketch_guesses_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanasketch_sessions(id) ON DELETE CASCADE;


--
-- Name: vanasketch_pack_words vanasketch_pack_words_pack_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_pack_words
    ADD CONSTRAINT vanasketch_pack_words_pack_id_fkey FOREIGN KEY (pack_id) REFERENCES public.vanasketch_packs(id) ON DELETE CASCADE;


--
-- Name: vanasketch_players vanasketch_players_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_players
    ADD CONSTRAINT vanasketch_players_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanasketch_sessions(id) ON DELETE CASCADE;


--
-- Name: vanasketch_players vanasketch_players_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_players
    ADD CONSTRAINT vanasketch_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: vanasketch_rounds vanasketch_rounds_drawer_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_rounds
    ADD CONSTRAINT vanasketch_rounds_drawer_player_id_fkey FOREIGN KEY (drawer_player_id) REFERENCES public.vanasketch_players(id) ON DELETE CASCADE;


--
-- Name: vanasketch_rounds vanasketch_rounds_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_rounds
    ADD CONSTRAINT vanasketch_rounds_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanasketch_sessions(id) ON DELETE CASCADE;


--
-- Name: vanasketch_sessions vanasketch_sessions_drawer_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_sessions
    ADD CONSTRAINT vanasketch_sessions_drawer_fk FOREIGN KEY (drawer_player_id) REFERENCES public.vanasketch_players(id) ON DELETE SET NULL;


--
-- Name: vanasketch_sessions vanasketch_sessions_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_sessions
    ADD CONSTRAINT vanasketch_sessions_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: vanasketch_strokes vanasketch_strokes_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanasketch_strokes
    ADD CONSTRAINT vanasketch_strokes_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanasketch_sessions(id) ON DELETE CASCADE;


--
-- Name: vanatrilha_daily_runs vanatrilha_daily_runs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanatrilha_daily_runs
    ADD CONSTRAINT vanatrilha_daily_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: vanatrilha_questions vanatrilha_questions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanatrilha_questions
    ADD CONSTRAINT vanatrilha_questions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vanatrilha_station_progress vanatrilha_station_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanatrilha_station_progress
    ADD CONSTRAINT vanatrilha_station_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: vanawords_guesses vanawords_guesses_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_guesses
    ADD CONSTRAINT vanawords_guesses_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.vanawords_players(id) ON DELETE CASCADE;


--
-- Name: vanawords_guesses vanawords_guesses_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_guesses
    ADD CONSTRAINT vanawords_guesses_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanawords_sessions(id) ON DELETE CASCADE;


--
-- Name: vanawords_guesses vanawords_guesses_word_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_guesses
    ADD CONSTRAINT vanawords_guesses_word_id_fkey FOREIGN KEY (word_id) REFERENCES public.vanawords_words(id) ON DELETE CASCADE;


--
-- Name: vanawords_players vanawords_players_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_players
    ADD CONSTRAINT vanawords_players_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanawords_sessions(id) ON DELETE CASCADE;


--
-- Name: vanawords_players vanawords_players_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_players
    ADD CONSTRAINT vanawords_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: vanawords_sessions vanawords_sessions_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_sessions
    ADD CONSTRAINT vanawords_sessions_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: vanawords_turns vanawords_turns_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_turns
    ADD CONSTRAINT vanawords_turns_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanawords_sessions(id) ON DELETE CASCADE;


--
-- Name: vanawords_word_bank vanawords_word_bank_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_word_bank
    ADD CONSTRAINT vanawords_word_bank_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vanawords_words vanawords_words_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vanawords_words
    ADD CONSTRAINT vanawords_words_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.vanawords_sessions(id) ON DELETE CASCADE;


--
-- Name: vantur_sessions vantur_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vantur_sessions
    ADD CONSTRAINT vantur_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: store_settings Anyone can read store settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read store settings" ON public.store_settings FOR SELECT USING (true);


--
-- Name: game_settings Anyone can view game settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view game settings" ON public.game_settings FOR SELECT USING (true);


--
-- Name: qr_codes Authenticated users can view QR codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view QR codes" ON public.qr_codes FOR SELECT TO authenticated USING (true);


--
-- Name: announcements Authors can delete their announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authors can delete their announcements" ON public.announcements FOR DELETE USING (((auth.uid() = author_id) OR (public.get_my_role() = 'coordenador'::text)));


--
-- Name: survey_responses Change vote while non-definitive open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Change vote while non-definitive open" ON public.survey_responses FOR UPDATE USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.surveys s
  WHERE ((s.id = survey_responses.survey_id) AND (s.deadline > now()) AND (NOT s.is_definitive) AND (s.opened_at IS NOT NULL) AND (s.opened_at <= now())))))) WITH CHECK ((user_id = auth.uid()));


--
-- Name: points_log Coordinators can audit points; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coordinators can audit points" ON public.points_log FOR SELECT USING ((public.get_my_real_role() = 'coordenador'::text));


--
-- Name: game_settings Coordinators can insert game settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coordinators can insert game settings" ON public.game_settings FOR INSERT WITH CHECK ((public.get_my_role() = 'coordenador'::text));


--
-- Name: qr_codes Coordinators can manage QR codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coordinators can manage QR codes" ON public.qr_codes TO authenticated USING ((public.get_my_role() = 'coordenador'::text));


--
-- Name: game_settings Coordinators can update game settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coordinators can update game settings" ON public.game_settings FOR UPDATE USING ((public.get_my_role() = 'coordenador'::text)) WITH CHECK ((public.get_my_role() = 'coordenador'::text));


--
-- Name: profiles Coordinators can update profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coordinators can update profiles" ON public.profiles FOR UPDATE USING ((public.get_my_role() = 'coordenador'::text));


--
-- Name: profiles Coordinators can view all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coordinators can view all" ON public.profiles FOR SELECT USING ((public.get_my_role() = 'coordenador'::text));


--
-- Name: store_purchases Coordinators can view all purchases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coordinators can view all purchases" ON public.store_purchases FOR SELECT USING ((public.get_my_real_role() = 'coordenador'::text));


--
-- Name: qr_scans Coordinators can view all scans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coordinators can view all scans" ON public.qr_scans FOR SELECT TO authenticated USING ((public.get_my_role() = 'coordenador'::text));


--
-- Name: points_audit_events Coordinators can view audit events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coordinators can view audit events" ON public.points_audit_events FOR SELECT USING ((public.get_my_real_role() = 'coordenador'::text));


--
-- Name: points_season_standings Coordinators can view season standings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coordinators can view season standings" ON public.points_season_standings FOR SELECT USING ((public.get_my_real_role() = 'coordenador'::text));


--
-- Name: points_seasons Coordinators can view seasons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coordinators can view seasons" ON public.points_seasons FOR SELECT USING ((public.get_my_real_role() = 'coordenador'::text));


--
-- Name: survey_responses Coordinators delete responses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coordinators delete responses" ON public.survey_responses FOR DELETE USING ((public.get_my_role() = 'coordenador'::text));


--
-- Name: surveys Coordinators delete surveys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coordinators delete surveys" ON public.surveys FOR DELETE USING ((public.get_my_role() = 'coordenador'::text));


--
-- Name: surveys Coordinators insert surveys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coordinators insert surveys" ON public.surveys FOR INSERT WITH CHECK ((public.get_my_role() = 'coordenador'::text));


--
-- Name: survey_options Coordinators manage options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coordinators manage options" ON public.survey_options USING ((public.get_my_role() = 'coordenador'::text)) WITH CHECK ((public.get_my_role() = 'coordenador'::text));


--
-- Name: store_products Coordinators manage products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coordinators manage products" ON public.store_products USING ((public.get_my_real_role() = 'coordenador'::text));


--
-- Name: store_settings Coordinators manage store settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coordinators manage store settings" ON public.store_settings USING ((public.get_my_real_role() = 'coordenador'::text));


--
-- Name: surveys Coordinators update surveys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coordinators update surveys" ON public.surveys FOR UPDATE USING ((public.get_my_role() = 'coordenador'::text));


--
-- Name: task_completions Desbravadores can mark tasks complete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Desbravadores can mark tasks complete" ON public.task_completions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: task_completions Leaders can award points on completions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can award points on completions" ON public.task_completions FOR UPDATE USING (((public.get_my_role() = 'coordenador'::text) OR ((public.get_my_role() = 'dirigente'::text) AND (( SELECT (profiles.section)::text AS section
   FROM public.profiles
  WHERE (profiles.id = task_completions.user_id)) = public.get_my_leadership_section()))));


--
-- Name: announcements Leaders can create announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can create announcements" ON public.announcements FOR INSERT WITH CHECK (((auth.uid() = author_id) AND ((public.get_my_role() = 'coordenador'::text) OR ((public.get_my_role() = 'dirigente'::text) AND (target_user_id IS NULL) AND (target_role IS NULL) AND (target_section = COALESCE(public.get_my_leadership_section(), public.get_my_section()))))));


--
-- Name: tasks Leaders can create tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can create tasks" ON public.tasks FOR INSERT WITH CHECK (((auth.uid() = created_by_user_id) AND (public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text]))));


--
-- Name: task_completions Leaders can delete completions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can delete completions" ON public.task_completions FOR DELETE USING (((public.get_my_role() = 'coordenador'::text) OR ((public.get_my_role() = 'dirigente'::text) AND (( SELECT (profiles.section)::text AS section
   FROM public.profiles
  WHERE (profiles.id = task_completions.user_id)) = public.get_my_leadership_section()))));


--
-- Name: points_log Leaders can insert points; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can insert points" ON public.points_log FOR INSERT WITH CHECK (((auth.uid() = awarded_by_user_id) AND ((target_user_id <> auth.uid()) OR (public.get_my_real_role() = 'coordenador'::text)) AND ((public.get_my_role() = 'coordenador'::text) OR ((public.get_my_role() = 'dirigente'::text) AND (public.get_profile_section(target_user_id) = COALESCE(public.get_my_leadership_section(), public.get_my_section()))))));


--
-- Name: event_attendance Leaders can manage attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can manage attendance" ON public.event_attendance USING (((public.get_my_role() = 'coordenador'::text) OR ((public.get_my_role() = 'dirigente'::text) AND (( SELECT (profiles.section)::text AS section
   FROM public.profiles
  WHERE (profiles.id = event_attendance.user_id)) = public.get_my_leadership_section()))));


--
-- Name: events Leaders can manage events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can manage events" ON public.events USING (((public.get_my_role() = 'coordenador'::text) OR ((public.get_my_role() = 'dirigente'::text) AND (target_section = public.get_my_leadership_section()))));


--
-- Name: suggestions Leaders can mark suggestions as read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can mark suggestions as read" ON public.suggestions FOR UPDATE USING (((public.get_my_role() = 'coordenador'::text) OR ((public.get_my_role() = 'dirigente'::text) AND (target = 'dirigente'::text) AND (( SELECT (profiles.section)::text AS section
   FROM public.profiles
  WHERE (profiles.id = suggestions.user_id)) = public.get_my_leadership_section()))));


--
-- Name: event_invites Leaders can view invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can view invites" ON public.event_invites FOR SELECT USING (((public.get_my_role() = 'coordenador'::text) OR ((public.get_my_role() = 'dirigente'::text) AND (( SELECT (profiles.section)::text AS section
   FROM public.profiles
  WHERE (profiles.id = event_invites.user_id)) = public.get_my_leadership_section()))));


--
-- Name: suggestions Leaders can view suggestions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can view suggestions" ON public.suggestions FOR SELECT USING (((public.get_my_role() = 'coordenador'::text) OR ((public.get_my_role() = 'dirigente'::text) AND (target = 'dirigente'::text) AND (( SELECT (profiles.section)::text AS section
   FROM public.profiles
  WHERE (profiles.id = suggestions.user_id)) = public.get_my_leadership_section()))));


--
-- Name: profiles Leaders can view their charges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can view their charges" ON public.profiles FOR SELECT USING (((public.get_my_role() = 'dirigente'::text) AND ((section)::text = public.get_my_leadership_section())));


--
-- Name: digital_keys Only coordinators can manage keys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only coordinators can manage keys" ON public.digital_keys USING ((public.get_my_real_role() = 'coordenador'::text));


--
-- Name: store_products Public can view active products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active products" ON public.store_products FOR SELECT USING (((is_active = true) OR (public.get_my_real_role() = 'coordenador'::text)));


--
-- Name: profiles Public can view desbravador leaderboard info; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view desbravador leaderboard info" ON public.profiles FOR SELECT USING ((role = 'desbravador'::public.app_role));


--
-- Name: tasks Task creators can delete tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Task creators can delete tasks" ON public.tasks FOR DELETE USING (((created_by_user_id = auth.uid()) OR (public.get_my_role() = 'coordenador'::text)));


--
-- Name: tasks Task creators can update tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Task creators can update tasks" ON public.tasks FOR UPDATE USING (((created_by_user_id = auth.uid()) OR (public.get_my_role() = 'coordenador'::text)));


--
-- Name: suggestions Users can delete own suggestions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own suggestions" ON public.suggestions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: qr_scans Users can insert own scans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own scans" ON public.qr_scans FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: suggestions Users can insert suggestions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert suggestions" ON public.suggestions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: push_subscriptions Users can manage own push subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own push subscriptions" ON public.push_subscriptions USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: event_attendance Users can view own attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own attendance" ON public.event_attendance FOR SELECT USING (((user_id = auth.uid()) OR (public.get_my_role() = 'coordenador'::text) OR ((public.get_my_role() = 'dirigente'::text) AND (( SELECT (profiles.section)::text AS section
   FROM public.profiles
  WHERE (profiles.id = event_attendance.user_id)) = public.get_my_leadership_section()))));


--
-- Name: points_log Users can view own points; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own points" ON public.points_log FOR SELECT USING (((target_user_id = auth.uid()) OR (awarded_by_user_id = auth.uid())));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: store_purchases Users can view own purchases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own purchases" ON public.store_purchases FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: qr_scans Users can view own scans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own scans" ON public.qr_scans FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: suggestions Users can view own suggestions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own suggestions" ON public.suggestions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: announcements Users can view relevant announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view relevant announcements" ON public.announcements FOR SELECT USING (((author_id = auth.uid()) OR (public.get_my_role() = 'coordenador'::text) OR public.is_announcement_recipient(id)));


--
-- Name: task_completions Users can view relevant completions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view relevant completions" ON public.task_completions FOR SELECT USING (((user_id = auth.uid()) OR (public.get_my_role() = 'coordenador'::text) OR ((public.get_my_role() = 'dirigente'::text) AND (( SELECT (profiles.section)::text AS section
   FROM public.profiles
  WHERE (profiles.id = task_completions.user_id)) = public.get_my_leadership_section()))));


--
-- Name: survey_options View options of visible surveys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View options of visible surveys" ON public.survey_options FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.surveys s
  WHERE ((s.id = survey_options.survey_id) AND (((s.opened_at IS NOT NULL) AND (s.opened_at <= now()) AND ((s.deadline + '3 days'::interval) > now())) OR (public.get_my_role() = 'coordenador'::text))))));


--
-- Name: email_opt_outs View own or managed opt-outs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View own or managed opt-outs" ON public.email_opt_outs FOR SELECT USING (((user_id = auth.uid()) OR (public.get_my_role() = 'coordenador'::text) OR ((public.get_my_role() = 'dirigente'::text) AND (( SELECT (profiles.section)::text AS section
   FROM public.profiles
  WHERE (profiles.id = email_opt_outs.user_id)) = public.get_my_leadership_section()))));


--
-- Name: survey_responses View own or post-deadline responses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View own or post-deadline responses" ON public.survey_responses FOR SELECT USING (((user_id = auth.uid()) OR (public.get_my_role() = 'coordenador'::text) OR (EXISTS ( SELECT 1
   FROM public.surveys s
  WHERE ((s.id = survey_responses.survey_id) AND ((s.deadline <= now()) OR s.show_results_live))))));


--
-- Name: events View relevant events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View relevant events" ON public.events FOR SELECT USING (((target_section IS NULL) OR (target_section = public.get_my_section()) OR (target_section = public.get_my_leadership_section()) OR (public.get_my_role() = 'coordenador'::text)));


--
-- Name: announcement_recipients View relevant recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View relevant recipients" ON public.announcement_recipients FOR SELECT USING (((user_id = auth.uid()) OR (public.get_my_role() = 'coordenador'::text) OR public.is_announcement_author(announcement_id)));


--
-- Name: section_changes View relevant section changes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View relevant section changes" ON public.section_changes FOR SELECT USING (((user_id = auth.uid()) OR (public.get_my_role() = 'coordenador'::text) OR ((public.get_my_role() = 'dirigente'::text) AND (((to_section)::text = public.get_my_leadership_section()) OR ((from_section)::text = public.get_my_leadership_section())))));


--
-- Name: tasks View relevant tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View relevant tasks" ON public.tasks FOR SELECT USING (((target_section IS NULL) OR (target_section = public.get_my_section()) OR (target_section = public.get_my_leadership_section()) OR (public.get_my_role() = 'coordenador'::text)));


--
-- Name: surveys View visible surveys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View visible surveys" ON public.surveys FOR SELECT USING ((((opened_at IS NOT NULL) AND (opened_at <= now()) AND ((deadline + '3 days'::interval) > now())) OR (public.get_my_role() = 'coordenador'::text)));


--
-- Name: survey_responses Vote while open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Vote while open" ON public.survey_responses FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.surveys s
  WHERE ((s.id = survey_responses.survey_id) AND (s.deadline > now()) AND (s.opened_at IS NOT NULL) AND (s.opened_at <= now()))))));


--
-- Name: announcement_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcement_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: club_families; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.club_families ENABLE ROW LEVEL SECURITY;

--
-- Name: club_family_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.club_family_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: club_family_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.club_family_members ENABLE ROW LEVEL SECURITY;

--
-- Name: club_screens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.club_screens ENABLE ROW LEVEL SECURITY;

--
-- Name: club_screens club_screens_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY club_screens_own ON public.club_screens USING ((host_id = auth.uid())) WITH CHECK (((host_id = auth.uid()) AND (public.get_my_role() = ANY (ARRAY['coordenador'::text, 'dirigente'::text]))));


--
-- Name: digital_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.digital_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: email_opt_outs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_opt_outs ENABLE ROW LEVEL SECURITY;

--
-- Name: event_attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: event_guests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_guests ENABLE ROW LEVEL SECURITY;

--
-- Name: event_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: event_rsvps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

--
-- Name: event_rsvps event_rsvps_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_rsvps_select ON public.event_rsvps FOR SELECT USING (((user_id = auth.uid()) OR (public.get_my_role() = 'coordenador'::text) OR ((public.get_my_role() = 'dirigente'::text) AND (( SELECT (profiles.section)::text AS section
   FROM public.profiles
  WHERE (profiles.id = event_rsvps.user_id)) = public.get_my_leadership_section()))));


--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: family_account_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.family_account_links ENABLE ROW LEVEL SECURITY;

--
-- Name: family_account_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.family_account_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: game_plays; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.game_plays ENABLE ROW LEVEL SECURITY;

--
-- Name: game_plays game_plays_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY game_plays_select ON public.game_plays FOR SELECT USING (((public.get_my_role() = 'coordenador'::text) OR ((public.get_my_role() = 'dirigente'::text) AND (( SELECT (profiles.section)::text AS section
   FROM public.profiles
  WHERE (profiles.id = game_plays.user_id)) = public.get_my_leadership_section()))));


--
-- Name: game_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.game_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: points_audit_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.points_audit_events ENABLE ROW LEVEL SECURITY;

--
-- Name: points_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.points_log ENABLE ROW LEVEL SECURITY;

--
-- Name: points_season_standings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.points_season_standings ENABLE ROW LEVEL SECURITY;

--
-- Name: points_seasons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.points_seasons ENABLE ROW LEVEL SECURITY;

--
-- Name: portuguese_words; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.portuguese_words ENABLE ROW LEVEL SECURITY;

--
-- Name: portuguese_words portuguese_words_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY portuguese_words_admin_all ON public.portuguese_words TO authenticated USING ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text]))) WITH CHECK ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text])));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: qr_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: qr_scans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qr_scans ENABLE ROW LEVEL SECURITY;

--
-- Name: raffle_screens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.raffle_screens ENABLE ROW LEVEL SECURITY;

--
-- Name: raffle_screens raffle_screens_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY raffle_screens_own ON public.raffle_screens USING ((host_id = auth.uid())) WITH CHECK (((host_id = auth.uid()) AND (public.get_my_role() = ANY (ARRAY['coordenador'::text, 'dirigente'::text]))));


--
-- Name: section_changes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.section_changes ENABLE ROW LEVEL SECURITY;

--
-- Name: store_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;

--
-- Name: store_purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.store_purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: store_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: suggestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: survey_options; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.survey_options ENABLE ROW LEVEL SECURITY;

--
-- Name: survey_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: surveys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

--
-- Name: task_completions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: team_screens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_screens ENABLE ROW LEVEL SECURITY;

--
-- Name: team_screens team_screens_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_screens_own ON public.team_screens USING ((host_id = auth.uid())) WITH CHECK (((host_id = auth.uid()) AND (public.get_my_role() = ANY (ARRAY['coordenador'::text, 'dirigente'::text]))));


--
-- Name: timer_screens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timer_screens ENABLE ROW LEVEL SECURITY;

--
-- Name: timer_screens timer_screens_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timer_screens_own ON public.timer_screens USING ((host_id = auth.uid())) WITH CHECK (((host_id = auth.uid()) AND (public.get_my_role() = ANY (ARRAY['coordenador'::text, 'dirigente'::text]))));


--
-- Name: trip_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trip_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: trip_plans trip_plans_leaders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trip_plans_leaders ON public.trip_plans USING (public.can_manage_trip(event_id)) WITH CHECK (public.can_manage_trip(event_id));


--
-- Name: vana_codigo_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vana_codigo_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: vana_codigo_sessions vana_codigo_sessions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_codigo_sessions_insert ON public.vana_codigo_sessions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: vana_codigo_sessions vana_codigo_sessions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_codigo_sessions_select ON public.vana_codigo_sessions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: vana_codigo_sessions vana_codigo_sessions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_codigo_sessions_update ON public.vana_codigo_sessions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: vana_quest_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vana_quest_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: vana_quest_answers vana_quest_answers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_quest_answers_insert ON public.vana_quest_answers FOR INSERT WITH CHECK (true);


--
-- Name: vana_quest_answers vana_quest_answers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_quest_answers_select ON public.vana_quest_answers FOR SELECT USING (true);


--
-- Name: vana_quest_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vana_quest_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: vana_quest_participants vana_quest_participants_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_quest_participants_delete ON public.vana_quest_participants FOR DELETE USING ((public.get_my_role() = ANY (ARRAY['coordenador'::text, 'dirigente'::text])));


--
-- Name: vana_quest_participants vana_quest_participants_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_quest_participants_insert ON public.vana_quest_participants FOR INSERT WITH CHECK (true);


--
-- Name: vana_quest_participants vana_quest_participants_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_quest_participants_select ON public.vana_quest_participants FOR SELECT USING (true);


--
-- Name: vana_quest_participants vana_quest_participants_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_quest_participants_update ON public.vana_quest_participants FOR UPDATE USING (true);


--
-- Name: vana_quest_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vana_quest_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: vana_quest_questions vana_quest_questions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_quest_questions_delete ON public.vana_quest_questions FOR DELETE USING ((public.get_my_role() = ANY (ARRAY['coordenador'::text, 'dirigente'::text])));


--
-- Name: vana_quest_questions vana_quest_questions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_quest_questions_insert ON public.vana_quest_questions FOR INSERT WITH CHECK ((public.get_my_role() = ANY (ARRAY['coordenador'::text, 'dirigente'::text])));


--
-- Name: vana_quest_questions vana_quest_questions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_quest_questions_select ON public.vana_quest_questions FOR SELECT USING (true);


--
-- Name: vana_quest_questions vana_quest_questions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_quest_questions_update ON public.vana_quest_questions FOR UPDATE USING ((public.get_my_role() = ANY (ARRAY['coordenador'::text, 'dirigente'::text])));


--
-- Name: vana_quest_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vana_quest_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: vana_quest_sessions vana_quest_sessions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_quest_sessions_delete ON public.vana_quest_sessions FOR DELETE USING ((public.get_my_role() = ANY (ARRAY['coordenador'::text, 'dirigente'::text])));


--
-- Name: vana_quest_sessions vana_quest_sessions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_quest_sessions_insert ON public.vana_quest_sessions FOR INSERT WITH CHECK ((public.get_my_role() = ANY (ARRAY['coordenador'::text, 'dirigente'::text])));


--
-- Name: vana_quest_sessions vana_quest_sessions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_quest_sessions_select ON public.vana_quest_sessions FOR SELECT USING (true);


--
-- Name: vana_quest_sessions vana_quest_sessions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_quest_sessions_update ON public.vana_quest_sessions FOR UPDATE USING ((public.get_my_role() = ANY (ARRAY['coordenador'::text, 'dirigente'::text])));


--
-- Name: vana_quests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vana_quests ENABLE ROW LEVEL SECURITY;

--
-- Name: vana_quests vana_quests_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_quests_delete ON public.vana_quests FOR DELETE USING ((public.get_my_role() = ANY (ARRAY['coordenador'::text, 'dirigente'::text])));


--
-- Name: vana_quests vana_quests_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_quests_insert ON public.vana_quests FOR INSERT WITH CHECK ((public.get_my_role() = ANY (ARRAY['coordenador'::text, 'dirigente'::text])));


--
-- Name: vana_quests vana_quests_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_quests_select ON public.vana_quests FOR SELECT USING (true);


--
-- Name: vana_quests vana_quests_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_quests_update ON public.vana_quests FOR UPDATE USING ((public.get_my_role() = ANY (ARRAY['coordenador'::text, 'dirigente'::text])));


--
-- Name: vana_sentinela_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vana_sentinela_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: vana_sentinela_scores vana_sentinela_scores_delete_coord; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_sentinela_scores_delete_coord ON public.vana_sentinela_scores FOR DELETE USING ((public.get_my_role() = 'coordenador'::text));


--
-- Name: vana_sentinela_scores vana_sentinela_scores_select_coord; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_sentinela_scores_select_coord ON public.vana_sentinela_scores FOR SELECT USING ((public.get_my_role() = 'coordenador'::text));


--
-- Name: vana_sentinela_scores vana_sentinela_scores_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vana_sentinela_scores_select_own ON public.vana_sentinela_scores FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: vanacamp_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanacamp_events ENABLE ROW LEVEL SECURITY;

--
-- Name: vanacamp_events vanacamp_events_insert_host; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanacamp_events_insert_host ON public.vanacamp_events FOR INSERT TO authenticated WITH CHECK (public.vanacamp_is_host(session_id));


--
-- Name: vanacamp_events vanacamp_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanacamp_events_select ON public.vanacamp_events FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.vanacamp_players p
  WHERE ((p.session_id = vanacamp_events.session_id) AND (p.user_id = auth.uid())))) OR public.vanacamp_is_host(session_id)));


--
-- Name: vanacamp_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanacamp_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: vanacamp_messages vanacamp_messages_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanacamp_messages_insert_own ON public.vanacamp_messages FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.vanacamp_players p
  WHERE ((p.id = vanacamp_messages.sender_player_id) AND (p.user_id = auth.uid())))) AND ((channel = ANY (ARRAY['lobby'::text, 'day'::text])) OR ((channel = 'infiltrators'::text) AND public.vanacamp_is_infiltrator(session_id)) OR ((channel = 'dead'::text) AND public.vanacamp_is_dead_player(session_id)))));


--
-- Name: vanacamp_messages vanacamp_messages_select_by_channel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanacamp_messages_select_by_channel ON public.vanacamp_messages FOR SELECT TO authenticated USING ((((channel = ANY (ARRAY['lobby'::text, 'day'::text])) AND (EXISTS ( SELECT 1
   FROM public.vanacamp_players p
  WHERE ((p.session_id = vanacamp_messages.session_id) AND (p.user_id = auth.uid()))))) OR ((channel = 'infiltrators'::text) AND public.vanacamp_is_infiltrator(session_id)) OR ((channel = 'dead'::text) AND public.vanacamp_is_dead_player(session_id)) OR public.vanacamp_is_host(session_id)));


--
-- Name: vanacamp_night_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanacamp_night_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: vanacamp_night_actions vanacamp_night_actions_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanacamp_night_actions_insert_own ON public.vanacamp_night_actions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.vanacamp_players p
  WHERE ((p.id = vanacamp_night_actions.actor_player_id) AND (p.user_id = auth.uid()) AND (p.is_alive = true)))));


--
-- Name: vanacamp_night_actions vanacamp_night_actions_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanacamp_night_actions_select_own ON public.vanacamp_night_actions FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.vanacamp_players p
  WHERE ((p.id = vanacamp_night_actions.actor_player_id) AND (p.user_id = auth.uid())))) OR public.vanacamp_is_host(session_id)));


--
-- Name: vanacamp_players; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanacamp_players ENABLE ROW LEVEL SECURITY;

--
-- Name: vanacamp_players vanacamp_players_delete_self_or_host; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanacamp_players_delete_self_or_host ON public.vanacamp_players FOR DELETE TO authenticated USING (((user_id = auth.uid()) OR public.vanacamp_is_host(session_id) OR (public.get_my_role() = 'coordenador'::text)));


--
-- Name: vanacamp_players vanacamp_players_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanacamp_players_insert_self ON public.vanacamp_players FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (role IS NULL)));


--
-- Name: vanacamp_players vanacamp_players_select_self_or_host; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanacamp_players_select_self_or_host ON public.vanacamp_players FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.vanacamp_is_host(session_id) OR public.vanacamp_is_infiltrator(session_id) OR public.vanacamp_is_dead_player(session_id)));


--
-- Name: vanacamp_players vanacamp_players_update_host; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanacamp_players_update_host ON public.vanacamp_players FOR UPDATE TO authenticated USING ((public.vanacamp_is_host(session_id) OR (public.get_my_role() = 'coordenador'::text)));


--
-- Name: vanacamp_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanacamp_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: vanacamp_sessions vanacamp_sessions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanacamp_sessions_delete ON public.vanacamp_sessions FOR DELETE TO authenticated USING (((host_id = auth.uid()) OR (public.get_my_role() = 'coordenador'::text)));


--
-- Name: vanacamp_sessions vanacamp_sessions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanacamp_sessions_insert ON public.vanacamp_sessions FOR INSERT TO authenticated WITH CHECK (((host_id = auth.uid()) AND (public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text]))));


--
-- Name: vanacamp_sessions vanacamp_sessions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanacamp_sessions_select ON public.vanacamp_sessions FOR SELECT TO authenticated USING (true);


--
-- Name: vanacamp_sessions vanacamp_sessions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanacamp_sessions_update ON public.vanacamp_sessions FOR UPDATE TO authenticated USING (((host_id = auth.uid()) OR (public.get_my_role() = 'coordenador'::text)));


--
-- Name: vanacamp_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanacamp_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: vanacamp_votes vanacamp_votes_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanacamp_votes_insert_own ON public.vanacamp_votes FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.vanacamp_players p
  WHERE ((p.id = vanacamp_votes.voter_player_id) AND (p.user_id = auth.uid()) AND (p.is_alive = true)))));


--
-- Name: vanacamp_votes vanacamp_votes_select_all_in_session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanacamp_votes_select_all_in_session ON public.vanacamp_votes FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.vanacamp_players p
  WHERE ((p.session_id = vanacamp_votes.session_id) AND (p.user_id = auth.uid())))) OR public.vanacamp_is_host(session_id)));


--
-- Name: vanacoro_answer_rewards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanacoro_answer_rewards ENABLE ROW LEVEL SECURITY;

--
-- Name: vanacoro_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanacoro_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: vanacoro_board_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanacoro_board_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: vanacoro_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanacoro_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: vanacoro_players; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanacoro_players ENABLE ROW LEVEL SECURITY;

--
-- Name: vanacoro_players vanacoro_players_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanacoro_players_read ON public.vanacoro_players FOR SELECT USING (true);


--
-- Name: vanacoro_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanacoro_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: vanacoro_reveals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanacoro_reveals ENABLE ROW LEVEL SECURITY;

--
-- Name: vanacoro_roster; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanacoro_roster ENABLE ROW LEVEL SECURITY;

--
-- Name: vanacoro_round_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanacoro_round_events ENABLE ROW LEVEL SECURITY;

--
-- Name: vanacoro_rounds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanacoro_rounds ENABLE ROW LEVEL SECURITY;

--
-- Name: vanacoro_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanacoro_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: vanacoro_sessions vanacoro_sessions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanacoro_sessions_read ON public.vanacoro_sessions FOR SELECT USING (true);


--
-- Name: vanacoro_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanacoro_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: vanaespada_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanaespada_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: vanaespada_deck_rounds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanaespada_deck_rounds ENABLE ROW LEVEL SECURITY;

--
-- Name: vanaespada_deck_rounds vanaespada_deck_rounds_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanaespada_deck_rounds_admin_all ON public.vanaespada_deck_rounds TO authenticated USING ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text]))) WITH CHECK ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text])));


--
-- Name: vanaespada_decks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanaespada_decks ENABLE ROW LEVEL SECURITY;

--
-- Name: vanaespada_decks vanaespada_decks_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanaespada_decks_admin_all ON public.vanaespada_decks TO authenticated USING ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text]))) WITH CHECK ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text])));


--
-- Name: vanaespada_drill_prompts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanaespada_drill_prompts ENABLE ROW LEVEL SECURITY;

--
-- Name: vanaespada_drill_prompts vanaespada_drill_prompts_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanaespada_drill_prompts_admin_all ON public.vanaespada_drill_prompts TO authenticated USING ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text]))) WITH CHECK ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text])));


--
-- Name: vanaespada_players; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanaespada_players ENABLE ROW LEVEL SECURITY;

--
-- Name: vanaespada_players vanaespada_players_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanaespada_players_select ON public.vanaespada_players FOR SELECT TO anon, authenticated USING (true);


--
-- Name: vanaespada_session_rounds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanaespada_session_rounds ENABLE ROW LEVEL SECURITY;

--
-- Name: vanaespada_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanaespada_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: vanaespada_sessions vanaespada_sessions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanaespada_sessions_delete ON public.vanaespada_sessions FOR DELETE TO authenticated USING (((host_id = auth.uid()) OR (public.get_my_role() = 'coordenador'::text)));


--
-- Name: vanaespada_sessions vanaespada_sessions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanaespada_sessions_select ON public.vanaespada_sessions FOR SELECT TO anon, authenticated USING (true);


--
-- Name: vanaespada_verses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanaespada_verses ENABLE ROW LEVEL SECURITY;

--
-- Name: vanaespada_verses vanaespada_verses_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanaespada_verses_admin_all ON public.vanaespada_verses TO authenticated USING ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text]))) WITH CHECK ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text])));


--
-- Name: vanasketch_guesses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanasketch_guesses ENABLE ROW LEVEL SECURITY;

--
-- Name: vanasketch_pack_words; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanasketch_pack_words ENABLE ROW LEVEL SECURITY;

--
-- Name: vanasketch_packs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanasketch_packs ENABLE ROW LEVEL SECURITY;

--
-- Name: vanasketch_players; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanasketch_players ENABLE ROW LEVEL SECURITY;

--
-- Name: vanasketch_rounds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanasketch_rounds ENABLE ROW LEVEL SECURITY;

--
-- Name: vanasketch_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanasketch_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: vanasketch_strokes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanasketch_strokes ENABLE ROW LEVEL SECURITY;

--
-- Name: vanatrilha_daily_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanatrilha_daily_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: vanatrilha_station_progress vanatrilha_progress_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanatrilha_progress_select_own ON public.vanatrilha_station_progress FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: vanatrilha_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanatrilha_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: vanatrilha_questions vanatrilha_questions_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanatrilha_questions_select_admin ON public.vanatrilha_questions FOR SELECT TO authenticated USING ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text])));


--
-- Name: vanatrilha_questions vanatrilha_questions_write_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanatrilha_questions_write_admin ON public.vanatrilha_questions TO authenticated USING ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text]))) WITH CHECK ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text])));


--
-- Name: vanatrilha_daily_runs vanatrilha_runs_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vanatrilha_runs_select_own ON public.vanatrilha_daily_runs FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: vanatrilha_station_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanatrilha_station_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: vanawords_guesses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanawords_guesses ENABLE ROW LEVEL SECURITY;

--
-- Name: vanawords_players; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanawords_players ENABLE ROW LEVEL SECURITY;

--
-- Name: vanawords_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanawords_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: vanawords_turns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanawords_turns ENABLE ROW LEVEL SECURITY;

--
-- Name: vanawords_word_bank; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanawords_word_bank ENABLE ROW LEVEL SECURITY;

--
-- Name: vanawords_words; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vanawords_words ENABLE ROW LEVEL SECURITY;

--
-- Name: vantur_dictionary; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vantur_dictionary ENABLE ROW LEVEL SECURITY;

--
-- Name: vantur_dictionary vantur_dictionary_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vantur_dictionary_admin_all ON public.vantur_dictionary TO authenticated USING ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text]))) WITH CHECK ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text])));


--
-- Name: vantur_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vantur_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: vantur_sessions vantur_sessions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vantur_sessions_insert ON public.vantur_sessions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: vantur_sessions vantur_sessions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vantur_sessions_select ON public.vantur_sessions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: vantur_sessions vantur_sessions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vantur_sessions_update ON public.vantur_sessions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: vanasketch_guesses vs_guesses_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vs_guesses_read ON public.vanasketch_guesses FOR SELECT USING (true);


--
-- Name: vanasketch_pack_words vs_pack_words_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vs_pack_words_admin_all ON public.vanasketch_pack_words TO authenticated USING ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text]))) WITH CHECK ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text])));


--
-- Name: vanasketch_packs vs_packs_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vs_packs_admin_all ON public.vanasketch_packs TO authenticated USING ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text]))) WITH CHECK ((public.get_my_role() = ANY (ARRAY['dirigente'::text, 'coordenador'::text])));


--
-- Name: vanasketch_players vs_players_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vs_players_delete ON public.vanasketch_players FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.vanasketch_sessions s
  WHERE ((s.id = vanasketch_players.session_id) AND (s.host_id = auth.uid())))));


--
-- Name: vanasketch_players vs_players_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vs_players_insert ON public.vanasketch_players FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.vanasketch_sessions s
  WHERE ((s.id = vanasketch_players.session_id) AND (s.host_id = auth.uid()))))));


--
-- Name: vanasketch_players vs_players_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vs_players_read ON public.vanasketch_players FOR SELECT USING (true);


--
-- Name: vanasketch_players vs_players_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vs_players_update ON public.vanasketch_players FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.vanasketch_sessions s
  WHERE ((s.id = vanasketch_players.session_id) AND (s.host_id = auth.uid())))));


--
-- Name: vanasketch_rounds vs_rounds_host_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vs_rounds_host_read ON public.vanasketch_rounds FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.vanasketch_sessions s
  WHERE ((s.id = vanasketch_rounds.session_id) AND (s.host_id = auth.uid())))));


--
-- Name: vanasketch_sessions vs_sessions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vs_sessions_insert ON public.vanasketch_sessions FOR INSERT TO authenticated WITH CHECK ((host_id = auth.uid()));


--
-- Name: vanasketch_sessions vs_sessions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vs_sessions_read ON public.vanasketch_sessions FOR SELECT USING (true);


--
-- Name: vanasketch_sessions vs_sessions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vs_sessions_update ON public.vanasketch_sessions FOR UPDATE TO authenticated USING ((host_id = auth.uid()));


--
-- Name: vanasketch_strokes vs_strokes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vs_strokes_delete ON public.vanasketch_strokes FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public.vanasketch_sessions s
     JOIN public.vanasketch_players p ON ((p.id = s.drawer_player_id)))
  WHERE ((s.id = p.session_id) AND (p.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.vanasketch_sessions s
  WHERE ((s.id = vanasketch_strokes.session_id) AND (s.host_id = auth.uid()))))));


--
-- Name: vanasketch_strokes vs_strokes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vs_strokes_insert ON public.vanasketch_strokes FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM (public.vanasketch_sessions s
     JOIN public.vanasketch_players p ON ((p.id = s.drawer_player_id)))
  WHERE ((s.id = p.session_id) AND (s.status = 'playing'::text) AND (p.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.vanasketch_sessions s
  WHERE ((s.id = vanasketch_strokes.session_id) AND (s.host_id = auth.uid()))))));


--
-- Name: vanasketch_strokes vs_strokes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vs_strokes_read ON public.vanasketch_strokes FOR SELECT USING (true);


--
-- Name: vanawords_guesses vw_guesses_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_guesses_delete ON public.vanawords_guesses FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.vanawords_players p
  WHERE ((p.id = vanawords_guesses.player_id) AND (p.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.vanawords_sessions s
  WHERE ((s.id = vanawords_guesses.session_id) AND (s.host_id = auth.uid()))))));


--
-- Name: vanawords_guesses vw_guesses_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_guesses_insert ON public.vanawords_guesses FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.vanawords_players p
  WHERE ((p.id = vanawords_guesses.player_id) AND (p.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.vanawords_sessions s
  WHERE ((s.id = vanawords_guesses.session_id) AND (s.host_id = auth.uid()))))));


--
-- Name: vanawords_guesses vw_guesses_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_guesses_read ON public.vanawords_guesses FOR SELECT TO authenticated USING (true);


--
-- Name: vanawords_guesses vw_guesses_read_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_guesses_read_anon ON public.vanawords_guesses FOR SELECT TO anon USING (true);


--
-- Name: vanawords_players vw_players_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_players_delete ON public.vanawords_players FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.vanawords_sessions s
  WHERE ((s.id = vanawords_players.session_id) AND (s.host_id = auth.uid())))));


--
-- Name: vanawords_players vw_players_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_players_insert ON public.vanawords_players FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.vanawords_sessions s
  WHERE ((s.id = vanawords_players.session_id) AND (s.host_id = auth.uid()))))));


--
-- Name: vanawords_players vw_players_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_players_read ON public.vanawords_players FOR SELECT TO authenticated USING (true);


--
-- Name: vanawords_players vw_players_read_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_players_read_anon ON public.vanawords_players FOR SELECT TO anon USING (true);


--
-- Name: vanawords_players vw_players_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_players_update ON public.vanawords_players FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.vanawords_sessions s
  WHERE ((s.id = vanawords_players.session_id) AND (s.host_id = auth.uid())))));


--
-- Name: vanawords_sessions vw_sessions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_sessions_insert ON public.vanawords_sessions FOR INSERT TO authenticated WITH CHECK ((host_id = auth.uid()));


--
-- Name: vanawords_sessions vw_sessions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_sessions_read ON public.vanawords_sessions FOR SELECT TO authenticated USING (true);


--
-- Name: vanawords_sessions vw_sessions_read_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_sessions_read_anon ON public.vanawords_sessions FOR SELECT TO anon USING (true);


--
-- Name: vanawords_sessions vw_sessions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_sessions_update ON public.vanawords_sessions FOR UPDATE TO authenticated USING ((host_id = auth.uid()));


--
-- Name: vanawords_turns vw_turns_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_turns_insert ON public.vanawords_turns FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.vanawords_sessions s
  WHERE ((s.id = vanawords_turns.session_id) AND (s.host_id = auth.uid())))));


--
-- Name: vanawords_turns vw_turns_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_turns_read ON public.vanawords_turns FOR SELECT TO authenticated USING (true);


--
-- Name: vanawords_turns vw_turns_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_turns_update ON public.vanawords_turns FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.vanawords_sessions s
  WHERE ((s.id = vanawords_turns.session_id) AND (s.host_id = auth.uid())))));


--
-- Name: vanawords_word_bank vw_word_bank_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_word_bank_delete ON public.vanawords_word_bank FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['coordenador'::public.app_role, 'dirigente'::public.app_role]))))));


--
-- Name: vanawords_word_bank vw_word_bank_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_word_bank_insert ON public.vanawords_word_bank FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['coordenador'::public.app_role, 'dirigente'::public.app_role]))))));


--
-- Name: vanawords_word_bank vw_word_bank_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_word_bank_read ON public.vanawords_word_bank FOR SELECT TO authenticated USING (true);


--
-- Name: vanawords_words vw_words_host_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_words_host_insert ON public.vanawords_words FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.vanawords_sessions s
  WHERE ((s.id = vanawords_words.session_id) AND (s.host_id = auth.uid())))));


--
-- Name: vanawords_words vw_words_host_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_words_host_read ON public.vanawords_words FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.vanawords_sessions s
  WHERE ((s.id = vanawords_words.session_id) AND (s.host_id = auth.uid())))));


--
-- Name: vanawords_words vw_words_host_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vw_words_host_update ON public.vanawords_words FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.vanawords_sessions s
  WHERE ((s.id = vanawords_words.session_id) AND (s.host_id = auth.uid())))));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION apply_age_sections(p_member_ids uuid[], p_reset_investiture boolean, p_notify boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.apply_age_sections(p_member_ids uuid[], p_reset_investiture boolean, p_notify boolean) TO anon;
GRANT ALL ON FUNCTION public.apply_age_sections(p_member_ids uuid[], p_reset_investiture boolean, p_notify boolean) TO authenticated;
GRANT ALL ON FUNCTION public.apply_age_sections(p_member_ids uuid[], p_reset_investiture boolean, p_notify boolean) TO service_role;


--
-- Name: FUNCTION apply_points_multiplier(p_amount integer, p_multiplier numeric); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.apply_points_multiplier(p_amount integer, p_multiplier numeric) TO anon;
GRANT ALL ON FUNCTION public.apply_points_multiplier(p_amount integer, p_multiplier numeric) TO authenticated;
GRANT ALL ON FUNCTION public.apply_points_multiplier(p_amount integer, p_multiplier numeric) TO service_role;


--
-- Name: FUNCTION assign_helper(p_target_id uuid, p_helper_role text, p_helper_section text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.assign_helper(p_target_id uuid, p_helper_role text, p_helper_section text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.assign_helper(p_target_id uuid, p_helper_role text, p_helper_section text) TO authenticated;
GRANT ALL ON FUNCTION public.assign_helper(p_target_id uuid, p_helper_role text, p_helper_section text) TO service_role;


--
-- Name: FUNCTION audit_fix_totals(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.audit_fix_totals() FROM PUBLIC;
GRANT ALL ON FUNCTION public.audit_fix_totals() TO authenticated;
GRANT ALL ON FUNCTION public.audit_fix_totals() TO service_role;


--
-- Name: FUNCTION audit_points_mismatches(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.audit_points_mismatches() FROM PUBLIC;
GRANT ALL ON FUNCTION public.audit_points_mismatches() TO authenticated;
GRANT ALL ON FUNCTION public.audit_points_mismatches() TO service_role;


--
-- Name: FUNCTION audit_points_overview(p_from timestamp with time zone, p_to timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.audit_points_overview(p_from timestamp with time zone, p_to timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.audit_points_overview(p_from timestamp with time zone, p_to timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.audit_points_overview(p_from timestamp with time zone, p_to timestamp with time zone) TO service_role;


--
-- Name: FUNCTION award_question_answer_reward(p_question_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.award_question_answer_reward(p_question_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.award_question_answer_reward(p_question_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.award_question_answer_reward(p_question_id uuid) TO service_role;


--
-- Name: FUNCTION award_survey_response_points(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.award_survey_response_points() TO anon;
GRANT ALL ON FUNCTION public.award_survey_response_points() TO authenticated;
GRANT ALL ON FUNCTION public.award_survey_response_points() TO service_role;


--
-- Name: FUNCTION award_vana_codigo_rewards(p_user_id uuid, p_mode text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.award_vana_codigo_rewards(p_user_id uuid, p_mode text) TO anon;
GRANT ALL ON FUNCTION public.award_vana_codigo_rewards(p_user_id uuid, p_mode text) TO authenticated;
GRANT ALL ON FUNCTION public.award_vana_codigo_rewards(p_user_id uuid, p_mode text) TO service_role;


--
-- Name: FUNCTION award_vana_sentinela_rewards(p_score_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.award_vana_sentinela_rewards(p_score_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.award_vana_sentinela_rewards(p_score_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.award_vana_sentinela_rewards(p_score_id uuid) TO service_role;


--
-- Name: FUNCTION award_vanatrilha_daily_rewards(p_run_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.award_vanatrilha_daily_rewards(p_run_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.award_vanatrilha_daily_rewards(p_run_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.award_vanatrilha_daily_rewards(p_run_id uuid) TO service_role;


--
-- Name: FUNCTION award_vantur_rewards(user_id uuid, mode text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.award_vantur_rewards(user_id uuid, mode text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.award_vantur_rewards(user_id uuid, mode text) TO authenticated;
GRANT ALL ON FUNCTION public.award_vantur_rewards(user_id uuid, mode text) TO service_role;


--
-- Name: FUNCTION calculate_section(birth_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.calculate_section(birth_date date) TO anon;
GRANT ALL ON FUNCTION public.calculate_section(birth_date date) TO authenticated;
GRANT ALL ON FUNCTION public.calculate_section(birth_date date) TO service_role;


--
-- Name: FUNCTION can_manage_trip(p_event_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_manage_trip(p_event_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_manage_trip(p_event_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_manage_trip(p_event_id uuid) TO service_role;


--
-- Name: FUNCTION cancel_my_purchase(p_purchase_id uuid, p_cancel_token uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cancel_my_purchase(p_purchase_id uuid, p_cancel_token uuid) TO anon;
GRANT ALL ON FUNCTION public.cancel_my_purchase(p_purchase_id uuid, p_cancel_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_my_purchase(p_purchase_id uuid, p_cancel_token uuid) TO service_role;


--
-- Name: FUNCTION change_member_section(p_member_id uuid, p_section text, p_reset_investiture boolean, p_notify boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.change_member_section(p_member_id uuid, p_section text, p_reset_investiture boolean, p_notify boolean) TO anon;
GRANT ALL ON FUNCTION public.change_member_section(p_member_id uuid, p_section text, p_reset_investiture boolean, p_notify boolean) TO authenticated;
GRANT ALL ON FUNCTION public.change_member_section(p_member_id uuid, p_section text, p_reset_investiture boolean, p_notify boolean) TO service_role;


--
-- Name: FUNCTION check_qr_limit(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_qr_limit() TO anon;
GRANT ALL ON FUNCTION public.check_qr_limit() TO authenticated;
GRANT ALL ON FUNCTION public.check_qr_limit() TO service_role;


--
-- Name: FUNCTION cleanup_stale_event_guests(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cleanup_stale_event_guests() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cleanup_stale_event_guests() TO service_role;


--
-- Name: FUNCTION close_event_guests(p_event_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.close_event_guests(p_event_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.close_event_guests(p_event_id uuid) TO service_role;


--
-- Name: FUNCTION delete_empty_club_family(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_empty_club_family() FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_empty_club_family() TO service_role;


--
-- Name: FUNCTION delete_purchase_record(p_purchase_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_purchase_record(p_purchase_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_purchase_record(p_purchase_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_purchase_record(p_purchase_id uuid) TO service_role;


--
-- Name: FUNCTION dismiss_section_suggestion(p_member_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.dismiss_section_suggestion(p_member_id uuid) TO anon;
GRANT ALL ON FUNCTION public.dismiss_section_suggestion(p_member_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.dismiss_section_suggestion(p_member_id uuid) TO service_role;


--
-- Name: FUNCTION enforce_family_account_link_exclusive(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_family_account_link_exclusive() TO anon;
GRANT ALL ON FUNCTION public.enforce_family_account_link_exclusive() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_family_account_link_exclusive() TO service_role;


--
-- Name: FUNCTION events_close_guests_on_finish(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.events_close_guests_on_finish() TO anon;
GRANT ALL ON FUNCTION public.events_close_guests_on_finish() TO authenticated;
GRANT ALL ON FUNCTION public.events_close_guests_on_finish() TO service_role;


--
-- Name: FUNCTION fill_announcement_recipients(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fill_announcement_recipients() TO anon;
GRANT ALL ON FUNCTION public.fill_announcement_recipients() TO authenticated;
GRANT ALL ON FUNCTION public.fill_announcement_recipients() TO service_role;


--
-- Name: FUNCTION expire_unpaid_store_orders(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.expire_unpaid_store_orders() FROM PUBLIC;
GRANT ALL ON FUNCTION public.expire_unpaid_store_orders() TO service_role;


--
-- Name: FUNCTION finalize_survey(p_survey_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.finalize_survey(p_survey_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finalize_survey(p_survey_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.finalize_survey(p_survey_id uuid) TO service_role;


--
-- Name: FUNCTION game_points_multiplier(p_game_id text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.game_points_multiplier(p_game_id text) TO anon;
GRANT ALL ON FUNCTION public.game_points_multiplier(p_game_id text) TO authenticated;
GRANT ALL ON FUNCTION public.game_points_multiplier(p_game_id text) TO service_role;


--
-- Name: FUNCTION get_gold_rate_info(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_gold_rate_info() TO anon;
GRANT ALL ON FUNCTION public.get_gold_rate_info() TO authenticated;
GRANT ALL ON FUNCTION public.get_gold_rate_info() TO service_role;


--
-- Name: FUNCTION get_guest_purchases(p_tokens uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_guest_purchases(p_tokens uuid[]) TO anon;
GRANT ALL ON FUNCTION public.get_guest_purchases(p_tokens uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_guest_purchases(p_tokens uuid[]) TO service_role;


--
-- Name: FUNCTION get_leaderboard_at_date(target_date timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_leaderboard_at_date(target_date timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.get_leaderboard_at_date(target_date timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.get_leaderboard_at_date(target_date timestamp with time zone) TO service_role;


--
-- Name: FUNCTION get_my_leadership_section(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_my_leadership_section() TO anon;
GRANT ALL ON FUNCTION public.get_my_leadership_section() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_leadership_section() TO service_role;


--
-- Name: FUNCTION get_my_real_role(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_my_real_role() TO anon;
GRANT ALL ON FUNCTION public.get_my_real_role() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_real_role() TO service_role;


--
-- Name: FUNCTION get_my_role(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_my_role() TO anon;
GRANT ALL ON FUNCTION public.get_my_role() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_role() TO service_role;


--
-- Name: FUNCTION get_my_section(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_my_section() TO anon;
GRANT ALL ON FUNCTION public.get_my_section() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_section() TO service_role;


--
-- Name: FUNCTION get_my_trip_assignments(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_trip_assignments() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_trip_assignments() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_trip_assignments() TO service_role;


--
-- Name: FUNCTION get_profile_section(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_profile_section(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_profile_section(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_profile_section(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_random_general_words(count integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_random_general_words(count integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_random_general_words(count integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_random_general_words(count integer) TO service_role;


--
-- Name: FUNCTION get_random_vantur_words(count integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_random_vantur_words(count integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_random_vantur_words(count integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_random_vantur_words(count integer) TO service_role;


--
-- Name: FUNCTION get_survey_embed(p_survey_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_survey_embed(p_survey_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_survey_embed(p_survey_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_survey_embed(p_survey_id uuid) TO service_role;


--
-- Name: FUNCTION get_store_product_costs(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_store_product_costs() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_store_product_costs() TO authenticated;
GRANT ALL ON FUNCTION public.get_store_product_costs() TO service_role;


--
-- Name: FUNCTION get_vana_sentinela_ranking(p_pack text, p_period text, p_limit integer, p_guest_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_vana_sentinela_ranking(p_pack text, p_period text, p_limit integer, p_guest_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_vana_sentinela_ranking(p_pack text, p_period text, p_limit integer, p_guest_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_vana_sentinela_ranking(p_pack text, p_period text, p_limit integer, p_guest_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_vana_sentinela_ranking(p_pack text, p_period text, p_limit integer, p_guest_id uuid) TO service_role;


--
-- Name: FUNCTION get_vanaespada_host_answers(p_session_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_vanaespada_host_answers(p_session_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_vanaespada_host_answers(p_session_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_vanaespada_host_answers(p_session_id uuid) TO service_role;


--
-- Name: FUNCTION get_vanaespada_reveal(p_session_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_vanaespada_reveal(p_session_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_vanaespada_reveal(p_session_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_vanaespada_reveal(p_session_id uuid) TO service_role;


--
-- Name: FUNCTION get_vanaespada_round_public(p_session_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_vanaespada_round_public(p_session_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_vanaespada_round_public(p_session_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_vanaespada_round_public(p_session_id uuid) TO service_role;


--
-- Name: FUNCTION get_vanasketch_bot(p_session_id uuid, p_player_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_vanasketch_bot(p_session_id uuid, p_player_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_vanasketch_bot(p_session_id uuid, p_player_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_vanasketch_bot(p_session_id uuid, p_player_id uuid) TO service_role;


--
-- Name: FUNCTION get_vanasketch_drawer_info(p_session_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_vanasketch_drawer_info(p_session_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_vanasketch_drawer_info(p_session_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_vanasketch_drawer_info(p_session_id uuid) TO service_role;


--
-- Name: FUNCTION get_vanawords_bot(p_session_id uuid, p_player_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_vanawords_bot(p_session_id uuid, p_player_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_vanawords_bot(p_session_id uuid, p_player_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_vanawords_bot(p_session_id uuid, p_player_id uuid) TO service_role;


--
-- Name: FUNCTION get_vanawords_public(p_session_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_vanawords_public(p_session_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_vanawords_public(p_session_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_vanawords_public(p_session_id uuid) TO service_role;


--
-- Name: FUNCTION get_vanawords_with_teams(p_session_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_vanawords_with_teams(p_session_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_vanawords_with_teams(p_session_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_vanawords_with_teams(p_session_id uuid) TO service_role;


--
-- Name: FUNCTION handle_lifecycle_changes(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_lifecycle_changes() TO anon;
GRANT ALL ON FUNCTION public.handle_lifecycle_changes() TO authenticated;
GRANT ALL ON FUNCTION public.handle_lifecycle_changes() TO service_role;


--
-- Name: FUNCTION is_announcement_author(p_announcement_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_announcement_author(p_announcement_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_announcement_author(p_announcement_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_announcement_author(p_announcement_id uuid) TO service_role;


--
-- Name: FUNCTION is_announcement_recipient(p_announcement_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_announcement_recipient(p_announcement_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_announcement_recipient(p_announcement_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_announcement_recipient(p_announcement_id uuid) TO service_role;


--
-- Name: FUNCTION list_club_members_for_assignment(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.list_club_members_for_assignment() FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_club_members_for_assignment() TO authenticated;
GRANT ALL ON FUNCTION public.list_club_members_for_assignment() TO service_role;


--
-- Name: FUNCTION list_section_suggestions(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.list_section_suggestions() TO anon;
GRANT ALL ON FUNCTION public.list_section_suggestions() TO authenticated;
GRANT ALL ON FUNCTION public.list_section_suggestions() TO service_role;


--
-- Name: FUNCTION log_points_log_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_points_log_change() TO anon;
GRANT ALL ON FUNCTION public.log_points_log_change() TO authenticated;
GRANT ALL ON FUNCTION public.log_points_log_change() TO service_role;


--
-- Name: FUNCTION log_singleplayer_play(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_singleplayer_play() TO anon;
GRANT ALL ON FUNCTION public.log_singleplayer_play() TO authenticated;
GRANT ALL ON FUNCTION public.log_singleplayer_play() TO service_role;


--
-- Name: FUNCTION log_vana_sentinela_play(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_vana_sentinela_play() TO anon;
GRANT ALL ON FUNCTION public.log_vana_sentinela_play() TO authenticated;
GRANT ALL ON FUNCTION public.log_vana_sentinela_play() TO service_role;


--
-- Name: FUNCTION mark_announcements_read(p_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mark_announcements_read(p_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.mark_announcements_read(p_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.mark_announcements_read(p_ids uuid[]) TO service_role;


--
-- Name: FUNCTION mark_purchase_delivered(p_purchase_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_purchase_delivered(p_purchase_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_purchase_delivered(p_purchase_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mark_purchase_delivered(p_purchase_id uuid) TO service_role;


--
-- Name: FUNCTION mark_purchase_paid(p_purchase_id uuid, p_deliver boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_purchase_paid(p_purchase_id uuid, p_deliver boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_purchase_paid(p_purchase_id uuid, p_deliver boolean) TO authenticated;
GRANT ALL ON FUNCTION public.mark_purchase_paid(p_purchase_id uuid, p_deliver boolean) TO service_role;


--
-- Name: FUNCTION normalize_role_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.normalize_role_change() TO anon;
GRANT ALL ON FUNCTION public.normalize_role_change() TO authenticated;
GRANT ALL ON FUNCTION public.normalize_role_change() TO service_role;


--
-- Name: FUNCTION points_balances_from_log(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.points_balances_from_log() FROM PUBLIC;
GRANT ALL ON FUNCTION public.points_balances_from_log() TO service_role;


--
-- Name: FUNCTION points_multiplier_label(p_multiplier numeric); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.points_multiplier_label(p_multiplier numeric) TO anon;
GRANT ALL ON FUNCTION public.points_multiplier_label(p_multiplier numeric) TO authenticated;
GRANT ALL ON FUNCTION public.points_multiplier_label(p_multiplier numeric) TO service_role;


--
-- Name: FUNCTION preview_points_reset(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.preview_points_reset() TO anon;
GRANT ALL ON FUNCTION public.preview_points_reset() TO authenticated;
GRANT ALL ON FUNCTION public.preview_points_reset() TO service_role;


--
-- Name: FUNCTION process_purchase(p_product_id uuid, p_discount_eur numeric, p_buyer_name text, p_quantity integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.process_purchase(p_product_id uuid, p_discount_eur numeric, p_buyer_name text, p_quantity integer) TO anon;
GRANT ALL ON FUNCTION public.process_purchase(p_product_id uuid, p_discount_eur numeric, p_buyer_name text, p_quantity integer) TO authenticated;
GRANT ALL ON FUNCTION public.process_purchase(p_product_id uuid, p_discount_eur numeric, p_buyer_name text, p_quantity integer) TO service_role;


--
-- Name: FUNCTION protect_gender_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.protect_gender_column() TO anon;
GRANT ALL ON FUNCTION public.protect_gender_column() TO authenticated;
GRANT ALL ON FUNCTION public.protect_gender_column() TO service_role;


--
-- Name: FUNCTION protect_point_totals(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.protect_point_totals() TO anon;
GRANT ALL ON FUNCTION public.protect_point_totals() TO authenticated;
GRANT ALL ON FUNCTION public.protect_point_totals() TO service_role;


--
-- Name: FUNCTION protect_role_columns(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.protect_role_columns() TO anon;
GRANT ALL ON FUNCTION public.protect_role_columns() TO authenticated;
GRANT ALL ON FUNCTION public.protect_role_columns() TO service_role;


--
-- Name: FUNCTION record_event_invite(p_event_id uuid, p_user_id uuid, p_invited_by uuid, p_family boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_event_invite(p_event_id uuid, p_user_id uuid, p_invited_by uuid, p_family boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_event_invite(p_event_id uuid, p_user_id uuid, p_invited_by uuid, p_family boolean) TO service_role;


--
-- Name: FUNCTION refund_purchase(p_purchase_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refund_purchase(p_purchase_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.refund_purchase(p_purchase_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.refund_purchase(p_purchase_id uuid) TO service_role;


--
-- Name: FUNCTION reset_all_points(p_label text, p_reset_xp boolean, p_reset_gold boolean, p_confirm text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reset_all_points(p_label text, p_reset_xp boolean, p_reset_gold boolean, p_confirm text) TO anon;
GRANT ALL ON FUNCTION public.reset_all_points(p_label text, p_reset_xp boolean, p_reset_gold boolean, p_confirm text) TO authenticated;
GRANT ALL ON FUNCTION public.reset_all_points(p_label text, p_reset_xp boolean, p_reset_gold boolean, p_confirm text) TO service_role;


--
-- Name: FUNCTION resolve_announcement_recipients(p_target_user_id uuid, p_target_section text, p_target_role text, p_author_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.resolve_announcement_recipients(p_target_user_id uuid, p_target_section text, p_target_role text, p_author_id uuid) TO anon;
GRANT ALL ON FUNCTION public.resolve_announcement_recipients(p_target_user_id uuid, p_target_section text, p_target_role text, p_author_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_announcement_recipients(p_target_user_id uuid, p_target_section text, p_target_role text, p_author_id uuid) TO service_role;


--
-- Name: FUNCTION revert_event_points(p_event_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.revert_event_points(p_event_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revert_event_points(p_event_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.revert_event_points(p_event_id uuid) TO service_role;


--
-- Name: FUNCTION section_label(s text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.section_label(s text) TO anon;
GRANT ALL ON FUNCTION public.section_label(s text) TO authenticated;
GRANT ALL ON FUNCTION public.section_label(s text) TO service_role;


--
-- Name: FUNCTION section_rank(s text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.section_rank(s text) TO anon;
GRANT ALL ON FUNCTION public.section_rank(s text) TO authenticated;
GRANT ALL ON FUNCTION public.section_rank(s text) TO service_role;


--
-- Name: FUNCTION send_announcement(p_title text, p_message text, p_audience text, p_section text, p_member_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.send_announcement(p_title text, p_message text, p_audience text, p_section text, p_member_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.send_announcement(p_title text, p_message text, p_audience text, p_section text, p_member_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.send_announcement(p_title text, p_message text, p_audience text, p_section text, p_member_ids uuid[]) TO service_role;


--
-- Name: FUNCTION set_event_rsvp(p_event_id uuid, p_going boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_event_rsvp(p_event_id uuid, p_going boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_event_rsvp(p_event_id uuid, p_going boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_event_rsvp(p_event_id uuid, p_going boolean) TO service_role;


--
-- Name: FUNCTION set_event_rsvp_for_member(p_event_id uuid, p_user_id uuid, p_going boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_event_rsvp_for_member(p_event_id uuid, p_user_id uuid, p_going boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_event_rsvp_for_member(p_event_id uuid, p_user_id uuid, p_going boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_event_rsvp_for_member(p_event_id uuid, p_user_id uuid, p_going boolean) TO service_role;


--
-- Name: FUNCTION set_member_invested(p_member_id uuid, p_invested boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_member_invested(p_member_id uuid, p_invested boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_member_invested(p_member_id uuid, p_invested boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_member_invested(p_member_id uuid, p_invested boolean) TO service_role;


--
-- Name: FUNCTION store_volume_discount_percent(p_quantity integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.store_volume_discount_percent(p_quantity integer) TO anon;
GRANT ALL ON FUNCTION public.store_volume_discount_percent(p_quantity integer) TO authenticated;
GRANT ALL ON FUNCTION public.store_volume_discount_percent(p_quantity integer) TO service_role;


--
-- Name: FUNCTION transfer_gold(recipient_id uuid, amount integer, transfer_description text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.transfer_gold(recipient_id uuid, amount integer, transfer_description text) TO anon;
GRANT ALL ON FUNCTION public.transfer_gold(recipient_id uuid, amount integer, transfer_description text) TO authenticated;
GRANT ALL ON FUNCTION public.transfer_gold(recipient_id uuid, amount integer, transfer_description text) TO service_role;


--
-- Name: FUNCTION update_profile_totals(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_profile_totals() TO anon;
GRANT ALL ON FUNCTION public.update_profile_totals() TO authenticated;
GRANT ALL ON FUNCTION public.update_profile_totals() TO service_role;


--
-- Name: FUNCTION vana_codigo_day_start(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vana_codigo_day_start() TO anon;
GRANT ALL ON FUNCTION public.vana_codigo_day_start() TO authenticated;
GRANT ALL ON FUNCTION public.vana_codigo_day_start() TO service_role;


--
-- Name: FUNCTION vanacamp_check_bot_in_test_session(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vanacamp_check_bot_in_test_session() TO anon;
GRANT ALL ON FUNCTION public.vanacamp_check_bot_in_test_session() TO authenticated;
GRANT ALL ON FUNCTION public.vanacamp_check_bot_in_test_session() TO service_role;


--
-- Name: FUNCTION vanacamp_get_my_role(p_session_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vanacamp_get_my_role(p_session_id uuid) TO anon;
GRANT ALL ON FUNCTION public.vanacamp_get_my_role(p_session_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.vanacamp_get_my_role(p_session_id uuid) TO service_role;


--
-- Name: FUNCTION vanacamp_is_dead_player(p_session_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vanacamp_is_dead_player(p_session_id uuid) TO anon;
GRANT ALL ON FUNCTION public.vanacamp_is_dead_player(p_session_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.vanacamp_is_dead_player(p_session_id uuid) TO service_role;


--
-- Name: FUNCTION vanacamp_is_host(p_session_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vanacamp_is_host(p_session_id uuid) TO anon;
GRANT ALL ON FUNCTION public.vanacamp_is_host(p_session_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.vanacamp_is_host(p_session_id uuid) TO service_role;


--
-- Name: FUNCTION vanacamp_is_infiltrator(p_session_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vanacamp_is_infiltrator(p_session_id uuid) TO anon;
GRANT ALL ON FUNCTION public.vanacamp_is_infiltrator(p_session_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.vanacamp_is_infiltrator(p_session_id uuid) TO service_role;


--
-- Name: FUNCTION vanacoro_answers_limit(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vanacoro_answers_limit() TO anon;
GRANT ALL ON FUNCTION public.vanacoro_answers_limit() TO authenticated;
GRANT ALL ON FUNCTION public.vanacoro_answers_limit() TO service_role;


--
-- Name: FUNCTION vanacoro_apply_groups(p_question_id uuid, p_groups jsonb, p_replace boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.vanacoro_apply_groups(p_question_id uuid, p_groups jsonb, p_replace boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vanacoro_apply_groups(p_question_id uuid, p_groups jsonb, p_replace boolean) TO service_role;


--
-- Name: FUNCTION vanacoro_bump(p_session_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.vanacoro_bump(p_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vanacoro_bump(p_session_id uuid) TO service_role;


--
-- Name: FUNCTION vanacoro_freeze_board(p_question_id uuid, p_entries jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.vanacoro_freeze_board(p_question_id uuid, p_entries jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vanacoro_freeze_board(p_question_id uuid, p_entries jsonb) TO service_role;


--
-- Name: FUNCTION vanacoro_question_stats(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.vanacoro_question_stats() FROM PUBLIC;
GRANT ALL ON FUNCTION public.vanacoro_question_stats() TO service_role;


--
-- Name: FUNCTION vanacoro_save_round(p_session_id uuid, p_round_id uuid, p_last_event_id bigint, p_state jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.vanacoro_save_round(p_session_id uuid, p_round_id uuid, p_last_event_id bigint, p_state jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vanacoro_save_round(p_session_id uuid, p_round_id uuid, p_last_event_id bigint, p_state jsonb) TO service_role;


--
-- Name: FUNCTION vanacoro_unfreeze_board(p_question_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.vanacoro_unfreeze_board(p_question_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vanacoro_unfreeze_board(p_question_id uuid) TO service_role;


--
-- Name: FUNCTION vanaespada_begin_round(p_session_id uuid, p_round_index integer, p_force boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vanaespada_begin_round(p_session_id uuid, p_round_index integer, p_force boolean) TO anon;
GRANT ALL ON FUNCTION public.vanaespada_begin_round(p_session_id uuid, p_round_index integer, p_force boolean) TO authenticated;
GRANT ALL ON FUNCTION public.vanaespada_begin_round(p_session_id uuid, p_round_index integer, p_force boolean) TO service_role;


--
-- Name: FUNCTION vanaespada_close_round(p_session_id uuid, p_round_index integer, p_force boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vanaespada_close_round(p_session_id uuid, p_round_index integer, p_force boolean) TO anon;
GRANT ALL ON FUNCTION public.vanaespada_close_round(p_session_id uuid, p_round_index integer, p_force boolean) TO authenticated;
GRANT ALL ON FUNCTION public.vanaespada_close_round(p_session_id uuid, p_round_index integer, p_force boolean) TO service_role;


--
-- Name: FUNCTION vanaespada_finish_session(p_session_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vanaespada_finish_session(p_session_id uuid) TO anon;
GRANT ALL ON FUNCTION public.vanaespada_finish_session(p_session_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.vanaespada_finish_session(p_session_id uuid) TO service_role;


--
-- Name: FUNCTION vanaespada_open_round(p_session_id uuid, p_round_index integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vanaespada_open_round(p_session_id uuid, p_round_index integer) TO anon;
GRANT ALL ON FUNCTION public.vanaespada_open_round(p_session_id uuid, p_round_index integer) TO authenticated;
GRANT ALL ON FUNCTION public.vanaespada_open_round(p_session_id uuid, p_round_index integer) TO service_role;


--
-- Name: FUNCTION vanaespada_show_leaderboard(p_session_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vanaespada_show_leaderboard(p_session_id uuid) TO anon;
GRANT ALL ON FUNCTION public.vanaespada_show_leaderboard(p_session_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.vanaespada_show_leaderboard(p_session_id uuid) TO service_role;


--
-- Name: FUNCTION vanaespada_sync_answered(p_session_id uuid, p_round_index integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vanaespada_sync_answered(p_session_id uuid, p_round_index integer) TO anon;
GRANT ALL ON FUNCTION public.vanaespada_sync_answered(p_session_id uuid, p_round_index integer) TO authenticated;
GRANT ALL ON FUNCTION public.vanaespada_sync_answered(p_session_id uuid, p_round_index integer) TO service_role;


--
-- Name: FUNCTION vanasketch_add_score(p_player_id uuid, p_delta integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.vanasketch_add_score(p_player_id uuid, p_delta integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vanasketch_add_score(p_player_id uuid, p_delta integer) TO service_role;


--
-- Name: FUNCTION vanasketch_check_bot(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vanasketch_check_bot() TO anon;
GRANT ALL ON FUNCTION public.vanasketch_check_bot() TO authenticated;
GRANT ALL ON FUNCTION public.vanasketch_check_bot() TO service_role;


--
-- Name: TABLE vanatrilha_questions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanatrilha_questions TO anon;
GRANT ALL ON TABLE public.vanatrilha_questions TO authenticated;
GRANT ALL ON TABLE public.vanatrilha_questions TO service_role;


--
-- Name: FUNCTION vanatrilha_daily_questions(p_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.vanatrilha_daily_questions(p_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vanatrilha_daily_questions(p_date date) TO service_role;


--
-- Name: FUNCTION vanatrilha_station_of_day(p_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vanatrilha_station_of_day(p_date date) TO anon;
GRANT ALL ON FUNCTION public.vanatrilha_station_of_day(p_date date) TO authenticated;
GRANT ALL ON FUNCTION public.vanatrilha_station_of_day(p_date date) TO service_role;


--
-- Name: FUNCTION vanatrilha_touch_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vanatrilha_touch_updated_at() TO anon;
GRANT ALL ON FUNCTION public.vanatrilha_touch_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.vanatrilha_touch_updated_at() TO service_role;


--
-- Name: FUNCTION vanawords_check_bot(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vanawords_check_bot() TO anon;
GRANT ALL ON FUNCTION public.vanawords_check_bot() TO authenticated;
GRANT ALL ON FUNCTION public.vanawords_check_bot() TO service_role;


--
-- Name: TABLE announcement_recipients; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.announcement_recipients TO anon;
GRANT ALL ON TABLE public.announcement_recipients TO authenticated;
GRANT ALL ON TABLE public.announcement_recipients TO service_role;


--
-- Name: TABLE announcements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.announcements TO anon;
GRANT ALL ON TABLE public.announcements TO authenticated;
GRANT ALL ON TABLE public.announcements TO service_role;


--
-- Name: TABLE club_families; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.club_families TO anon;
GRANT ALL ON TABLE public.club_families TO authenticated;
GRANT ALL ON TABLE public.club_families TO service_role;


--
-- Name: TABLE club_family_invites; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.club_family_invites TO anon;
GRANT ALL ON TABLE public.club_family_invites TO authenticated;
GRANT ALL ON TABLE public.club_family_invites TO service_role;


--
-- Name: TABLE club_family_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.club_family_members TO anon;
GRANT ALL ON TABLE public.club_family_members TO authenticated;
GRANT ALL ON TABLE public.club_family_members TO service_role;


--
-- Name: TABLE club_screens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.club_screens TO anon;
GRANT ALL ON TABLE public.club_screens TO authenticated;
GRANT ALL ON TABLE public.club_screens TO service_role;


--
-- Name: TABLE digital_keys; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.digital_keys TO anon;
GRANT ALL ON TABLE public.digital_keys TO authenticated;
GRANT ALL ON TABLE public.digital_keys TO service_role;


--
-- Name: TABLE digital_key_stock; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.digital_key_stock TO anon;
GRANT ALL ON TABLE public.digital_key_stock TO authenticated;
GRANT ALL ON TABLE public.digital_key_stock TO service_role;


--
-- Name: TABLE email_opt_outs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_opt_outs TO anon;
GRANT ALL ON TABLE public.email_opt_outs TO authenticated;
GRANT ALL ON TABLE public.email_opt_outs TO service_role;


--
-- Name: TABLE event_attendance; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_attendance TO anon;
GRANT ALL ON TABLE public.event_attendance TO authenticated;
GRANT ALL ON TABLE public.event_attendance TO service_role;


--
-- Name: TABLE event_guests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_guests TO anon;
GRANT ALL ON TABLE public.event_guests TO authenticated;
GRANT ALL ON TABLE public.event_guests TO service_role;


--
-- Name: TABLE event_invites; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_invites TO anon;
GRANT ALL ON TABLE public.event_invites TO authenticated;
GRANT ALL ON TABLE public.event_invites TO service_role;


--
-- Name: TABLE event_rsvps; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_rsvps TO anon;
GRANT ALL ON TABLE public.event_rsvps TO authenticated;
GRANT ALL ON TABLE public.event_rsvps TO service_role;


--
-- Name: TABLE events; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.events TO anon;
GRANT ALL ON TABLE public.events TO authenticated;
GRANT ALL ON TABLE public.events TO service_role;


--
-- Name: COLUMN events.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.title; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(title) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.description; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(description) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.location; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(location) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.start_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(start_at) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.end_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(end_at) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.target_section; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(target_section) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.xp_reward; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(xp_reward) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.gold_reward; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(gold_reward) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.late_discount_percent; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(late_discount_percent) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.absent_penalty_percent; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(absent_penalty_percent) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.created_by; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_by) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.is_finished; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(is_finished) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(updated_at) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.rsvp_enabled; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(rsvp_enabled) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.rsvp_deadline; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(rsvp_deadline) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.location_lat; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(location_lat) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.location_lng; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(location_lng) ON TABLE public.events TO anon;


--
-- Name: COLUMN events.is_online; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(is_online) ON TABLE public.events TO anon;


--
-- Name: TABLE family_account_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.family_account_links TO anon;
GRANT ALL ON TABLE public.family_account_links TO authenticated;
GRANT ALL ON TABLE public.family_account_links TO service_role;


--
-- Name: TABLE family_account_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.family_account_requests TO anon;
GRANT ALL ON TABLE public.family_account_requests TO authenticated;
GRANT ALL ON TABLE public.family_account_requests TO service_role;


--
-- Name: TABLE game_plays; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.game_plays TO anon;
GRANT ALL ON TABLE public.game_plays TO authenticated;
GRANT ALL ON TABLE public.game_plays TO service_role;


--
-- Name: TABLE game_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.game_settings TO anon;
GRANT ALL ON TABLE public.game_settings TO authenticated;
GRANT ALL ON TABLE public.game_settings TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE leaderboard; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.leaderboard TO anon;
GRANT ALL ON TABLE public.leaderboard TO authenticated;
GRANT ALL ON TABLE public.leaderboard TO service_role;


--
-- Name: TABLE points_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.points_log TO anon;
GRANT ALL ON TABLE public.points_log TO authenticated;
GRANT ALL ON TABLE public.points_log TO service_role;


--
-- Name: TABLE points_audit; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.points_audit TO anon;
GRANT ALL ON TABLE public.points_audit TO authenticated;
GRANT ALL ON TABLE public.points_audit TO service_role;


--
-- Name: TABLE points_audit_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.points_audit_events TO anon;
GRANT ALL ON TABLE public.points_audit_events TO authenticated;
GRANT ALL ON TABLE public.points_audit_events TO service_role;


--
-- Name: TABLE points_season_standings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.points_season_standings TO anon;
GRANT ALL ON TABLE public.points_season_standings TO authenticated;
GRANT ALL ON TABLE public.points_season_standings TO service_role;


--
-- Name: TABLE points_seasons; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.points_seasons TO anon;
GRANT ALL ON TABLE public.points_seasons TO authenticated;
GRANT ALL ON TABLE public.points_seasons TO service_role;


--
-- Name: TABLE portuguese_words; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.portuguese_words TO anon;
GRANT ALL ON TABLE public.portuguese_words TO authenticated;
GRANT ALL ON TABLE public.portuguese_words TO service_role;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_subscriptions TO anon;
GRANT ALL ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;


--
-- Name: TABLE qr_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.qr_codes TO anon;
GRANT ALL ON TABLE public.qr_codes TO authenticated;
GRANT ALL ON TABLE public.qr_codes TO service_role;


--
-- Name: TABLE qr_scans; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.qr_scans TO anon;
GRANT ALL ON TABLE public.qr_scans TO authenticated;
GRANT ALL ON TABLE public.qr_scans TO service_role;


--
-- Name: TABLE raffle_screens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.raffle_screens TO anon;
GRANT ALL ON TABLE public.raffle_screens TO authenticated;
GRANT ALL ON TABLE public.raffle_screens TO service_role;


--
-- Name: TABLE section_changes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.section_changes TO anon;
GRANT ALL ON TABLE public.section_changes TO authenticated;
GRANT ALL ON TABLE public.section_changes TO service_role;


--
-- Name: TABLE store_products; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.store_products TO anon;
GRANT ALL ON TABLE public.store_products TO authenticated;
GRANT ALL ON TABLE public.store_products TO service_role;
-- cost_price escondido do browser: SELECT só coluna a coluna (em baixo).
REVOKE SELECT ON TABLE public.store_products FROM anon, authenticated;


--
-- Name: COLUMN store_products.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.store_products TO anon;
GRANT SELECT(id) ON TABLE public.store_products TO authenticated;


--
-- Name: COLUMN store_products.name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(name) ON TABLE public.store_products TO anon;
GRANT SELECT(name) ON TABLE public.store_products TO authenticated;


--
-- Name: COLUMN store_products.description; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(description) ON TABLE public.store_products TO anon;
GRANT SELECT(description) ON TABLE public.store_products TO authenticated;


--
-- Name: COLUMN store_products.price; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(price) ON TABLE public.store_products TO anon;
GRANT SELECT(price) ON TABLE public.store_products TO authenticated;


--
-- Name: COLUMN store_products.type; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(type) ON TABLE public.store_products TO anon;
GRANT SELECT(type) ON TABLE public.store_products TO authenticated;


--
-- Name: COLUMN store_products.stock; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(stock) ON TABLE public.store_products TO anon;
GRANT SELECT(stock) ON TABLE public.store_products TO authenticated;


--
-- Name: COLUMN store_products.image_url; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(image_url) ON TABLE public.store_products TO anon;
GRANT SELECT(image_url) ON TABLE public.store_products TO authenticated;


--
-- Name: COLUMN store_products.restrictions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(restrictions) ON TABLE public.store_products TO anon;
GRANT SELECT(restrictions) ON TABLE public.store_products TO authenticated;


--
-- Name: COLUMN store_products.is_active; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(is_active) ON TABLE public.store_products TO anon;
GRANT SELECT(is_active) ON TABLE public.store_products TO authenticated;


--
-- Name: COLUMN store_products.min_level; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(min_level) ON TABLE public.store_products TO anon;
GRANT SELECT(min_level) ON TABLE public.store_products TO authenticated;


--
-- Name: COLUMN store_products.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.store_products TO anon;
GRANT SELECT(created_at) ON TABLE public.store_products TO authenticated;


--
-- Name: COLUMN store_products.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(updated_at) ON TABLE public.store_products TO anon;
GRANT SELECT(updated_at) ON TABLE public.store_products TO authenticated;


--
-- Name: COLUMN store_products.price_eur; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(price_eur) ON TABLE public.store_products TO anon;
GRANT SELECT(price_eur) ON TABLE public.store_products TO authenticated;


--
-- Name: COLUMN store_products.max_discount_percent; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(max_discount_percent) ON TABLE public.store_products TO anon;
GRANT SELECT(max_discount_percent) ON TABLE public.store_products TO authenticated;


--
-- Name: COLUMN store_products.is_preorder; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(is_preorder) ON TABLE public.store_products TO anon;
GRANT SELECT(is_preorder) ON TABLE public.store_products TO authenticated;


--
-- Name: COLUMN store_products.preorder_deadline; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(preorder_deadline) ON TABLE public.store_products TO anon;
GRANT SELECT(preorder_deadline) ON TABLE public.store_products TO authenticated;


--
-- Name: TABLE store_purchases; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.store_purchases TO anon;
GRANT ALL ON TABLE public.store_purchases TO authenticated;
GRANT ALL ON TABLE public.store_purchases TO service_role;


--
-- Name: TABLE store_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.store_settings TO anon;
GRANT ALL ON TABLE public.store_settings TO authenticated;
GRANT ALL ON TABLE public.store_settings TO service_role;


--
-- Name: TABLE suggestions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.suggestions TO anon;
GRANT ALL ON TABLE public.suggestions TO authenticated;
GRANT ALL ON TABLE public.suggestions TO service_role;


--
-- Name: TABLE survey_options; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.survey_options TO anon;
GRANT ALL ON TABLE public.survey_options TO authenticated;
GRANT ALL ON TABLE public.survey_options TO service_role;


--
-- Name: TABLE survey_responses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.survey_responses TO anon;
GRANT ALL ON TABLE public.survey_responses TO authenticated;
GRANT ALL ON TABLE public.survey_responses TO service_role;


--
-- Name: TABLE surveys; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.surveys TO anon;
GRANT ALL ON TABLE public.surveys TO authenticated;
GRANT ALL ON TABLE public.surveys TO service_role;


--
-- Name: TABLE task_completions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.task_completions TO anon;
GRANT ALL ON TABLE public.task_completions TO authenticated;
GRANT ALL ON TABLE public.task_completions TO service_role;


--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tasks TO anon;
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;


--
-- Name: TABLE team_screens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.team_screens TO anon;
GRANT ALL ON TABLE public.team_screens TO authenticated;
GRANT ALL ON TABLE public.team_screens TO service_role;


--
-- Name: TABLE timer_screens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.timer_screens TO anon;
GRANT ALL ON TABLE public.timer_screens TO authenticated;
GRANT ALL ON TABLE public.timer_screens TO service_role;


--
-- Name: TABLE trip_plans; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trip_plans TO anon;
GRANT ALL ON TABLE public.trip_plans TO authenticated;
GRANT ALL ON TABLE public.trip_plans TO service_role;


--
-- Name: TABLE vana_codigo_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vana_codigo_sessions TO anon;
GRANT ALL ON TABLE public.vana_codigo_sessions TO authenticated;
GRANT ALL ON TABLE public.vana_codigo_sessions TO service_role;


--
-- Name: TABLE vana_quest_answers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vana_quest_answers TO anon;
GRANT ALL ON TABLE public.vana_quest_answers TO authenticated;
GRANT ALL ON TABLE public.vana_quest_answers TO service_role;


--
-- Name: TABLE vana_quest_participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vana_quest_participants TO anon;
GRANT ALL ON TABLE public.vana_quest_participants TO authenticated;
GRANT ALL ON TABLE public.vana_quest_participants TO service_role;


--
-- Name: TABLE vana_quest_questions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vana_quest_questions TO anon;
GRANT ALL ON TABLE public.vana_quest_questions TO authenticated;
GRANT ALL ON TABLE public.vana_quest_questions TO service_role;


--
-- Name: TABLE vana_quest_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vana_quest_sessions TO anon;
GRANT ALL ON TABLE public.vana_quest_sessions TO authenticated;
GRANT ALL ON TABLE public.vana_quest_sessions TO service_role;


--
-- Name: TABLE vana_quests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vana_quests TO anon;
GRANT ALL ON TABLE public.vana_quests TO authenticated;
GRANT ALL ON TABLE public.vana_quests TO service_role;


--
-- Name: TABLE vana_sentinela_scores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vana_sentinela_scores TO anon;
GRANT ALL ON TABLE public.vana_sentinela_scores TO authenticated;
GRANT ALL ON TABLE public.vana_sentinela_scores TO service_role;


--
-- Name: TABLE vanacamp_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacamp_events TO anon;
GRANT ALL ON TABLE public.vanacamp_events TO authenticated;
GRANT ALL ON TABLE public.vanacamp_events TO service_role;


--
-- Name: TABLE vanacamp_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacamp_messages TO anon;
GRANT ALL ON TABLE public.vanacamp_messages TO authenticated;
GRANT ALL ON TABLE public.vanacamp_messages TO service_role;


--
-- Name: TABLE vanacamp_night_actions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacamp_night_actions TO anon;
GRANT ALL ON TABLE public.vanacamp_night_actions TO authenticated;
GRANT ALL ON TABLE public.vanacamp_night_actions TO service_role;


--
-- Name: TABLE vanacamp_players; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacamp_players TO anon;
GRANT ALL ON TABLE public.vanacamp_players TO authenticated;
GRANT ALL ON TABLE public.vanacamp_players TO service_role;


--
-- Name: TABLE vanacamp_players_public; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacamp_players_public TO anon;
GRANT ALL ON TABLE public.vanacamp_players_public TO authenticated;
GRANT ALL ON TABLE public.vanacamp_players_public TO service_role;


--
-- Name: TABLE vanacamp_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacamp_sessions TO anon;
GRANT ALL ON TABLE public.vanacamp_sessions TO authenticated;
GRANT ALL ON TABLE public.vanacamp_sessions TO service_role;


--
-- Name: TABLE vanacamp_votes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacamp_votes TO anon;
GRANT ALL ON TABLE public.vanacamp_votes TO authenticated;
GRANT ALL ON TABLE public.vanacamp_votes TO service_role;


--
-- Name: TABLE vanacoro_answer_rewards; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacoro_answer_rewards TO service_role;


--
-- Name: TABLE vanacoro_answers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacoro_answers TO service_role;


--
-- Name: TABLE vanacoro_board_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacoro_board_entries TO service_role;


--
-- Name: TABLE vanacoro_groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacoro_groups TO service_role;


--
-- Name: TABLE vanacoro_players; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacoro_players TO service_role;
GRANT SELECT ON TABLE public.vanacoro_players TO anon;
GRANT SELECT ON TABLE public.vanacoro_players TO authenticated;


--
-- Name: TABLE vanacoro_questions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacoro_questions TO service_role;


--
-- Name: TABLE vanacoro_reveals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacoro_reveals TO service_role;


--
-- Name: TABLE vanacoro_roster; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacoro_roster TO anon;
GRANT ALL ON TABLE public.vanacoro_roster TO authenticated;
GRANT ALL ON TABLE public.vanacoro_roster TO service_role;


--
-- Name: TABLE vanacoro_round_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacoro_round_events TO service_role;


--
-- Name: SEQUENCE vanacoro_round_events_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.vanacoro_round_events_id_seq TO anon;
GRANT ALL ON SEQUENCE public.vanacoro_round_events_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.vanacoro_round_events_id_seq TO service_role;


--
-- Name: TABLE vanacoro_rounds; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacoro_rounds TO service_role;


--
-- Name: TABLE vanacoro_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacoro_sessions TO service_role;
GRANT SELECT ON TABLE public.vanacoro_sessions TO anon;
GRANT SELECT ON TABLE public.vanacoro_sessions TO authenticated;


--
-- Name: TABLE vanacoro_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanacoro_settings TO service_role;


--
-- Name: TABLE vanaespada_answers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanaespada_answers TO anon;
GRANT ALL ON TABLE public.vanaespada_answers TO authenticated;
GRANT ALL ON TABLE public.vanaespada_answers TO service_role;


--
-- Name: TABLE vanaespada_deck_rounds; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanaespada_deck_rounds TO anon;
GRANT ALL ON TABLE public.vanaespada_deck_rounds TO authenticated;
GRANT ALL ON TABLE public.vanaespada_deck_rounds TO service_role;


--
-- Name: TABLE vanaespada_decks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanaespada_decks TO anon;
GRANT ALL ON TABLE public.vanaespada_decks TO authenticated;
GRANT ALL ON TABLE public.vanaespada_decks TO service_role;


--
-- Name: TABLE vanaespada_drill_prompts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanaespada_drill_prompts TO anon;
GRANT ALL ON TABLE public.vanaespada_drill_prompts TO authenticated;
GRANT ALL ON TABLE public.vanaespada_drill_prompts TO service_role;


--
-- Name: TABLE vanaespada_players; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanaespada_players TO anon;
GRANT ALL ON TABLE public.vanaespada_players TO authenticated;
GRANT ALL ON TABLE public.vanaespada_players TO service_role;


--
-- Name: TABLE vanaespada_session_rounds; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanaespada_session_rounds TO anon;
GRANT ALL ON TABLE public.vanaespada_session_rounds TO authenticated;
GRANT ALL ON TABLE public.vanaespada_session_rounds TO service_role;


--
-- Name: TABLE vanaespada_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanaespada_sessions TO anon;
GRANT ALL ON TABLE public.vanaespada_sessions TO authenticated;
GRANT ALL ON TABLE public.vanaespada_sessions TO service_role;


--
-- Name: TABLE vanaespada_verses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanaespada_verses TO anon;
GRANT ALL ON TABLE public.vanaespada_verses TO authenticated;
GRANT ALL ON TABLE public.vanaespada_verses TO service_role;


--
-- Name: TABLE vanasketch_guesses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanasketch_guesses TO anon;
GRANT ALL ON TABLE public.vanasketch_guesses TO authenticated;
GRANT ALL ON TABLE public.vanasketch_guesses TO service_role;


--
-- Name: TABLE vanasketch_pack_words; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanasketch_pack_words TO anon;
GRANT ALL ON TABLE public.vanasketch_pack_words TO authenticated;
GRANT ALL ON TABLE public.vanasketch_pack_words TO service_role;


--
-- Name: TABLE vanasketch_packs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanasketch_packs TO anon;
GRANT ALL ON TABLE public.vanasketch_packs TO authenticated;
GRANT ALL ON TABLE public.vanasketch_packs TO service_role;


--
-- Name: TABLE vanasketch_players; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanasketch_players TO anon;
GRANT ALL ON TABLE public.vanasketch_players TO authenticated;
GRANT ALL ON TABLE public.vanasketch_players TO service_role;


--
-- Name: TABLE vanasketch_rounds; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanasketch_rounds TO anon;
GRANT ALL ON TABLE public.vanasketch_rounds TO authenticated;
GRANT ALL ON TABLE public.vanasketch_rounds TO service_role;


--
-- Name: TABLE vanasketch_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanasketch_sessions TO anon;
GRANT ALL ON TABLE public.vanasketch_sessions TO authenticated;
GRANT ALL ON TABLE public.vanasketch_sessions TO service_role;


--
-- Name: TABLE vanasketch_strokes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanasketch_strokes TO anon;
GRANT ALL ON TABLE public.vanasketch_strokes TO authenticated;
GRANT ALL ON TABLE public.vanasketch_strokes TO service_role;


--
-- Name: TABLE vanatrilha_daily_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanatrilha_daily_runs TO anon;
GRANT ALL ON TABLE public.vanatrilha_daily_runs TO authenticated;
GRANT ALL ON TABLE public.vanatrilha_daily_runs TO service_role;


--
-- Name: TABLE vanatrilha_station_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanatrilha_station_progress TO anon;
GRANT ALL ON TABLE public.vanatrilha_station_progress TO authenticated;
GRANT ALL ON TABLE public.vanatrilha_station_progress TO service_role;


--
-- Name: TABLE vanawords_guesses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanawords_guesses TO anon;
GRANT ALL ON TABLE public.vanawords_guesses TO authenticated;
GRANT ALL ON TABLE public.vanawords_guesses TO service_role;


--
-- Name: TABLE vanawords_players; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanawords_players TO anon;
GRANT ALL ON TABLE public.vanawords_players TO authenticated;
GRANT ALL ON TABLE public.vanawords_players TO service_role;


--
-- Name: TABLE vanawords_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanawords_sessions TO anon;
GRANT ALL ON TABLE public.vanawords_sessions TO authenticated;
GRANT ALL ON TABLE public.vanawords_sessions TO service_role;


--
-- Name: TABLE vanawords_turns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanawords_turns TO anon;
GRANT ALL ON TABLE public.vanawords_turns TO authenticated;
GRANT ALL ON TABLE public.vanawords_turns TO service_role;


--
-- Name: TABLE vanawords_word_bank; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanawords_word_bank TO anon;
GRANT ALL ON TABLE public.vanawords_word_bank TO authenticated;
GRANT ALL ON TABLE public.vanawords_word_bank TO service_role;


--
-- Name: TABLE vanawords_words; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vanawords_words TO anon;
GRANT ALL ON TABLE public.vanawords_words TO authenticated;
GRANT ALL ON TABLE public.vanawords_words TO service_role;


--
-- Name: TABLE vantur_dictionary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vantur_dictionary TO anon;
GRANT ALL ON TABLE public.vantur_dictionary TO authenticated;
GRANT ALL ON TABLE public.vantur_dictionary TO service_role;


--
-- Name: TABLE vantur_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vantur_sessions TO anon;
GRANT ALL ON TABLE public.vantur_sessions TO authenticated;
GRANT ALL ON TABLE public.vantur_sessions TO service_role;


--
-- Cofre (supabase-migration-cofre.sql, 2026-11-04): referência das compras,
-- movimentos do dinheiro do clube, vista cofre_em_mao e funções da Loja com o Cofre.
-- Fica depois do dump porque redefine funções da Loja (process_purchase,
-- mark_purchase_paid, refund_purchase, get_guest_purchases). O bucket dos
-- comprovativos está na secção 3.
--

-- ============================================================================
-- 1. TIPOS
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('numerario', 'mbway', 'transferencia');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cash_movement_kind AS ENUM
    ('venda', 'reembolso', 'entrada_outra', 'despesa', 'estorno', 'abertura');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. STORE_PURCHASES: como foi pago, quem recebeu, referência
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS public.store_payment_ref_seq;
REVOKE ALL ON SEQUENCE public.store_payment_ref_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON SEQUENCE public.store_payment_ref_seq TO service_role;

ALTER TABLE public.store_purchases
  ADD COLUMN IF NOT EXISTS payment_method public.payment_method,
  ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_ref text;

-- Referências das compras que já existem, por ordem de criação (DA-0001, ...).
-- A sequência nunca anda para trás: uma referência de uma encomenda apagada
-- não volta a ser usada.
DO $$
DECLARE
  v_max integer;
  v_last bigint;
  v_called boolean;
BEGIN
  SELECT last_value, is_called INTO v_last, v_called FROM public.store_payment_ref_seq;

  SELECT GREATEST(
           COALESCE(max(substring(payment_ref FROM 4)::integer), 0),
           CASE WHEN v_called THEN v_last ELSE 0 END
         )
    INTO v_max
  FROM public.store_purchases
  WHERE payment_ref ~ '^DA-[0-9]+$';

  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM public.store_purchases
    WHERE payment_ref IS NULL
  )
  UPDATE public.store_purchases sp
  SET payment_ref = 'DA-' || lpad((v_max + o.rn)::text, 4, '0')
  FROM ordered o
  WHERE sp.id = o.id;

  SELECT COALESCE(max(substring(payment_ref FROM 4)::integer), 0) INTO v_max
  FROM public.store_purchases
  WHERE payment_ref ~ '^DA-[0-9]+$';

  IF v_max > 0 AND (NOT v_called OR v_last < v_max) THEN
    PERFORM setval('public.store_payment_ref_seq', v_max, true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.store_purchase_set_payment_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.payment_ref IS NULL THEN
    NEW.payment_ref := 'DA-' || lpad(nextval('public.store_payment_ref_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.store_purchase_set_payment_ref() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_purchase_set_payment_ref() TO service_role;

DROP TRIGGER IF EXISTS store_purchases_payment_ref ON public.store_purchases;
CREATE TRIGGER store_purchases_payment_ref
  BEFORE INSERT ON public.store_purchases
  FOR EACH ROW EXECUTE FUNCTION public.store_purchase_set_payment_ref();

ALTER TABLE public.store_purchases ALTER COLUMN payment_ref SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_purchases_payment_ref_key') THEN
    ALTER TABLE public.store_purchases ADD CONSTRAINT store_purchases_payment_ref_key UNIQUE (payment_ref);
  END IF;
END $$;

-- ============================================================================
-- 3. CLUB_CASH_MOVEMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.club_cash_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  occurred_on   date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Lisbon')::date,
  kind          public.cash_movement_kind NOT NULL,
  amount_eur    numeric(10,2) NOT NULL CHECK (amount_eur > 0),
  method        public.payment_method NOT NULL,
  -- Coordenador que tem o dinheiro (em numerário ou na sua conta pessoal).
  holder_id     uuid NOT NULL REFERENCES public.profiles(id),
  -- Se a compra for apagada (ex.: o membro apagou a conta), o movimento fica;
  -- a descrição já tem a referência, o artigo e o comprador.
  purchase_id   uuid REFERENCES public.store_purchases(id) ON DELETE SET NULL,
  description   text NOT NULL CHECK (length(btrim(description)) > 0),
  receipt_path  text,                                -- bucket privado cofre-comprovativos
  created_by    uuid NOT NULL REFERENCES public.profiles(id),
  reverses_id   uuid UNIQUE REFERENCES public.club_cash_movements(id),

  CONSTRAINT cofre_estorno_check CHECK ((kind = 'estorno') = (reverses_id IS NOT NULL)),
  CONSTRAINT cofre_purchase_kind_check CHECK (purchase_id IS NULL OR kind IN ('venda', 'reembolso', 'estorno'))
);
CREATE INDEX IF NOT EXISTS club_cash_movements_holder_idx   ON public.club_cash_movements(holder_id);
CREATE INDEX IF NOT EXISTS club_cash_movements_purchase_idx ON public.club_cash_movements(purchase_id);
CREATE INDEX IF NOT EXISTS club_cash_movements_occurred_idx ON public.club_cash_movements(occurred_on);

-- Nada se apaga e nada se edita. A única alteração aceite é a ligação à compra
-- cair para NULL quando a compra é apagada (ON DELETE SET NULL).
-- Aplica-se também às funções SECURITY DEFINER: é essa a ideia.
CREATE OR REPLACE FUNCTION public.cofre_movements_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Os movimentos do Cofre não se apagam. Faz um estorno.';
  END IF;
  IF OLD.purchase_id IS NOT NULL AND NEW.purchase_id IS NULL
     AND (to_jsonb(NEW) - 'purchase_id') = (to_jsonb(OLD) - 'purchase_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Os movimentos do Cofre não se editam. Faz um estorno.';
END;
$$;
REVOKE ALL ON FUNCTION public.cofre_movements_immutable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cofre_movements_immutable() TO service_role;

DROP TRIGGER IF EXISTS cofre_movements_immutable ON public.club_cash_movements;
CREATE TRIGGER cofre_movements_immutable
  BEFORE UPDATE OR DELETE ON public.club_cash_movements
  FOR EACH ROW EXECUTE FUNCTION public.cofre_movements_immutable();

-- RLS: só leitura, só coordenação real. Escrita SÓ pelas funções.
ALTER TABLE public.club_cash_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cofre: coordenação real lê" ON public.club_cash_movements;
CREATE POLICY "Cofre: coordenação real lê" ON public.club_cash_movements
  FOR SELECT USING (public.get_my_real_role() = 'coordenador');
REVOKE ALL ON public.club_cash_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.club_cash_movements TO authenticated;
GRANT ALL ON public.club_cash_movements TO service_role;

-- ============================================================================
-- 4. "EM MÃO"
-- ============================================================================
-- Sinal de cada movimento no "em mão" de quem tem o dinheiro. Um estorno tem o
-- sinal contrário do movimento que anula.
CREATE OR REPLACE FUNCTION public.cofre_sign(
  p_kind public.cash_movement_kind,
  p_reversed_kind public.cash_movement_kind DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN p_kind = 'estorno' THEN -1 ELSE 1 END
       * CASE CASE WHEN p_kind = 'estorno' THEN p_reversed_kind ELSE p_kind END
           WHEN 'venda' THEN 1
           WHEN 'entrada_outra' THEN 1
           WHEN 'abertura' THEN 1
           WHEN 'reembolso' THEN -1
           WHEN 'despesa' THEN -1
           ELSE 0
         END;
$$;
REVOKE ALL ON FUNCTION public.cofre_sign(public.cash_movement_kind, public.cash_movement_kind) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cofre_sign(public.cash_movement_kind, public.cash_movement_kind) TO authenticated, service_role;

-- Uma linha por coordenador com movimentos. security_invoker: herda a RLS da tabela.
DROP VIEW IF EXISTS public.cofre_em_mao;
CREATE VIEW public.cofre_em_mao WITH (security_invoker = true) AS
SELECT
  m.holder_id,
  p.full_name,
  p.avatar_url,
  COALESCE(sum(s.signed_eur), 0)::numeric(10,2) AS em_mao_eur,
  COALESCE(sum(s.signed_eur) FILTER (WHERE m.method = 'numerario'), 0)::numeric(10,2) AS em_numerario_eur,
  COALESCE(sum(s.signed_eur) FILTER (WHERE m.method IS DISTINCT FROM 'numerario'), 0)::numeric(10,2) AS na_conta_eur,
  max(m.created_at) AS ultimo_movimento
FROM public.club_cash_movements m
LEFT JOIN public.club_cash_movements o ON o.id = m.reverses_id
CROSS JOIN LATERAL (SELECT public.cofre_sign(m.kind, o.kind) * m.amount_eur AS signed_eur) s
LEFT JOIN public.profiles p ON p.id = m.holder_id
GROUP BY m.holder_id, p.full_name, p.avatar_url;

REVOKE ALL ON public.cofre_em_mao FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cofre_em_mao TO authenticated;
GRANT ALL ON public.cofre_em_mao TO service_role;

-- Saldo de um coordenador (p_method: NULL = tudo; 'numerario' = só numerário).
-- Uso interno das funções abaixo (que já verificaram a permissão).
CREATE OR REPLACE FUNCTION public.cofre_balance(p_holder_id uuid, p_method public.payment_method DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(sum(public.cofre_sign(m.kind, o.kind) * m.amount_eur), 0)
  FROM public.club_cash_movements m
  LEFT JOIN public.club_cash_movements o ON o.id = m.reverses_id
  WHERE m.holder_id = p_holder_id
    AND (p_method IS NULL OR m.method = p_method);
$$;
REVOKE ALL ON FUNCTION public.cofre_balance(uuid, public.payment_method) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cofre_balance(uuid, public.payment_method) TO service_role;

-- Texto de uma compra nos movimentos: "DA-0427 · Pin do clube ×2 · Ana Silva"
CREATE OR REPLACE FUNCTION public.cofre_purchase_label(p_purchase_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT sp.payment_ref || ' · ' || COALESCE(p.name, 'Artigo')
         || CASE WHEN COALESCE(sp.quantity, 1) > 1 THEN ' ×' || sp.quantity ELSE '' END
         || ' · ' || COALESCE(pr.full_name, sp.buyer_name, 'Comprador')
  FROM public.store_purchases sp
  LEFT JOIN public.store_products p ON p.id = sp.product_id
  LEFT JOIN public.profiles pr ON pr.id = sp.user_id
  WHERE sp.id = p_purchase_id;
$$;
REVOKE ALL ON FUNCTION public.cofre_purchase_label(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cofre_purchase_label(uuid) TO service_role;

-- O dinheiro do clube só fica com coordenadores reais.
CREATE OR REPLACE FUNCTION public.cofre_assert_holder(p_holder_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_holder_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_holder_id AND role = 'coordenador'
  ) THEN
    RAISE EXCEPTION 'Quem tem o dinheiro tem de ser um coordenador.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.cofre_assert_holder(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cofre_assert_holder(uuid) TO service_role;

-- ============================================================================
-- 5. LOJA
-- ============================================================================

-- 5.1 Compra: igual à versão das correções de segurança, mas devolve também a
--     referência (payment_ref), que o comprador vê no fim da compra.
CREATE OR REPLACE FUNCTION public.process_purchase(
  p_product_id uuid,
  p_discount_eur numeric DEFAULT 0,
  p_buyer_name text DEFAULT NULL,
  p_quantity integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_product record;
  v_user_gold integer := 0;
  v_user_xp integer := 0;
  v_rate integer;
  v_discount numeric := COALESCE(round(p_discount_eur, 2), 0);
  v_max_discount numeric;
  v_gold_cost integer := 0;
  v_amount_due numeric;
  v_paid boolean;
  v_key_id uuid;
  v_key_value text;
  v_status public.purchase_status;
  v_purchase_id uuid;
  v_cancel_token uuid;
  v_payment_ref text;
  v_buyer_name text := NULLIF(trim(COALESCE(p_buyer_name, '')), '');
  v_qty integer := COALESCE(p_quantity, 1);
  v_total numeric;
  v_cost_total numeric;
  v_volume_pct numeric := 0;
  v_volume_eur numeric := 0;
  v_after_volume numeric;
  v_unpaid integer;
  v_guest_limit integer;
  v_due_text text;
BEGIN
  -- 1. Produto
  SELECT id, name, price_eur, max_discount_percent, type, stock, min_level,
         is_preorder, preorder_deadline, cost_price
  INTO v_product
  FROM public.store_products
  WHERE id = p_product_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado ou inativo.';
  END IF;

  -- Quantidade: 1 a 10 unidades por encomenda; digitais sempre 1 (uma chave por compra).
  IF v_qty < 1 OR v_qty > 10 THEN
    RAISE EXCEPTION 'Quantidade inválida (1 a 10 unidades por encomenda).';
  END IF;
  IF v_product.type = 'digital' AND v_qty <> 1 THEN
    RAISE EXCEPTION 'Artigos digitais compram-se um de cada vez.';
  END IF;
  v_total := round(v_product.price_eur * v_qty, 2);

  -- Desconto por quantidade: só físicos com custo definido, e nunca abaixo do custo.
  IF v_product.cost_price IS NOT NULL THEN
    v_cost_total := round(v_product.cost_price * v_qty, 2);
    IF v_product.type <> 'digital' THEN
      v_volume_pct := public.store_volume_discount_percent(v_qty);
      v_volume_eur := LEAST(round(v_total * v_volume_pct / 100.0, 2), GREATEST(0, v_total - v_cost_total));
      IF v_volume_eur <= 0 THEN
        v_volume_eur := 0;
        v_volume_pct := 0;
      END IF;
    END IF;
  END IF;
  v_after_volume := v_total - v_volume_eur;

  -- 2. Comprador
  IF v_user_id IS NULL THEN
    -- Convidado: precisa de nome, não tem Gold, e artigos com nível mínimo
    -- (mesmo Nível 1) são exclusivos de membros registados.
    IF v_buyer_name IS NULL THEN
      RAISE EXCEPTION 'Indica o teu nome para comprar sem conta.';
    END IF;
    IF v_discount > 0 THEN
      RAISE EXCEPTION 'Apenas membros registados podem usar Gold como desconto.';
    END IF;
    IF COALESCE(v_product.min_level, 0) > 0 THEN
      RAISE EXCEPTION 'Este artigo é exclusivo para membros de Nível %+. Regista-te e participa!', v_product.min_level;
    END IF;
  ELSE
    SELECT current_gold, total_xp INTO v_user_gold, v_user_xp
    FROM public.profiles WHERE id = v_user_id;

    -- Membros começam no Nível 1 (floor(XP/1000)+1); min_level 1 = "só membros".
    IF COALESCE(v_product.min_level, 0) > 0 AND (floor(v_user_xp / 1000) + 1) < v_product.min_level THEN
      RAISE EXCEPTION 'Nível insuficiente. Precisas de Nível %!', v_product.min_level;
    END IF;

    -- 3. Desconto em Gold (taxa dinâmica do momento)
    IF v_discount < 0 THEN
      RAISE EXCEPTION 'Desconto inválido.';
    END IF;

    -- Teto: % máxima sobre o preço base, e só o que sobra acima do custo.
    v_max_discount := round(v_total * v_product.max_discount_percent / 100.0, 2);
    IF v_cost_total IS NOT NULL THEN
      v_max_discount := LEAST(v_max_discount, GREATEST(0, v_after_volume - v_cost_total));
    END IF;
    IF v_discount > v_max_discount THEN
      RAISE EXCEPTION 'O desconto máximo deste artigo é % €.', v_max_discount;
    END IF;

    IF v_discount > 0 THEN
      v_rate := (public.get_gold_rate_info()->>'gold_per_euro')::integer;
      v_gold_cost := CEIL(v_discount * v_rate)::integer;

      IF v_user_gold < v_gold_cost THEN
        RAISE EXCEPTION 'Gold insuficiente. Este desconto custa % 🪙 e tens % 🪙.', v_gold_cost, v_user_gold;
      END IF;
    END IF;
  END IF;

  v_amount_due := round(v_after_volume - v_discount, 2);
  v_paid := v_amount_due <= 0;

  -- 4. Limite de encomendas por pagar (contra encomendas falsas que esgotam a loja).
  --    O lock evita que dois pedidos ao mesmo tempo passem os dois a contagem.
  IF NOT v_paid THEN
    IF v_user_id IS NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext('store_unpaid:guests'));
      SELECT COALESCE((SELECT max_guest_unpaid_orders FROM public.store_settings WHERE id = true), 10)
        INTO v_guest_limit;
      SELECT count(*) INTO v_unpaid
      FROM public.store_purchases
      WHERE user_id IS NULL AND status = 'pending' AND paid_at IS NULL;
      IF v_unpaid >= v_guest_limit THEN
        RAISE EXCEPTION 'Há muitas encomendas por pagar. Fala com a coordenação.';
      END IF;
    ELSE
      PERFORM pg_advisory_xact_lock(hashtext('store_unpaid:' || v_user_id::text));
      SELECT count(*) INTO v_unpaid
      FROM public.store_purchases
      WHERE user_id = v_user_id AND status = 'pending' AND paid_at IS NULL;
      IF v_unpaid >= 3 THEN
        RAISE EXCEPTION 'Já tens 3 encomendas por pagar. Paga ou cancela uma antes de fazeres outra.';
      END IF;
    END IF;
  END IF;

  -- 5. Disponibilidade
  IF v_product.is_preorder THEN
    -- Por encomenda: sem stock, só conta o prazo.
    IF v_product.preorder_deadline IS NOT NULL AND now() > v_product.preorder_deadline THEN
      RAISE EXCEPTION 'As reservas deste artigo já fecharam.';
    END IF;

  ELSIF v_product.type = 'physical' THEN
    UPDATE public.store_products SET stock = stock - v_qty
    WHERE id = p_product_id AND stock >= v_qty;
    IF NOT FOUND THEN
      IF v_product.stock <= 0 THEN
        RAISE EXCEPTION 'Produto esgotado.';
      END IF;
      RAISE EXCEPTION 'Só restam % unidades deste artigo.', v_product.stock;
    END IF;

  ELSIF v_product.type = 'digital' THEN
    IF v_paid THEN
      -- Paga já (toda com Gold): a chave é entregue agora.
      SELECT id, key_value INTO v_key_id, v_key_value
      FROM public.digital_keys
      WHERE product_id = p_product_id AND is_used = false
      LIMIT 1
      FOR UPDATE SKIP LOCKED;

      IF v_key_id IS NULL THEN
        RAISE EXCEPTION 'Não existem chaves digitais disponíveis para este produto.';
      END IF;

      UPDATE public.digital_keys SET is_used = true WHERE id = v_key_id;
    ELSE
      -- Por pagar: não se reserva chave nenhuma (seria legível antes de pagar).
      -- A chave é atribuída em mark_purchase_paid, quando o pagamento é confirmado.
      IF NOT EXISTS (
        SELECT 1 FROM public.digital_keys
        WHERE product_id = p_product_id AND is_used = false
      ) THEN
        RAISE EXCEPTION 'Não existem chaves digitais disponíveis para este produto.';
      END IF;
    END IF;
  END IF;

  -- 6. Débito do Gold do desconto
  IF v_gold_cost > 0 THEN
    INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
    VALUES (v_user_id, v_user_id, 0, -v_gold_cost, 'Desconto na Loja: ' || v_product.name);
  END IF;

  -- 7. Registo da compra
  -- Digital já pago fica entregue de imediato; tudo o resto aguarda pagamento/entrega.
  v_status := CASE WHEN v_paid AND v_product.type = 'digital'
                   THEN 'delivered'::public.purchase_status
                   ELSE 'pending'::public.purchase_status END;

  INSERT INTO public.store_purchases (
    user_id, buyer_name, product_id, status, digital_key_delivered,
    price_eur, discount_eur, amount_due_eur, gold_spent, gold_rate,
    paid_at, delivered_at, quantity, volume_discount_percent, volume_discount_eur
  )
  VALUES (
    v_user_id, v_buyer_name, p_product_id, v_status, v_key_value,
    v_product.price_eur, v_discount, v_amount_due, v_gold_cost, v_rate,
    CASE WHEN v_paid THEN now() END,
    CASE WHEN v_status = 'delivered' THEN now() END,
    v_qty, v_volume_pct, v_volume_eur
  )
  RETURNING id, cancel_token, payment_ref INTO v_purchase_id, v_cancel_token, v_payment_ref;

  v_due_text := to_char(v_amount_due, 'FM999990.00') || ' €';

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'payment_ref', v_payment_ref,
    -- Só o convidado precisa do token (o membro cancela pela conta).
    'cancel_token', CASE WHEN v_user_id IS NULL THEN v_cancel_token END,
    'amount_due_eur', v_amount_due,
    'discount_eur', v_discount,
    'volume_discount_percent', v_volume_pct,
    'volume_discount_eur', v_volume_eur,
    'gold_spent', v_gold_cost,
    'paid', v_paid,
    'quantity', v_qty,
    'preorder', v_product.is_preorder,
    'digital_key', CASE WHEN v_paid THEN v_key_value END,
    'message', CASE
      WHEN v_product.is_preorder AND NOT v_paid
        THEN 'Reserva registada! Paga ' || v_due_text || ' em dinheiro a um coordenador do clube. Levantas o artigo quando chegar.'
      WHEN v_product.is_preorder
        THEN 'Reserva paga com Gold! Levantas o artigo quando chegar.'
      WHEN NOT v_paid AND v_product.type = 'digital'
        THEN 'Pedido registado! Paga ' || v_due_text || ' em dinheiro a um coordenador do clube para receberes a chave.'
      WHEN NOT v_paid
        THEN 'Pedido registado! Paga ' || v_due_text || ' em dinheiro a um coordenador do clube para levantares o artigo.'
      WHEN v_product.type = 'digital'
        THEN 'Compra concluída!'
      ELSE 'Pago com Gold! Levanta o artigo com um coordenador do clube.'
    END
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5.2 Encomendas dos convidados: com a referência.
CREATE OR REPLACE FUNCTION public.get_guest_purchases(p_tokens uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', sp.id,
    'cancel_token', sp.cancel_token,
    'status', sp.status,
    'paid_at', sp.paid_at,
    'created_at', sp.created_at,
    'quantity', sp.quantity,
    'amount_due_eur', sp.amount_due_eur,
    'buyer_name', sp.buyer_name,
    'payment_ref', sp.payment_ref,
    'product_name', p.name,
    'product_type', p.type,
    'is_preorder', p.is_preorder
  ) ORDER BY sp.created_at DESC), '[]'::jsonb)
  FROM public.store_purchases sp
  LEFT JOIN public.store_products p ON p.id = sp.product_id
  WHERE sp.user_id IS NULL
    AND sp.cancel_token = ANY(COALESCE(p_tokens[1:20], '{}'));
$$;

-- 5.3 Confirmar pagamento: como foi pago e quem recebeu. Cria a "venda" no Cofre.
--     Assinatura nova: apaga-se a antiga primeiro (senão o PostgREST fica com
--     duas funções e o rpc() dá erro de ambiguidade).
DROP FUNCTION IF EXISTS public.mark_purchase_paid(uuid, boolean);
CREATE OR REPLACE FUNCTION public.mark_purchase_paid(
  p_purchase_id uuid,
  p_deliver boolean DEFAULT false,
  p_method public.payment_method DEFAULT 'numerario',
  p_received_by uuid DEFAULT NULL      -- NULL = quem está a confirmar
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purchase record;
  v_type public.product_type;
  v_key_id uuid;
  v_key_value text;
  v_receiver uuid := COALESCE(p_received_by, auth.uid());
  v_method public.payment_method := COALESCE(p_method, 'numerario');
  v_first_payment boolean;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão para confirmar pagamentos.';
  END IF;

  SELECT * INTO v_purchase FROM public.store_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;
  IF v_purchase.status = 'refunded' THEN
    RAISE EXCEPTION 'Esta compra foi reembolsada.';
  END IF;

  v_first_payment := v_purchase.paid_at IS NULL;
  IF v_first_payment AND COALESCE(v_purchase.amount_due_eur, 0) > 0 THEN
    PERFORM public.cofre_assert_holder(v_receiver);
  END IF;

  SELECT type INTO v_type FROM public.store_products WHERE id = v_purchase.product_id;

  -- Digital: a chave só sai do stock quando o pagamento é confirmado.
  IF v_type = 'digital' AND v_purchase.digital_key_delivered IS NULL THEN
    SELECT id, key_value INTO v_key_id, v_key_value
    FROM public.digital_keys
    WHERE product_id = v_purchase.product_id AND is_used = false
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_key_id IS NULL THEN
      RAISE EXCEPTION 'Já não há chaves digitais para este artigo. Junta chaves ao produto antes de confirmar o pagamento.';
    END IF;

    UPDATE public.digital_keys SET is_used = true WHERE id = v_key_id;
  END IF;

  UPDATE public.store_purchases
  SET paid_at = COALESCE(paid_at, now()),
      payment_method = CASE WHEN v_first_payment AND COALESCE(amount_due_eur, 0) > 0 THEN v_method ELSE payment_method END,
      received_by = CASE WHEN v_first_payment AND COALESCE(amount_due_eur, 0) > 0 THEN v_receiver ELSE received_by END,
      digital_key_delivered = COALESCE(digital_key_delivered, v_key_value),
      -- digital pago = entregue (a chave fica disponível); físico só se p_deliver
      status = CASE WHEN p_deliver OR v_type = 'digital' THEN 'delivered'::public.purchase_status ELSE status END,
      delivered_at = CASE WHEN p_deliver OR v_type = 'digital' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
      updated_at = now()
  WHERE id = p_purchase_id;

  -- Idempotente: só o primeiro pagamento entra no Cofre.
  IF v_first_payment AND COALESCE(v_purchase.amount_due_eur, 0) > 0 THEN
    INSERT INTO public.club_cash_movements (kind, amount_eur, method, holder_id, purchase_id, description, created_by)
    VALUES ('venda', v_purchase.amount_due_eur, v_method, v_receiver, p_purchase_id,
            public.cofre_purchase_label(p_purchase_id), auth.uid());
  END IF;
END;
$$;

-- 5.4 Encomendas pagas ANTES do Cofre: dizer quem recebeu o dinheiro.
--     p_still_held = true  → o dinheiro ainda está com essa pessoa: entra no
--                            "em mão" dela (venda com a data do pagamento).
--     p_still_held = false → já foi entregue ou gasto: fica só o registo de
--                            quem recebeu, sem movimento no Cofre.
CREATE OR REPLACE FUNCTION public.set_purchase_receiver(
  p_purchase_id uuid,
  p_received_by uuid,
  p_method public.payment_method DEFAULT 'numerario',
  p_still_held boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purchase record;
  v_method public.payment_method := COALESCE(p_method, 'numerario');
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;

  SELECT * INTO v_purchase FROM public.store_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;
  IF v_purchase.status = 'refunded' THEN
    RAISE EXCEPTION 'Esta compra foi reembolsada.';
  END IF;
  IF v_purchase.paid_at IS NULL THEN
    RAISE EXCEPTION 'Esta compra ainda não foi paga. Usa o botão "Pago".';
  END IF;
  IF COALESCE(v_purchase.amount_due_eur, 0) <= 0 THEN
    RAISE EXCEPTION 'Esta compra foi paga com Gold: não houve dinheiro.';
  END IF;
  IF v_purchase.received_by IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.club_cash_movements WHERE purchase_id = p_purchase_id AND kind = 'venda') THEN
    RAISE EXCEPTION 'Já está registado quem recebeu esta compra. Usa "Corrigir".';
  END IF;

  PERFORM public.cofre_assert_holder(p_received_by);

  UPDATE public.store_purchases
  SET payment_method = v_method, received_by = p_received_by, updated_at = now()
  WHERE id = p_purchase_id;

  IF COALESCE(p_still_held, true) THEN
    INSERT INTO public.club_cash_movements (kind, amount_eur, method, holder_id, purchase_id, occurred_on, description, created_by)
    VALUES ('venda', v_purchase.amount_due_eur, v_method, p_received_by, p_purchase_id,
            (v_purchase.paid_at AT TIME ZONE 'Europe/Lisbon')::date,
            public.cofre_purchase_label(p_purchase_id) || ' (pago antes do Cofre)', auth.uid());
  END IF;
END;
$$;

-- 5.5 Corrigir quem recebeu / como foi pago (engano ao marcar como pago).
--     Estorna a venda antiga e cria a certa. Sem venda no Cofre (paga antes do
--     Cofre e já entregue), só corrige o registo da compra.
CREATE OR REPLACE FUNCTION public.correct_purchase_payment(
  p_purchase_id uuid,
  p_received_by uuid,
  p_method public.payment_method,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purchase record;
  v_sale record;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Diz porque estás a corrigir.';
  END IF;
  IF p_method IS NULL THEN
    RAISE EXCEPTION 'Diz como foi pago.';
  END IF;

  SELECT * INTO v_purchase FROM public.store_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;
  IF v_purchase.status = 'refunded' THEN
    RAISE EXCEPTION 'Esta compra foi reembolsada.';
  END IF;
  IF v_purchase.paid_at IS NULL OR COALESCE(v_purchase.amount_due_eur, 0) <= 0 THEN
    RAISE EXCEPTION 'Esta compra não teve pagamento em dinheiro.';
  END IF;

  PERFORM public.cofre_assert_holder(p_received_by);

  -- Venda ativa (não estornada) desta compra
  SELECT m.* INTO v_sale
  FROM public.club_cash_movements m
  WHERE m.purchase_id = p_purchase_id AND m.kind = 'venda'
    AND NOT EXISTS (SELECT 1 FROM public.club_cash_movements r WHERE r.reverses_id = m.id)
  ORDER BY m.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_sale.holder_id = p_received_by AND v_sale.method = p_method THEN
      RAISE EXCEPTION 'Não há nada para corrigir.';
    END IF;

    INSERT INTO public.club_cash_movements (kind, amount_eur, method, holder_id, purchase_id, occurred_on, description, created_by, reverses_id)
    VALUES ('estorno', v_sale.amount_eur, v_sale.method, v_sale.holder_id, p_purchase_id, v_sale.occurred_on,
            'Estorno: ' || v_reason, auth.uid(), v_sale.id);

    INSERT INTO public.club_cash_movements (kind, amount_eur, method, holder_id, purchase_id, occurred_on, description, created_by)
    VALUES ('venda', v_sale.amount_eur, p_method, p_received_by, p_purchase_id, v_sale.occurred_on,
            public.cofre_purchase_label(p_purchase_id) || ' (corrigido: ' || v_reason || ')', auth.uid());
  ELSIF v_purchase.received_by IS NULL THEN
    RAISE EXCEPTION 'Ainda não está registado quem recebeu. Usa "Quem recebeu?".';
  END IF;

  UPDATE public.store_purchases
  SET payment_method = p_method, received_by = p_received_by, updated_at = now()
  WHERE id = p_purchase_id;
END;
$$;

-- 5.6 Reembolso / cancelamento pela coordenação. Numa compra paga, o dinheiro
--     sai do "em mão" de quem devolve (em numerário ou da sua conta).
DROP FUNCTION IF EXISTS public.refund_purchase(uuid);
CREATE OR REPLACE FUNCTION public.refund_purchase(
  p_purchase_id uuid,
  p_method public.payment_method DEFAULT 'numerario'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purchase record;
  v_product_name text;
  v_type public.product_type;
  v_is_preorder boolean;
  v_method public.payment_method := COALESCE(p_method, 'numerario');
  v_balance numeric;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Apenas coordenadores podem realizar reembolsos.';
  END IF;

  SELECT * INTO v_purchase FROM public.store_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;
  IF v_purchase.status = 'refunded' THEN
    RAISE EXCEPTION 'Esta compra já foi reembolsada.';
  END IF;

  SELECT name, type, is_preorder INTO v_product_name, v_type, v_is_preorder
  FROM public.store_products WHERE id = v_purchase.product_id;

  -- 0. Dinheiro devolvido: sai do "em mão" de quem devolve.
  IF v_purchase.paid_at IS NOT NULL AND COALESCE(v_purchase.amount_due_eur, 0) > 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('cofre:' || auth.uid()::text));
    v_balance := public.cofre_balance(auth.uid());
    IF v_balance < v_purchase.amount_due_eur THEN
      RAISE EXCEPTION 'Não tens esse dinheiro em mão no Cofre (tens % €). Pede a quem recebeu para fazer o reembolso.',
        to_char(v_balance, 'FM999990.00');
    END IF;

    INSERT INTO public.club_cash_movements (kind, amount_eur, method, holder_id, purchase_id, description, created_by)
    VALUES ('reembolso', v_purchase.amount_due_eur, v_method, auth.uid(), p_purchase_id,
            public.cofre_purchase_label(p_purchase_id), auth.uid());
  END IF;

  -- 1. Devolver o Gold gasto no desconto (só membros registados)
  IF v_purchase.gold_spent > 0 AND v_purchase.user_id IS NOT NULL THEN
    INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
    VALUES (v_purchase.user_id, auth.uid(), 0, v_purchase.gold_spent, 'Reembolso de compra: ' || v_product_name);
  END IF;

  -- 2. Marcar como reembolsada
  UPDATE public.store_purchases
  SET status = 'refunded', updated_at = now()
  WHERE id = p_purchase_id;

  -- 3. Devolver stock (todas as unidades) se for físico com stock (não por encomenda)
  IF v_type = 'physical' AND NOT COALESCE(v_is_preorder, false) THEN
    UPDATE public.store_products SET stock = stock + COALESCE(v_purchase.quantity, 1) WHERE id = v_purchase.product_id;
  END IF;

  -- Nota: não "des-usamos" chaves digitais porque podem já ter sido vistas.
END;
$$;

-- ============================================================================
-- 6. MOVIMENTOS MANUAIS
-- ============================================================================

-- Despesa, outra entrada (quotas, donativos, rifas…) ou abertura (o dinheiro do
-- clube que cada coordenador já tem quando o Cofre arranca; uma por pessoa).
CREATE OR REPLACE FUNCTION public.cofre_register(
  p_kind public.cash_movement_kind,
  p_amount numeric,
  p_method public.payment_method,
  p_description text,
  p_holder_id uuid DEFAULT NULL,       -- NULL = quem regista
  p_occurred_on date DEFAULT NULL,     -- NULL = hoje
  p_receipt_path text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_holder uuid := COALESCE(p_holder_id, auth.uid());
  v_amount numeric := round(p_amount, 2);
  v_today date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_on date := COALESCE(p_occurred_on, (now() AT TIME ZONE 'Europe/Lisbon')::date);
  v_desc text := NULLIF(btrim(COALESCE(p_description, '')), '');
  v_receipt text := NULLIF(btrim(COALESCE(p_receipt_path, '')), '');
  v_balance numeric;
  v_id uuid;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('entrada_outra', 'despesa', 'abertura') THEN
    RAISE EXCEPTION 'Tipo de movimento inválido.';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount > 100000 THEN
    RAISE EXCEPTION 'Valor inválido.';
  END IF;
  IF p_method IS NULL THEN
    RAISE EXCEPTION 'Diz se é em numerário ou na conta.';
  END IF;
  IF v_desc IS NULL THEN
    RAISE EXCEPTION 'Escreve uma descrição.';
  END IF;
  IF length(v_desc) > 300 THEN
    RAISE EXCEPTION 'A descrição é demasiado longa (máximo 300 caracteres).';
  END IF;
  IF v_on > v_today THEN
    RAISE EXCEPTION 'A data não pode ser no futuro.';
  END IF;
  IF v_receipt IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id = 'cofre-comprovativos' AND name = v_receipt
  ) THEN
    RAISE EXCEPTION 'O comprovativo não foi encontrado. Volta a anexá-lo.';
  END IF;

  PERFORM public.cofre_assert_holder(v_holder);
  PERFORM pg_advisory_xact_lock(hashtext('cofre:' || v_holder::text));

  IF p_kind = 'abertura' AND EXISTS (
    SELECT 1 FROM public.club_cash_movements m
    WHERE m.kind = 'abertura' AND m.holder_id = v_holder
      AND NOT EXISTS (SELECT 1 FROM public.club_cash_movements r WHERE r.reverses_id = m.id)
  ) THEN
    RAISE EXCEPTION 'Este coordenador já tem a contagem inicial registada. Se estiver errada, estorna-a primeiro.';
  END IF;

  IF p_kind = 'despesa' THEN
    v_balance := public.cofre_balance(v_holder);
    IF v_balance < v_amount THEN
      RAISE EXCEPTION 'Esse coordenador só tem % € do clube em mão no Cofre.', to_char(v_balance, 'FM999990.00');
    END IF;
    IF p_method = 'numerario' THEN
      v_balance := public.cofre_balance(v_holder, 'numerario');
      IF v_balance < v_amount THEN
        RAISE EXCEPTION 'Esse coordenador só tem % € do clube em numerário no Cofre.', to_char(v_balance, 'FM999990.00');
      END IF;
    END IF;
  END IF;

  INSERT INTO public.club_cash_movements (kind, amount_eur, method, holder_id, occurred_on, description, receipt_path, created_by)
  VALUES (p_kind, v_amount, p_method, v_holder, v_on, v_desc, v_receipt, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Estorno: anula um movimento com um movimento novo (mesmo valor, método e
-- detentor, sinal contrário). As vendas e reembolsos da loja corrigem-se pela
-- Loja (Corrigir / Reembolsar); um estorno não se estorna.
CREATE OR REPLACE FUNCTION public.cofre_reverse(p_movement_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mov record;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_id uuid;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Diz porque estás a estornar.';
  END IF;
  IF length(v_reason) > 300 THEN
    RAISE EXCEPTION 'O motivo é demasiado longo (máximo 300 caracteres).';
  END IF;

  SELECT * INTO v_mov FROM public.club_cash_movements WHERE id = p_movement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimento não encontrado.';
  END IF;
  IF v_mov.kind = 'estorno' THEN
    RAISE EXCEPTION 'Um estorno não se estorna.';
  END IF;
  IF v_mov.kind IN ('venda', 'reembolso') THEN
    RAISE EXCEPTION 'As vendas e os reembolsos da loja corrigem-se na Loja.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cofre:' || v_mov.holder_id::text));
  IF EXISTS (SELECT 1 FROM public.club_cash_movements WHERE reverses_id = p_movement_id) THEN
    RAISE EXCEPTION 'Este movimento já foi estornado.';
  END IF;

  INSERT INTO public.club_cash_movements (kind, amount_eur, method, holder_id, occurred_on, description, created_by, reverses_id)
  VALUES ('estorno', v_mov.amount_eur, v_mov.method, v_mov.holder_id,
          (now() AT TIME ZONE 'Europe/Lisbon')::date, 'Estorno: ' || v_reason, auth.uid(), p_movement_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================================
-- 7. RELATÓRIO: vendas da loja por artigo num período (datas de Lisboa)
--    Conta as compras pagas no período e não reembolsadas. O desconto com Gold
--    é dinheiro que o clube não recebe: a margem é recebido − custo.
--    O custo usa o cost_price ATUAL do artigo (NULL se não houver).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cofre_store_summary(p_from date, p_to date)
RETURNS TABLE(
  product_id uuid,
  product_name text,
  units bigint,
  list_eur numeric,
  gold_discount_eur numeric,
  volume_discount_eur numeric,
  received_eur numeric,
  cost_eur numeric,
  margin_eur numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    COALESCE(p.name, 'Artigo apagado'),
    sum(COALESCE(sp.quantity, 1))::bigint,
    sum(round(sp.price_eur * COALESCE(sp.quantity, 1), 2)),
    sum(COALESCE(sp.discount_eur, 0)),
    sum(COALESCE(sp.volume_discount_eur, 0)),
    sum(COALESCE(sp.amount_due_eur, 0)),
    CASE WHEN p.cost_price IS NULL THEN NULL
         ELSE sum(round(p.cost_price * COALESCE(sp.quantity, 1), 2)) END,
    CASE WHEN p.cost_price IS NULL THEN NULL
         ELSE sum(COALESCE(sp.amount_due_eur, 0)) - sum(round(p.cost_price * COALESCE(sp.quantity, 1), 2)) END
  FROM public.store_purchases sp
  LEFT JOIN public.store_products p ON p.id = sp.product_id
  WHERE sp.status <> 'refunded'
    AND sp.paid_at IS NOT NULL
    AND (sp.paid_at AT TIME ZONE 'Europe/Lisbon')::date BETWEEN p_from AND p_to
  GROUP BY p.id, p.name, p.cost_price
  ORDER BY sum(COALESCE(sp.amount_due_eur, 0)) DESC, COALESCE(p.name, '');
END;
$$;

-- ============================================================================
-- 9. UM ARTIGO COM VENDAS PAGAS NÃO SE APAGA
--    (apagar o artigo apagava as compras em cascata, e com elas o rasto do
--    dinheiro). Desativa-se em vez disso.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.store_products_keep_paid_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.store_purchases
    WHERE product_id = OLD.id AND paid_at IS NOT NULL AND COALESCE(amount_due_eur, 0) > 0
  ) THEN
    RAISE EXCEPTION 'Este artigo já teve vendas pagas e fica no histórico. Desativa-o em vez de o apagar.';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.store_products_keep_paid_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_products_keep_paid_history() TO service_role;

DROP TRIGGER IF EXISTS store_products_keep_paid_history ON public.store_products;
CREATE TRIGGER store_products_keep_paid_history
  BEFORE DELETE ON public.store_products
  FOR EACH ROW EXECUTE FUNCTION public.store_products_keep_paid_history();

-- ============================================================================
-- 10. PERMISSÕES DAS FUNÇÕES
-- ============================================================================
REVOKE ALL ON FUNCTION public.mark_purchase_paid(uuid, boolean, public.payment_method, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_purchase_receiver(uuid, uuid, public.payment_method, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.correct_purchase_payment(uuid, uuid, public.payment_method, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.refund_purchase(uuid, public.payment_method) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cofre_register(public.cash_movement_kind, numeric, public.payment_method, text, uuid, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cofre_reverse(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cofre_store_summary(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_purchase_paid(uuid, boolean, public.payment_method, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_purchase_receiver(uuid, uuid, public.payment_method, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.correct_purchase_payment(uuid, uuid, public.payment_method, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_purchase(uuid, public.payment_method) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cofre_register(public.cash_movement_kind, numeric, public.payment_method, text, uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cofre_reverse(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cofre_store_summary(date, date) TO authenticated, service_role;

-- Compra e encomendas dos convidados: abertas (como antes).
GRANT EXECUTE ON FUNCTION public.process_purchase(uuid, numeric, text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_guest_purchases(uuid[]) TO anon, authenticated, service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;

-- ===========================================================================
-- 2. AUTH: perfil criado no registo
-- ===========================================================================

-- Cada conta nova em auth.users recebe logo um perfil 'desbravador' sem data de
-- nascimento. O /onboarding preenche a data (o trigger on_profile_lifecycle calcula
-- então a classe pela idade) e as contas familiares fazem upsert por cima.
-- Vinha do primeiro supabase-setup.sql (fev. 2026) e saiu do ficheiro na reescrita,
-- mas o código conta com ele: sem isto um projeto novo não consegue criar perfis
-- (profiles não tem política de INSERT, de propósito: ninguém se cria coordenador).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, role, section, total_xp, current_gold, is_invested)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    'desbravador',
    'rebentos',
    0,
    0,
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===========================================================================
-- 3. STORAGE
-- ===========================================================================

-- Bucket de imagens (avatares em avatars/, produtos da loja em products/)
INSERT INTO storage.buckets (id, name, public) VALUES ('imagens', 'imagens', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
CREATE POLICY "Authenticated users can upload avatars" ON storage.objects
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (((bucket_id = 'imagens'::text) AND ((storage.foldername(name))[1] = 'avatars'::text)));

DROP POLICY IF EXISTS "Coordinators can delete product images" ON storage.objects;
CREATE POLICY "Coordinators can delete product images" ON storage.objects
  AS PERMISSIVE FOR DELETE
  TO authenticated
  USING (((bucket_id = 'imagens'::text) AND ((storage.foldername(name))[1] = 'products'::text) AND (public.get_my_real_role() = 'coordenador'::text)));

DROP POLICY IF EXISTS "Coordinators can update product images" ON storage.objects;
CREATE POLICY "Coordinators can update product images" ON storage.objects
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (((bucket_id = 'imagens'::text) AND ((storage.foldername(name))[1] = 'products'::text) AND (public.get_my_real_role() = 'coordenador'::text)));

DROP POLICY IF EXISTS "Coordinators can upload product images" ON storage.objects;
CREATE POLICY "Coordinators can upload product images" ON storage.objects
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (((bucket_id = 'imagens'::text) AND ((storage.foldername(name))[1] = 'products'::text) AND (public.get_my_real_role() = 'coordenador'::text)));

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects
  AS PERMISSIVE FOR SELECT
  USING ((bucket_id = 'imagens'::text));

DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;
CREATE POLICY "Users can delete their own avatars" ON storage.objects
  AS PERMISSIVE FOR DELETE
  TO authenticated
  USING (((bucket_id = 'imagens'::text) AND (owner = auth.uid())));

DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
CREATE POLICY "Users can update their own avatars" ON storage.objects
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (((bucket_id = 'imagens'::text) AND (owner = auth.uid())));

-- Comprovativos do Cofre (bucket privado; só a coordenação real lê e envia)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cofre-comprovativos', 'cofre-comprovativos', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Cofre: coordenação real lê comprovativos" ON storage.objects;
CREATE POLICY "Cofre: coordenação real lê comprovativos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'cofre-comprovativos' AND public.get_my_real_role() = 'coordenador');

DROP POLICY IF EXISTS "Cofre: coordenação real envia comprovativos" ON storage.objects;
CREATE POLICY "Cofre: coordenação real envia comprovativos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cofre-comprovativos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.get_my_real_role() = 'coordenador'
  );

-- ===========================================================================
-- 4. REALTIME
-- ===========================================================================

-- Só tabelas sem segredos (sessões, jogadores, ecrãs). Respostas, papéis e
-- palavras secretas ficam fora e leem-se por RPCs SECURITY DEFINER.
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'club_screens',
    'qr_codes',
    'qr_scans',
    'raffle_screens',
    'team_screens',
    'timer_screens',
    'vana_quest_answers',
    'vana_quest_participants',
    'vana_quest_sessions',
    'vanacamp_events',
    'vanacamp_messages',
    'vanacamp_sessions',
    'vanacamp_votes',
    'vanacoro_players',
    'vanacoro_sessions',
    'vanaespada_players',
    'vanaespada_sessions',
    'vanasketch_guesses',
    'vanasketch_players',
    'vanasketch_sessions',
    'vanasketch_strokes',
    'vanawords_guesses',
    'vanawords_players',
    'vanawords_sessions',
    'vanawords_turns'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

SELECT pg_catalog.set_config('search_path', '"$user", public, extensions', false);

COMMIT;

-- ===========================================================================
-- 5. PASSOS MANUAIS (não correm sozinhos: descomentar e preencher)
-- ===========================================================================

-- 5.1 Notificações push: Database Webhook que chama a Edge Function send-push
--     sempre que há um comunicado novo. O mais simples é criá-lo no painel:
--     Database → Webhooks → Create: tabela public.announcements, evento INSERT,
--     tipo "Supabase Edge Functions", função send-push.
--     Equivalente em SQL (trocar <PROJECT_REF> e <SERVICE_ROLE_KEY>; nunca
--     guardar a chave no repositório):
--
-- CREATE TRIGGER "send-push"
--   AFTER INSERT ON public.announcements
--   FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request(
--     'https://<PROJECT_REF>.supabase.co/functions/v1/send-push',
--     'POST',
--     '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}',
--     '{}',
--     '5000'
--   );

-- 5.2 Primeiro coordenador (depois de criar a conta e fazer o onboarding no site):
--
-- BEGIN;
-- SELECT set_config('app.allow_role_change', 'on', true);
-- UPDATE public.profiles SET role = 'coordenador'
--  WHERE id = (SELECT id FROM auth.users WHERE email = '<email-da-conta>');
-- COMMIT;

-- 5.3 Loja: caducidade das encomendas por pagar (opcional). A página da loja e o
--     /admin já a correm ao abrir; com pg_cron (Database → Extensions) corre
--     também todas as noites:
--
-- SELECT cron.schedule('store-expire-unpaid-orders', '17 3 * * *',
--                      'SELECT public.expire_unpaid_store_orders();');
