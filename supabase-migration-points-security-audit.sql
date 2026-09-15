-- ============================================
-- MIGRAÇÃO: Segurança dos pontos (XP/Ouro) + Auditoria
-- ============================================
-- PROBLEMAS CORRIGIDOS
--   1. `profiles` — a política "Users can update own" deixava um membro alterar
--      diretamente o seu `total_xp` e `current_gold` a partir do browser.
--      → Trigger `protect_point_totals`: os totais só podem ter o valor que resulta
--        do histórico (`points_log`). Qualquer outro valor é rejeitado.
--   2. `points_log` — a política de INSERT só exigia `awarded_by_user_id = auth.uid()`,
--      por isso qualquer membro podia dar pontos a si próprio (permanente).
--      → Só coordenação (qualquer membro) e dirigentes (membros da sua classe).
--        A si próprio só o coordenador real, e isso fica destacado na Auditoria. Os resgates de QR passaram para o servidor
--        (lib/actions/qr.ts com service role).
--
-- AUDITORIA (tab "Auditoria", só coordenação)
--   • Vista `points_audit` — movimentos com nomes, origem e sinais de alerta.
--   • Tabela `points_audit_events` — edições/eliminações de movimentos e correções
--     de totais (o histórico normal só guarda inserções).
--   • RPCs `audit_points_overview`, `audit_fix_totals`.
--   • Ao correr esta migração, perfis cujos totais não batem com o histórico são
--     corrigidos e a correção fica registada (para veres se alguém abusou da falha).
--
-- Corre o ficheiro inteiro no SQL Editor do Supabase. É idempotente.
-- ============================================


-- ============================================
-- 1. HELPERS
-- ============================================

