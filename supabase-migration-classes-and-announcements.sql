-- ============================================
-- MIGRAÇÃO: Mudança de classe + Comunicados com destinatários
-- ============================================
-- PARTE 1 — MUDANÇA DE CLASSE
--   Antes: o trigger recalculava a classe pela idade em QUALQUER update ao perfil
--   (incluindo cada vez que se davam pontos). Uma mudança manual feita pela
--   coordenação era revertida sozinha, a investidura era apagada e o membro recebia
--   um aviso "Nova Etapa" repetido.
--   Agora:
--     • A classe só é calculada pela idade na criação do perfil (onboarding).
--     • Depois disso, só muda quando a coordenação muda (manualmente ou aceitando
--       as sugestões por idade no painel de Membros).
--     • Cada mudança fica registada em `section_changes` (histórico).
--     • A coordenação escolhe se reinicia a investidura e se avisa o membro.
--     • Membros já não conseguem alterar a própria classe/investidura via API.
--     • Dirigentes passam a conseguir marcar a investidura dos membros da sua classe.
--
-- PARTE 2 — COMUNICADOS
--   Antes: quem via cada comunicado era decidido na leitura, com regras diferentes
--   no Painel, nas RLS e nas notificações push. Quem mudava de classe passava a ver
--   os avisos antigos da classe nova e perdia os da antiga.
--   Agora:
--     • Ao enviar, os destinatários ficam gravados em `announcement_recipients`
--       (uma única regra, usada pelo Painel, RLS e push).
--     • Envio para vários membros específicos.
--     • Estado "lido" por destinatário (o autor vê quem leu).
--
-- Corre este ficheiro inteiro no SQL Editor do Supabase. É idempotente.
-- Depois faz deploy da Edge Function `send-push` (foi atualizada).
-- ============================================


-- ============================================
-- PARTE 1 — MUDANÇA DE CLASSE
-- ============================================

