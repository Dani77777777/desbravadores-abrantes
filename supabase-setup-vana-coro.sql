-- ============================================
-- VANACORO — Fase 1: recolha de respostas ("Pergunta da Semana")
-- Spec: docs/VanaCoro.md (§2, §5, §7.1, §10).
--
-- A recolha é disfarçada: quem responde vê só a "Pergunta da Semana" em
-- /perguntas e não sabe que as respostas vão para um jogo. Por isso:
--   • nenhuma destas tabelas tem políticas de leitura para anon/authenticated
--     (o servidor lê e grava com a service role depois de validar tudo);
--   • nenhuma entra em supabase_realtime;
--   • o jogo nasce escondido em game_settings (só a coordenação o vê).
--
-- Fases seguintes (grupos, quadro, sessões) chegam em migrações à parte:
-- supabase-migration-vana-coro-<assunto>.sql.
--
-- Requer: supabase-migration-game-settings.sql e supabase-migration-helpers.sql.
-- Correr no SQL Editor do Supabase. É idempotente: pode voltar a correr-se.
-- ============================================

-- 1. Definições globais (linha única)
CREATE TABLE IF NOT EXISTS public.vanacoro_settings (
  id                smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  invite_token      text NOT NULL,
  invite_rotated_at timestamptz NOT NULL DEFAULT now(),
  cadence_days      int NOT NULL DEFAULT 7 CHECK (cadence_days BETWEEN 1 AND 60),
  open_days         int NOT NULL DEFAULT 7 CHECK (open_days BETWEEN 1 AND 60),
  turbo             boolean NOT NULL DEFAULT false
);

-- 2. Perguntas (a fila e o banco)
CREATE TABLE IF NOT EXISTS public.vanacoro_questions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt             text NOT NULL CHECK (char_length(prompt) BETWEEN 5 AND 140),
  allow_guests       boolean NOT NULL DEFAULT true,
  opens_at           timestamptz,            -- null = na fila, sem data
  closes_at          timestamptz,
  review_status      text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'grouped', 'ready')),
  ready_at           timestamptz,
  used_at            timestamptz,
  used_in_session_id uuid,                   -- FK acrescentada na fase do jogo ao vivo
  push_sent_at       timestamptz,
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vanacoro_questions_dates_valid
    CHECK ((opens_at IS NULL AND closes_at IS NULL) OR (opens_at IS NOT NULL AND closes_at > opens_at))
);

-- 3. Respostas (segredo: ninguém as lê pelo cliente)
CREATE TABLE IF NOT EXISTS public.vanacoro_answers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     uuid NOT NULL REFERENCES public.vanacoro_questions(id) ON DELETE CASCADE,
  profile_id      uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  guest_id        uuid,
  respondent_key  uuid GENERATED ALWAYS AS (coalesce(profile_id, guest_id)) STORED,
  ip_hash         text,                      -- sha256(ip + sal), só para o limite de pedidos
  raw_text        text NOT NULL CHECK (char_length(raw_text) BETWEEN 1 AND 40),
  normalized_text text NOT NULL CHECK (char_length(normalized_text) >= 1),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vanacoro_answers_one_identity CHECK ((profile_id IS NULL) <> (guest_id IS NULL)),
  CONSTRAINT vanacoro_answers_no_repeat UNIQUE (question_id, respondent_key, normalized_text)
);

CREATE INDEX IF NOT EXISTS vanacoro_answers_question_idx ON public.vanacoro_answers (question_id);
CREATE INDEX IF NOT EXISTS vanacoro_answers_respondent_idx ON public.vanacoro_answers (respondent_key, created_at);
CREATE INDEX IF NOT EXISTS vanacoro_answers_ip_idx ON public.vanacoro_answers (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS vanacoro_questions_opens_idx ON public.vanacoro_questions (opens_at);

-- No máximo 3 respostas por pessoa em cada pergunta. O servidor já verifica antes
-- de inserir; isto é a rede de segurança para dois pedidos ao mesmo tempo
-- (o lock serializa as inserções da mesma pessoa na mesma pergunta).
-- Nota: num BEFORE INSERT a coluna gerada respondent_key ainda não existe.
CREATE OR REPLACE FUNCTION public.vanacoro_answers_limit() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
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

DROP TRIGGER IF EXISTS trg_vanacoro_answers_limit ON public.vanacoro_answers;
CREATE TRIGGER trg_vanacoro_answers_limit
  BEFORE INSERT ON public.vanacoro_answers
  FOR EACH ROW EXECUTE FUNCTION public.vanacoro_answers_limit();

-- 4. Idempotência dos +5 XP (uma vez por membro e por pergunta)
CREATE TABLE IF NOT EXISTS public.vanacoro_answer_rewards (
  question_id uuid REFERENCES public.vanacoro_questions(id) ON DELETE CASCADE,
  profile_id  uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  awarded_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, profile_id)
);

-- 5. RLS: ligada e sem políticas → só a service role (servidor) lê e grava.
ALTER TABLE public.vanacoro_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanacoro_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanacoro_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanacoro_answer_rewards ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.vanacoro_settings FROM anon, authenticated;
REVOKE ALL ON public.vanacoro_questions FROM anon, authenticated;
REVOKE ALL ON public.vanacoro_answers FROM anon, authenticated;
REVOKE ALL ON public.vanacoro_answer_rewards FROM anon, authenticated;

-- 6. Prémio da primeira resposta de um membro a cada pergunta (+5 XP, 0 Gold).
-- Nome neutro: é chamada pelo browser do membro (através da rota /api/perguntas)
-- com a sessão dele, por isso aparece nos pedidos de rede.
CREATE OR REPLACE FUNCTION public.award_question_answer_reward(p_question_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.award_question_answer_reward(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_question_answer_reward(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.award_question_answer_reward(uuid) TO authenticated;

-- 7. Contagens para o admin (pessoas distintas e respostas por pergunta).
-- Só a service role a chama (o admin verifica o cargo antes).
CREATE OR REPLACE FUNCTION public.vanacoro_question_stats()
RETURNS TABLE (question_id uuid, respondents bigint, answers bigint, guest_respondents bigint)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT a.question_id,
         count(DISTINCT a.respondent_key),
         count(*),
         count(DISTINCT a.guest_id)
  FROM public.vanacoro_answers a
  GROUP BY a.question_id;
$$;

REVOKE ALL ON FUNCTION public.vanacoro_question_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vanacoro_question_stats() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vanacoro_question_stats() TO service_role;

-- 8. Linha única das definições, com um link de convite aleatório
-- (8 caracteres base62 tirados dos bytes aleatórios de um UUID v4).
-- A coordenação pode gerar outro no admin a qualquer momento.
INSERT INTO public.vanacoro_settings (id, invite_token)
SELECT 1, string_agg(
  substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
         get_byte(b, i) % 62 + 1, 1), '' ORDER BY i)
FROM (SELECT uuid_send(gen_random_uuid()) AS b) r, generate_series(0, 7) AS i
GROUP BY b
ON CONFLICT (id) DO NOTHING;

-- 9. O jogo nasce escondido: só a coordenação o vê e o pode testar.
ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

INSERT INTO public.game_settings (game_id, enabled, allowed_roles, hidden)
VALUES ('vana-coro', true, ARRAY['coordenador']::text[], true)
ON CONFLICT (game_id) DO NOTHING;

-- Confirmação
SELECT game_id, enabled, allowed_roles, hidden FROM public.game_settings WHERE game_id = 'vana-coro';
SELECT cadence_days, open_days, turbo, char_length(invite_token) AS token_len FROM public.vanacoro_settings;