CREATE OR REPLACE FUNCTION public.get_profile_section(p_user_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT section::text FROM public.profiles WHERE id = p_user_id;
$$;


-- ============================================
-- 2. POINTS_LOG — quem pode inserir e ver
-- ============================================

ALTER TABLE public.points_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can insert points" ON public.points_log;
DROP POLICY IF EXISTS "Leaders can insert points" ON public.points_log;
CREATE POLICY "Leaders can insert points" ON public.points_log FOR INSERT WITH CHECK (
  auth.uid() = awarded_by_user_id
  -- A si próprio: só o coordenador REAL (fica destacado na Auditoria como "auto").
  -- Ajudantes (que estão no ranking) e dirigentes nunca.
  AND (target_user_id <> auth.uid() OR public.get_my_real_role() = 'coordenador')
  AND (
    public.get_my_role() = 'coordenador'
    OR (
      public.get_my_role() = 'dirigente'
      AND public.get_profile_section(target_user_id) = COALESCE(public.get_my_leadership_section(), public.get_my_section())
    )
  )
);
-- Nota: funções SECURITY DEFINER (loja, transferências, inquéritos, reverter evento)
-- e o service role (QR, VanaQuest, VanaWords) não passam por esta política.

DROP POLICY IF EXISTS "Coordinators can audit points" ON public.points_log;
CREATE POLICY "Coordinators can audit points" ON public.points_log FOR SELECT USING (
  public.get_my_real_role() = 'coordenador'
);


-- ============================================
-- 3. PROFILES — totais só a partir do histórico
-- ============================================

CREATE OR REPLACE FUNCTION public.protect_point_totals() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

DROP TRIGGER IF EXISTS trg_protect_point_totals ON public.profiles;
CREATE TRIGGER trg_protect_point_totals
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_point_totals();


-- ============================================
-- 4. REGISTO DE EDIÇÕES / ELIMINAÇÕES / CORREÇÕES
-- ============================================

CREATE TABLE IF NOT EXISTS public.points_audit_events (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  action text NOT NULL,                 -- 'UPDATE' | 'DELETE' | 'TOTALS_FIX'
  log_id uuid,                          -- movimento afetado (NULL em TOTALS_FIX)
  target_user_id uuid,                  -- sem FK: o registo sobrevive a contas apagadas
  target_name text,
  performed_by uuid,
  performed_by_name text,
  old_xp integer,
  old_gold integer,
  new_xp integer,
  new_gold integer,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_points_audit_events_created ON public.points_audit_events(created_at DESC);

ALTER TABLE public.points_audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Coordinators can view audit events" ON public.points_audit_events;
CREATE POLICY "Coordinators can view audit events" ON public.points_audit_events FOR SELECT USING (
  public.get_my_real_role() = 'coordenador'
);
-- Sem políticas de escrita: só triggers/RPCs.

CREATE OR REPLACE FUNCTION public.log_points_log_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- Quando a conta é apagada (cascata) o perfil já não existe: não se regista cada movimento.
DROP TRIGGER IF EXISTS trg_log_points_log_delete ON public.points_log;
CREATE TRIGGER trg_log_points_log_delete
  BEFORE DELETE ON public.points_log
  FOR EACH ROW EXECUTE FUNCTION public.log_points_log_change();

DROP TRIGGER IF EXISTS trg_log_points_log_update ON public.points_log;
CREATE TRIGGER trg_log_points_log_update
  AFTER UPDATE ON public.points_log
  FOR EACH ROW EXECUTE FUNCTION public.log_points_log_change();


-- ============================================
-- 5. VISTA DE AUDITORIA
-- ============================================

DROP VIEW IF EXISTS public.points_audit;
CREATE VIEW public.points_audit WITH (security_invoker = true) AS
SELECT
  y.*,
  -- Alerta: pontos atribuídos a si próprio por quem não é coordenador (dirigentes,
  -- ajudantes) fora dos fluxos automáticos, ou atribuídos por alguém sem cargo de
  -- gestão (só possível antes desta migração).
  (
    (y.is_self AND y.category IN ('manual', 'tarefa', 'evento', 'sugestao'))
    OR y.category = 'outro'
  ) AS is_suspicious
FROM (
  SELECT
    x.id, x.created_at, x.target_user_id, x.target_name, x.target_avatar, x.target_section, x.target_role,
    x.awarded_by_user_id, x.awarded_by_name, x.awarded_by_role,
    x.amount_xp, x.amount_gold, x.description, x.event_id, x.is_self,
    -- Coordenador (cargo real) a dar pontos a si próprio: permitido, mas destacado.
    CASE
      WHEN x.is_self AND x.awarded_by_real_role = 'coordenador'
           AND x.base_category IN ('manual', 'tarefa', 'evento', 'sugestao', 'outro') THEN 'auto'
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
      pl.amount_xp,
      pl.amount_gold,
      pl.description,
      pl.event_id,
      (pl.awarded_by_user_id IS NOT NULL AND pl.awarded_by_user_id = pl.target_user_id) AS is_self,
      CASE
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
        WHEN pl.description ILIKE 'VanaQuest%'
          OR pl.description ILIKE '%VanaWords%'                       THEN 'jogo'
        WHEN COALESCE(a.helper_role, a.role)::text IN ('dirigente', 'coordenador') THEN 'manual'
        ELSE 'outro'
      END AS base_category
    FROM public.points_log pl
    LEFT JOIN public.profiles t ON t.id = pl.target_user_id
    LEFT JOIN public.profiles a ON a.id = pl.awarded_by_user_id
  ) x
) y;

GRANT SELECT ON public.points_audit TO authenticated;


-- ============================================
-- 6. RPCs DE AUDITORIA (só coordenação)
-- ============================================

-- Perfis cujos totais não batem com o histórico.
CREATE OR REPLACE FUNCTION public.audit_points_mismatches()
RETURNS TABLE (user_id uuid, full_name text, total_xp integer, current_gold integer, log_xp integer, log_gold integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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

-- Resumo de um período: totais, por origem, top membros, alertas.
CREATE OR REPLACE FUNCTION public.audit_points_overview(p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result json;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Apenas a coordenação pode ver a auditoria.';
  END IF;

  WITH m AS (
    SELECT * FROM public.points_audit
    WHERE (p_from IS NULL OR created_at >= p_from)
      AND (p_to IS NULL OR created_at < p_to)
  )
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
        FROM m GROUP BY category
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

-- Corrige totais que não batem com o histórico e regista a correção.
CREATE OR REPLACE FUNCTION public.audit_fix_totals() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

GRANT EXECUTE ON FUNCTION public.audit_points_mismatches() TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_points_overview(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_fix_totals() TO authenticated;


-- ============================================
-- 7. CORREÇÃO INICIAL (fica registada na auditoria)
-- ============================================
SELECT public.audit_fix_totals() AS perfis_corrigidos;
