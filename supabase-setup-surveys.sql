-- ============================================
-- SUPABASE SETUP - Inquéritos (Surveys)
-- ============================================
-- Tabelas para inquéritos de escolha múltipla com recompensas.
-- - Coordenadores criam, editam e apagam inquéritos.
-- - Cada inquérito tem N opções (sem limite).
-- - Cada opção pode ter XP/Gold próprio (incluir o mesmo em todas
--   funciona como "recompensa por participar").
-- - Os inquéritos têm `deadline` (timestamptz). Comportamento:
--     * agora < deadline                       → aberto (pode votar)
--     * deadline ≤ agora < deadline + 3 dias   → fechado, resultados visíveis a todos
--     * agora ≥ deadline + 3 dias              → só coordenadores veem
-- ============================================

-- ============================================
-- 1. TABELAS
-- ============================================

CREATE TABLE IF NOT EXISTS public.surveys (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  question text NOT NULL,
  description text,
  created_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  deadline timestamptz NOT NULL,
  -- Se true, qualquer pessoa vê os resultados agregados durante o inquérito (votos dos outros).
  -- Se false (default), os resultados só aparecem após a deadline.
  show_results_live boolean NOT NULL DEFAULT false,
  -- Se true (default): a resposta é definitiva — exige confirmação e pontos são atribuídos no acto.
  -- Se false: o utilizador pode mudar de voto até à deadline; pontos só são atribuídos
  --          quando o coordenador finalizar o inquérito (evita exploits).
  is_definitive boolean NOT NULL DEFAULT true,
  -- Timestamp do momento em que os pontos foram atribuídos (apenas para is_definitive = false).
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.survey_options (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  survey_id uuid REFERENCES public.surveys(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL,
  xp_reward integer NOT NULL DEFAULT 0,
  gold_reward integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS survey_options_survey_id_idx ON public.survey_options(survey_id);

CREATE TABLE IF NOT EXISTS public.survey_responses (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  survey_id uuid REFERENCES public.surveys(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  option_id uuid REFERENCES public.survey_options(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(survey_id, user_id)
);

CREATE INDEX IF NOT EXISTS survey_responses_survey_id_idx ON public.survey_responses(survey_id);

-- ============================================
-- 2. RLS - SURVEYS
-- ============================================

ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View visible surveys" ON public.surveys;
DROP POLICY IF EXISTS "Coordinators insert surveys" ON public.surveys;
DROP POLICY IF EXISTS "Coordinators update surveys" ON public.surveys;
DROP POLICY IF EXISTS "Coordinators delete surveys" ON public.surveys;

CREATE POLICY "View visible surveys" ON public.surveys FOR SELECT USING (
  (deadline + interval '3 days') > now()
  OR public.get_my_role() = 'coordenador'
);
CREATE POLICY "Coordinators insert surveys" ON public.surveys FOR INSERT WITH CHECK (
  public.get_my_role() = 'coordenador'
);
CREATE POLICY "Coordinators update surveys" ON public.surveys FOR UPDATE USING (
  public.get_my_role() = 'coordenador'
);
CREATE POLICY "Coordinators delete surveys" ON public.surveys FOR DELETE USING (
  public.get_my_role() = 'coordenador'
);

-- ============================================
-- 3. RLS - SURVEY_OPTIONS
-- ============================================

ALTER TABLE public.survey_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View options of visible surveys" ON public.survey_options;
DROP POLICY IF EXISTS "Coordinators manage options" ON public.survey_options;

CREATE POLICY "View options of visible surveys" ON public.survey_options FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.surveys s
    WHERE s.id = survey_id
      AND ((s.deadline + interval '3 days') > now() OR public.get_my_role() = 'coordenador')
  )
);
CREATE POLICY "Coordinators manage options" ON public.survey_options FOR ALL
  USING (public.get_my_role() = 'coordenador')
  WITH CHECK (public.get_my_role() = 'coordenador');

-- ============================================
-- 4. RLS - SURVEY_RESPONSES
-- ============================================

ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own or post-deadline responses" ON public.survey_responses;
DROP POLICY IF EXISTS "Vote while open" ON public.survey_responses;
DROP POLICY IF EXISTS "Change vote while non-definitive open" ON public.survey_responses;
DROP POLICY IF EXISTS "Coordinators delete responses" ON public.survey_responses;

-- Antes da deadline, cada um só vê o seu voto (resultados escondidos).
-- Após a deadline, todos com acesso ao inquérito veem todas as respostas (para agregar resultados).
-- Coordenadores veem sempre tudo.
CREATE POLICY "View own or post-deadline responses" ON public.survey_responses FOR SELECT USING (
  user_id = auth.uid()
  OR public.get_my_role() = 'coordenador'
  OR EXISTS (
    SELECT 1 FROM public.surveys s
    WHERE s.id = survey_id
      AND (s.deadline <= now() OR s.show_results_live)
  )
);
CREATE POLICY "Vote while open" ON public.survey_responses FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.surveys s WHERE s.id = survey_id AND s.deadline > now())
);
-- Permite mudar de voto enquanto o inquérito está aberto e não for definitivo
CREATE POLICY "Change vote while non-definitive open" ON public.survey_responses FOR UPDATE
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = survey_id AND s.deadline > now() AND NOT s.is_definitive
    )
  )
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Coordinators delete responses" ON public.survey_responses FOR DELETE USING (
  public.get_my_role() = 'coordenador'
);

-- ============================================
-- 5. TRIGGER - Recompensas automáticas ao votar
-- ============================================

-- Para inquéritos DEFINITIVOS, os pontos são atribuídos no momento do voto.
-- Para inquéritos não-definitivos, os pontos são atribuídos quando o coordenador
-- chamar `public.finalize_survey(...)` após a deadline.
CREATE OR REPLACE FUNCTION public.award_survey_response_points() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
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

DROP TRIGGER IF EXISTS on_survey_response_insert ON public.survey_responses;
CREATE TRIGGER on_survey_response_insert
  AFTER INSERT ON public.survey_responses
  FOR EACH ROW EXECUTE PROCEDURE public.award_survey_response_points();

-- ============================================
-- 6. FINALIZAR inquéritos não-definitivos (atribui pontos em lote)
-- ============================================

CREATE OR REPLACE FUNCTION public.finalize_survey(p_survey_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r record;
  s_question text;
  s_deadline timestamptz;
  s_definitive boolean;
  s_finalized timestamptz;
BEGIN
  IF public.get_my_role() <> 'coordenador' THEN
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

GRANT EXECUTE ON FUNCTION public.finalize_survey(uuid) TO authenticated;
