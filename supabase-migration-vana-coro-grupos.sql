-- ============================================
-- VANACORO — Fase 2: grupos de respostas e quadro congelado
-- Spec: docs/VanaCoro.md (§3.1, §6).
--
-- • vanacoro_groups: respostas iguais juntas ("Lanterna", "frontal", "luz" → 🔦 Lanterna).
--   source = 'auto' (normalização), 'ai' (IA) ou 'manual' (mexido pela coordenação).
--   Voltar a agrupar só substitui os grupos 'auto'/'ai'; os 'manual' ficam.
-- • vanacoro_answers ganha group_id e hidden (resposta imprópria / lixo).
-- • vanacoro_board_entries: cópia congelada do quadro quando a pergunta fica "pronta".
--
-- Como na Fase 1: RLS ligada e sem políticas — só o servidor (service role) lê e grava.
-- As escritas com vários passos vão por funções, para serem atómicas.
--
-- Requer: supabase-setup-vana-coro.sql.
-- Correr no SQL Editor do Supabase. É idempotente.
-- ============================================

-- 1. Grupos
CREATE TABLE IF NOT EXISTS public.vanacoro_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.vanacoro_questions(id) ON DELETE CASCADE,
  label       text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 40),
  emoji       text CHECK (emoji IS NULL OR char_length(emoji) <= 16),
  hidden      boolean NOT NULL DEFAULT false,
  source      text NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'ai', 'manual')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vanacoro_groups_question_idx ON public.vanacoro_groups (question_id);

-- 2. Respostas: grupo e "esconder"
ALTER TABLE public.vanacoro_answers
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.vanacoro_groups(id) ON DELETE SET NULL;
ALTER TABLE public.vanacoro_answers
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS vanacoro_answers_group_idx ON public.vanacoro_answers (group_id);

-- 3. Quadro congelado
CREATE TABLE IF NOT EXISTS public.vanacoro_board_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.vanacoro_questions(id) ON DELETE CASCADE,
  rank        int NOT NULL CHECK (rank BETWEEN 1 AND 5),
  label       text NOT NULL,
  emoji       text,
  respondents int NOT NULL CHECK (respondents >= 2),
  points      int NOT NULL CHECK (points BETWEEN 0 AND 100),
  CONSTRAINT vanacoro_board_entries_rank_unique UNIQUE (question_id, rank)
);

ALTER TABLE public.vanacoro_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanacoro_board_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vanacoro_groups FROM anon, authenticated;
REVOKE ALL ON public.vanacoro_board_entries FROM anon, authenticated;

-- 4. Substituir os grupos automáticos de uma pergunta (agrupar sem IA / com IA).
-- p_groups = [{ "label": "", "emoji": "", "hidden": false, "source": "auto"|"ai",
--               "existing_group_id": null | uuid, "answer_ids": [uuid, ...] }]
-- • p_replace = true  → apaga primeiro os grupos 'auto'/'ai' (as respostas deles ficam sem grupo);
--   p_replace = false → "agrupar as novas": só mexe em respostas ainda sem grupo.
-- • existing_group_id → junta as respostas a um grupo que já existe (desta pergunta).
-- • Nunca tira uma resposta de um grupo 'manual'.
CREATE OR REPLACE FUNCTION public.vanacoro_apply_groups(p_question_id uuid, p_groups jsonb, p_replace boolean)
RETURNS int
LANGUAGE plpgsql
SET search_path = public
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

-- 5. Congelar o quadro (o servidor calcula as entradas; aqui grava tudo de uma vez).
-- p_entries = [{ "rank": 1, "label": "", "emoji": "", "respondents": 7, "points": 33 }, ...]
CREATE OR REPLACE FUNCTION public.vanacoro_freeze_board(p_question_id uuid, p_entries jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
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

-- 6. Descongelar (só antes de a pergunta ser jogada)
CREATE OR REPLACE FUNCTION public.vanacoro_unfreeze_board(p_question_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
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

REVOKE ALL ON FUNCTION public.vanacoro_apply_groups(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vanacoro_freeze_board(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vanacoro_unfreeze_board(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vanacoro_apply_groups(uuid, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.vanacoro_freeze_board(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.vanacoro_unfreeze_board(uuid) TO service_role;

-- 7. As contagens do admin passam a ignorar as respostas escondidas.
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
  WHERE NOT a.hidden
  GROUP BY a.question_id;
$$;
REVOKE ALL ON FUNCTION public.vanacoro_question_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vanacoro_question_stats() TO service_role;

-- Confirmação
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('vanacoro_groups', 'vanacoro_board_entries')
ORDER BY table_name;