-- 1.1 Etiquetas e ordem das classes ---------------------------------------------
CREATE OR REPLACE FUNCTION public.section_label(s text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE s
    WHEN 'rebentos'     THEN 'Rebentos'
    WHEN 'ticoes'       THEN 'Tições'
    WHEN 'exploradores' THEN 'Exploradores'
    WHEN 'companheiros' THEN 'Companheiros'
    WHEN 'embaixadores' THEN 'Embaixadores'
    ELSE initcap(s)
  END;
$$;

CREATE OR REPLACE FUNCTION public.section_rank(s text) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE s
    WHEN 'rebentos' THEN 1 WHEN 'ticoes' THEN 2 WHEN 'exploradores' THEN 3
    WHEN 'companheiros' THEN 4 WHEN 'embaixadores' THEN 5 ELSE 0
  END;
$$;

-- 1.2 Histórico de mudanças de classe -------------------------------------------
CREATE TABLE IF NOT EXISTS public.section_changes (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_section public.app_section,
  to_section public.app_section NOT NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT 'manual',          -- 'manual' | 'idade' | 'onboarding'
  investiture_reset boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_section_changes_user ON public.section_changes(user_id, created_at DESC);

ALTER TABLE public.section_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View relevant section changes" ON public.section_changes;
CREATE POLICY "View relevant section changes" ON public.section_changes FOR SELECT USING (
  user_id = auth.uid()
  OR public.get_my_role() = 'coordenador'
  OR (
    public.get_my_role() = 'dirigente'
    AND (to_section::text = public.get_my_leadership_section() OR from_section::text = public.get_my_leadership_section())
  )
);
-- Sem políticas de escrita: só o trigger (SECURITY DEFINER) insere.

-- Sugestão por idade que a coordenação decidiu ignorar (volta a aparecer se a sugestão mudar).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS dismissed_section_suggestion public.app_section;

-- 1.3 Trigger de ciclo de vida (substitui o antigo) --------------------------------
CREATE OR REPLACE FUNCTION public.handle_lifecycle_changes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

DROP TRIGGER IF EXISTS on_profile_lifecycle ON public.profiles;
CREATE TRIGGER on_profile_lifecycle
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.handle_lifecycle_changes();

-- 1.4 RPC: mudar a classe de um membro (coordenação) --------------------------------
CREATE OR REPLACE FUNCTION public.change_member_section(
  p_member_id uuid,
  p_section text,
  p_reset_investiture boolean DEFAULT true,
  p_notify boolean DEFAULT true
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- 1.5 RPC: sugestões de mudança por idade ---------------------------------------------
DROP FUNCTION IF EXISTS public.list_section_suggestions();
CREATE OR REPLACE FUNCTION public.list_section_suggestions()
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  birth_date date,
  age int,
  section public.app_section,
  suggested_section public.app_section,
  is_invested boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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

-- 1.6 RPC: aplicar sugestões por idade (em lote) --------------------------------------
CREATE OR REPLACE FUNCTION public.apply_age_sections(
  p_member_ids uuid[],
  p_reset_investiture boolean DEFAULT true,
  p_notify boolean DEFAULT true
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- 1.7 RPC: ignorar a sugestão atual de um membro -------------------------------------
CREATE OR REPLACE FUNCTION public.dismiss_section_suggestion(p_member_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;
  UPDATE public.profiles
     SET dismissed_section_suggestion = public.calculate_section(birth_date)
   WHERE id = p_member_id AND birth_date IS NOT NULL;
END;
$$;

-- 1.8 RPC: marcar investidura (coordenação ou dirigente da classe) ---------------------
-- Os dirigentes não têm UPDATE em `profiles` pelas RLS; esta função valida e aplica.
CREATE OR REPLACE FUNCTION public.set_member_invested(p_member_id uuid, p_invested boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_section text;
BEGIN
  SELECT section::text INTO v_section FROM public.profiles WHERE id = p_member_id;
  IF v_section IS NULL THEN
    RAISE EXCEPTION 'Membro não encontrado.';
  END IF;

  IF NOT (
    public.get_my_role() = 'coordenador'
    OR (public.get_my_role() = 'dirigente' AND v_section = public.get_my_leadership_section())
  ) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a investidura deste membro.';
  END IF;

  UPDATE public.profiles SET is_invested = p_invested WHERE id = p_member_id;
END;
$$;


-- ============================================
-- PARTE 2 — COMUNICADOS COM DESTINATÁRIOS
-- ============================================

-- 2.1 Colunas novas -------------------------------------------------------------
-- audience: 'global' | 'desbravadores' | 'dirigentes' | 'section' | 'section_leaders' | 'member' | 'members'
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS audience text;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS author_name text;

-- 2.2 Destinatários --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcement_recipients (
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_announcement_recipients_user ON public.announcement_recipients(user_id, created_at DESC);

-- 2.3 Regra ÚNICA de quem recebe ----------------------------------------------------
--   member(s)        → esses membros
--   desbravadores    → todos com cargo real 'desbravador' (ajudantes incluídos)
--   dirigentes       → dirigentes (reais ou ajudantes de dirigente)
--   section_leaders  → dirigentes (reais ou ajudantes) que lideram a classe
--   section          → membros da classe + dirigentes que a lideram
--   global           → todos
-- O autor nunca é destinatário (vê o comunicado no histórico de enviados).
CREATE OR REPLACE FUNCTION public.resolve_announcement_recipients(
  p_target_user_id uuid,
  p_target_section text,
  p_target_role text,
  p_author_id uuid
) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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

-- 2.4 Trigger: grava destinatários ao inserir (também apanha inserts diretos, ex. eventos)
CREATE OR REPLACE FUNCTION public.fill_announcement_recipients() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

DROP TRIGGER IF EXISTS on_announcement_created ON public.announcements;
CREATE TRIGGER on_announcement_created
  AFTER INSERT ON public.announcements
  FOR EACH ROW EXECUTE PROCEDURE public.fill_announcement_recipients();

-- 2.5 Backfill: comunicados antigos (com as classes ATUAIS; ficam marcados como lidos)
INSERT INTO public.announcement_recipients (announcement_id, user_id, read_at, created_at)
SELECT a.id, r, now(), a.created_at
FROM public.announcements a
CROSS JOIN LATERAL public.resolve_announcement_recipients(a.target_user_id, a.target_section, a.target_role, a.author_id) AS r
WHERE NOT EXISTS (SELECT 1 FROM public.announcement_recipients x WHERE x.announcement_id = a.id)
ON CONFLICT DO NOTHING;

UPDATE public.announcements a
   SET author_name = p.full_name
  FROM public.profiles p
 WHERE a.author_id = p.id AND a.author_name IS NULL;

-- 2.6 Helpers para RLS (SECURITY DEFINER evita recursão entre as duas tabelas) ----------
CREATE OR REPLACE FUNCTION public.is_announcement_recipient(p_announcement_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.announcement_recipients
    WHERE announcement_id = p_announcement_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_announcement_author(p_announcement_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.announcements
    WHERE id = p_announcement_id AND author_id = auth.uid()
  );
$$;

-- 2.7 RLS ---------------------------------------------------------------------------
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view relevant announcements" ON public.announcements;
CREATE POLICY "Users can view relevant announcements" ON public.announcements FOR SELECT USING (
  author_id = auth.uid()
  OR public.get_my_role() = 'coordenador'
  OR public.is_announcement_recipient(id)
);

-- Inserts diretos (ex.: avisos automáticos de eventos): dirigentes só para a própria classe.
DROP POLICY IF EXISTS "Leaders can create announcements" ON public.announcements;
CREATE POLICY "Leaders can create announcements" ON public.announcements FOR INSERT WITH CHECK (
  auth.uid() = author_id
  AND (
    public.get_my_role() = 'coordenador'
    OR (
      public.get_my_role() = 'dirigente'
      AND target_user_id IS NULL
      AND target_role IS NULL
      AND target_section = COALESCE(public.get_my_leadership_section(), public.get_my_section())
    )
  )
);

ALTER TABLE public.announcement_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View relevant recipients" ON public.announcement_recipients;
CREATE POLICY "View relevant recipients" ON public.announcement_recipients FOR SELECT USING (
  user_id = auth.uid()
  OR public.get_my_role() = 'coordenador'
  OR public.is_announcement_author(announcement_id)
);
-- Escrita só via trigger/RPCs.

-- 2.8 RPC: enviar comunicado --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_announcement(
  p_title text,
  p_message text,
  p_audience text,
  p_section text DEFAULT NULL,
  p_member_ids uuid[] DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- 2.9 RPC: marcar comunicados como lidos ----------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_announcements_read(p_ids uuid[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.announcement_recipients
     SET read_at = now()
   WHERE user_id = auth.uid()
     AND announcement_id = ANY(p_ids)
     AND read_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.change_member_section(uuid, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_section_suggestions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_age_sections(uuid[], boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_section_suggestion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_invested(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_announcement(text, text, text, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_announcements_read(uuid[]) TO authenticated;
