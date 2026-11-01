-- ============================================
-- MIGRAÇÃO: Auditoria — origem "Pergunta da Semana"
-- ============================================
-- Os 5 XP por responder à Pergunta da Semana (award_question_answer_reward) ficam com
-- a descrição "Pergunta da Semana" e são dados pelo próprio. A vista `points_audit` não
-- conhecia esta descrição, por isso caíam em "Sem origem clara" (e apareciam como
-- suspeitos) ou em "Auto-atribuição" quando era um coordenador. Passam a ter a origem
-- própria `pergunta`. Corrige também as linhas já existentes (é uma vista).
--
-- Corre o ficheiro inteiro no SQL Editor do Supabase. É idempotente.
-- ============================================

CREATE OR REPLACE VIEW public.points_audit WITH (security_invoker = true) AS
SELECT
  y.*,
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
      a.helper_role::text      AS awarded_by_helper_role,
      a.helper_section::text   AS awarded_by_helper_section,
      pl.amount_xp,
      pl.amount_gold,
      pl.description,
      pl.event_id,
      (pl.awarded_by_user_id IS NOT NULL AND pl.awarded_by_user_id = pl.target_user_id) AS is_self,
      CASE
        WHEN pl.description ILIKE 'Reset de pontos%'                  THEN 'reset'
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
        WHEN pl.description ILIKE 'Pergunta da Semana%'               THEN 'pergunta'
        WHEN pl.description ILIKE 'Vantur%'
          OR pl.description ILIKE 'Vana%'
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
