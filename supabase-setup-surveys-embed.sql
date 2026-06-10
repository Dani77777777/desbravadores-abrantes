-- ============================================
-- SUPABASE SETUP - Inquéritos: Embed + Abertura manual + Recompensas escondidas
-- ============================================
-- Corre DEPOIS de supabase-setup-surveys.sql.
--
-- Novidades:
-- 1. `opened_at` — o inquérito só aceita votos (e só aparece aos membros)
--    depois de aberto. Default now() mantém o comportamento antigo;
--    criar com opened_at = NULL deixa-o "por abrir" até o coordenador abrir.
-- 2. `hide_rewards` — se true, a UI não mostra que as opções dão XP/Ouro
--    (mas os pontos continuam a ser atribuídos normalmente).
-- 3. `get_survey_embed(uuid)` — função pública (anon) para a página de embed:
--    devolve pergunta, estado e contagens agregadas. Nunca devolve recompensas
--    nem votos individuais. Respeita `show_results_live` enquanto aberto.
-- ============================================

-- ============================================
-- 1. NOVAS COLUNAS
-- ============================================

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS opened_at timestamptz DEFAULT now();

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS hide_rewards boolean NOT NULL DEFAULT false;

-- ============================================
-- 2. RLS ATUALIZADA (inquéritos por abrir só são visíveis a coordenadores)
-- ============================================

DROP POLICY IF EXISTS "View visible surveys" ON public.surveys;
CREATE POLICY "View visible surveys" ON public.surveys FOR SELECT USING (
  (
    opened_at IS NOT NULL AND opened_at <= now()
    AND (deadline + interval '3 days') > now()
  )
  OR public.get_my_role() = 'coordenador'
);

DROP POLICY IF EXISTS "View options of visible surveys" ON public.survey_options;
CREATE POLICY "View options of visible surveys" ON public.survey_options FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.surveys s
    WHERE s.id = survey_id
      AND (
        (s.opened_at IS NOT NULL AND s.opened_at <= now() AND (s.deadline + interval '3 days') > now())
        OR public.get_my_role() = 'coordenador'
      )
  )
);

DROP POLICY IF EXISTS "Vote while open" ON public.survey_responses;
CREATE POLICY "Vote while open" ON public.survey_responses FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.surveys s
    WHERE s.id = survey_id
      AND s.deadline > now()
      AND s.opened_at IS NOT NULL AND s.opened_at <= now()
  )
);

DROP POLICY IF EXISTS "Change vote while non-definitive open" ON public.survey_responses;
CREATE POLICY "Change vote while non-definitive open" ON public.survey_responses FOR UPDATE
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = survey_id
        AND s.deadline > now()
        AND NOT s.is_definitive
        AND s.opened_at IS NOT NULL AND s.opened_at <= now()
    )
  )
  WITH CHECK (user_id = auth.uid());

-- ============================================
-- 3. FUNÇÃO PÚBLICA PARA A PÁGINA DE EMBED
-- ============================================
-- SECURITY DEFINER para contornar a RLS de forma controlada:
-- só expõe dados agregados e nunca recompensas / quem votou.
-- Enquanto o inquérito está aberto e show_results_live = false,
-- as contagens vêm a NULL (só o total de votos é revelado).

CREATE OR REPLACE FUNCTION public.get_survey_embed(p_survey_id uuid) RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.get_survey_embed(uuid) TO anon, authenticated;
