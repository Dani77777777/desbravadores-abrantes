-- ============================================
-- MIGRAÇÃO: Auditoria — identificar Ajudantes em "Atribuído por"
-- ============================================
-- A vista `points_audit` mostrava o cargo EFETIVO de quem atribuiu
-- (COALESCE(helper_role, role)), por isso um Ajudante com âmbito de classe
-- aparecia como "Dirigente". Passa a expor também `helper_role`/`helper_section`
-- para o painel mostrar "Ajudante · Classe". O `audit_points_overview` devolve
-- os mesmos campos no top "Quem mais atribuiu pontos".
--
-- Corre o ficheiro inteiro no SQL Editor do Supabase. É idempotente.
-- ============================================

DROP VIEW IF EXISTS public.points_audit;
CREATE VIEW public.points_audit WITH (security_invoker = true) AS
SELECT
  y.*,
  -- Alerta: pontos atribuídos a si próprio por quem não é coordenador (dirigentes,
  -- ajudantes) fora dos fluxos automáticos, ou atribuídos por alguém sem cargo de
  -- gestão (só possível antes desta migração).
  (
    (y.is_self AND y.awarded_by_real_role IS DISTINCT FROM 'coordenador'
     AND y.category IN ('manual', 'tarefa', 'evento', 'sugestao'))
    OR y.category = 'outro'
  ) AS is_suspicious
FROM (
  SELECT
    x.id, x.created_at, x.target_user_id, x.target_name, x.target_avatar, x.target_section, x.target_role,
    x.awarded_by_user_id, x.awarded_by_name, x.awarded_by_role, x.awarded_by_real_role,
    x.awarded_by_helper_role, x.awarded_by_helper_section,
    x.amount_xp, x.amount_gold, x.description, x.event_id, x.is_self,
    -- Coordenador (cargo real) a dar pontos a si próprio com valor escolhido por ele:
    -- permitido, mas destacado. Presenças em eventos e tarefas NÃO contam: o valor vem
    -- das regras do evento/tarefa e é igual para todos (continua a ver-se "O próprio").
    CASE
      WHEN x.is_self AND x.awarded_by_real_role = 'coordenador'
           AND x.base_category IN ('manual', 'sugestao', 'outro') THEN 'auto'
      ELSE x.base_category
    END AS category
  FROM (
    SELECT
      pl.id,
      pl.created_at,
      pl.target_user_id,
      t.full_name              AS target_name,
      t.avatar_url             AS target_avatar,
      t.section::text          AS target_section,
      t.role::text             AS target_role,
      pl.awarded_by_user_id,
      a.full_name              AS awarded_by_name,
      COALESCE(a.helper_role, a.role)::text AS awarded_by_role,
      a.role::text             AS awarded_by_real_role,
      -- Ajudantes: o cargo efetivo acima é o do ajudante; estes dois servem para os
      -- identificar como "Ajudante · Classe" (e não como Dirigente/Coordenador).
      a.helper_role::text      AS awarded_by_helper_role,
      a.helper_section::text   AS awarded_by_helper_section,
      pl.amount_xp,
      pl.amount_gold,
      pl.description,
      pl.event_id,
      (pl.awarded_by_user_id IS NOT NULL AND pl.awarded_by_user_id = pl.target_user_id) AS is_self,
      CASE
        WHEN pl.description ILIKE 'Reset de pontos%'                  THEN 'reset'   -- RPC reset_all_points
        WHEN pl.event_id IS NOT NULL                                  THEN 'evento'
        WHEN pl.description ILIKE 'Tarefa concluída%'                 THEN 'tarefa'
        WHEN pl.description ILIKE 'Resgate de código%'
          OR pl.description ILIKE 'Questão resolvida%'                THEN 'qr'
        WHEN pl.description ILIKE 'Recompensa por sugestão%'          THEN 'sugestao'
        WHEN pl.description ILIKE 'Resposta a inquérito%'             THEN 'inquerito'
        WHEN pl.description ILIKE 'Compra na Loja%'
          OR pl.description ILIKE 'Desconto na Loja%'
          OR pl.description ILIKE 'Reembolso de compra%'              THEN 'loja'
        WHEN pl.description ILIKE 'Transferência%'                    THEN 'transferencia'
        WHEN pl.description ILIKE 'Vantur%'                             -- RPC award_vantur_rewards
          OR pl.description ILIKE 'Vana%'                               -- VanaQuest, VanaTrilha, ...
          OR pl.description ILIKE '%VanaWords%'
          OR pl.description ILIKE '%VanaSketch%'                      THEN 'jogo'
        WHEN COALESCE(a.helper_role, a.role)::text IN ('dirigente', 'coordenador') THEN 'manual'
        ELSE 'outro'
      END AS base_category
    FROM public.points_log pl
    LEFT JOIN public.profiles t ON t.id = pl.target_user_id
    LEFT JOIN public.profiles a ON a.id = pl.awarded_by_user_id
  ) x
) y;

GRANT SELECT ON public.points_audit TO authenticated;


-- Resumo de um período: totais, por origem, top membros, alertas.
CREATE OR REPLACE FUNCTION public.audit_points_overview(p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
