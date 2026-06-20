-- ============================================
-- MIGRAÇÃO: Cargos de "Ajudante" (helpers de cargos)
-- ============================================
-- Permite atribuir a membros (role='desbravador') um acesso de gestão equivalente
-- a um líder (dirigente de uma secção) ou ao coordenador, SEM deixarem de ser
-- membros — ou seja, continuam a aparecer na leaderboard e a ganhar XP/Ouro.
--
-- Ideia central: as 3 funções SECURITY DEFINER usadas em todas as RLS passam a
-- devolver o valor EFETIVO (do ajudante, se existir). Assim, todas as políticas
-- existentes (eventos, tarefas, presenças, comunicados, ver perfis) dão acesso ao
-- ajudante sem qualquer alteração. A view da leaderboard usa a coluna crua `role`,
-- por isso o ajudante mantém-se no ranking.
-- ============================================

-- 1. COLUNAS NOVAS ---------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS helper_role public.app_role;        -- 'coordenador' | 'dirigente' | NULL
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS helper_section public.app_section;   -- secção quando helper_role='dirigente'

-- 2. FUNÇÕES EFETIVAS ------------------------------------------------------------
-- Devolve o cargo efetivo: o do ajudante, se existir; senão o real.
CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(helper_role::text, role::text) FROM public.profiles WHERE id = auth.uid();
$$;

-- Devolve a secção de liderança efetiva: a do ajudante, se existir; senão a real.
CREATE OR REPLACE FUNCTION public.get_my_leadership_section() RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(helper_section::text, leadership_section::text) FROM public.profiles WHERE id = auth.uid();
$$;

-- Cargo REAL (sem considerar ajudante) — usado para gatear a gestão de cargos.
CREATE OR REPLACE FUNCTION public.get_my_real_role() RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid();
$$;

-- get_my_section() mantém-se inalterada (devolve sempre a secção pessoal real).

-- 3. SALVAGUARDA: só coordenador REAL pode mudar cargos -------------------------
-- (Os ajudantes — incluindo ajudantes-de-coordenação — não podem gerir cargos.)
-- A nomeação de ajudantes é feita pela RPC assign_helper, que ativa a flag de bypass.
CREATE OR REPLACE FUNCTION public.protect_role_columns() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (
        NEW.role               IS DISTINCT FROM OLD.role
     OR NEW.leadership_section IS DISTINCT FROM OLD.leadership_section
     OR NEW.helper_role        IS DISTINCT FROM OLD.helper_role
     OR NEW.helper_section     IS DISTINCT FROM OLD.helper_section
  )
  AND COALESCE(current_setting('app.allow_role_change', true), '') <> 'on'
  AND public.get_my_real_role() <> 'coordenador'
  THEN
    RAISE EXCEPTION 'Sem permissão para alterar cargos.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_role_columns ON public.profiles;
CREATE TRIGGER trg_protect_role_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_role_columns();

-- 4. RPC: nomear / remover ajudante ---------------------------------------------
-- p_helper_role NULL  -> remove o ajudante (limpa as colunas).
-- coordenador real    -> qualquer âmbito (Coordenação ou dirigente de qualquer secção).
-- dirigente real      -> força helper_role='dirigente' e helper_section = sua leadership_section.
CREATE OR REPLACE FUNCTION public.assign_helper(
  p_target_id uuid,
  p_helper_role text DEFAULT NULL,
  p_helper_section text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_real_role text := public.get_my_real_role();
  v_my_section text;
  v_target_role text;
  v_target_helper_role text;
  v_target_helper_section text;
  v_new_role public.app_role;
  v_new_section public.app_section;
BEGIN
  IF v_real_role NOT IN ('coordenador', 'dirigente') THEN
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

GRANT EXECUTE ON FUNCTION public.assign_helper(uuid, text, text) TO authenticated;

-- 5. RPC: listar todos os membros do clube (para o seletor de nomeação) ----------
-- Necessária porque a RLS impede um dirigente de ver membros de outras secções,
-- mas ele pode nomear qualquer pessoa do clube como ajudante.
CREATE OR REPLACE FUNCTION public.list_club_members_for_assignment()
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  section public.app_section,
  role public.app_role,
  helper_role public.app_role,
  helper_section public.app_section
) LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  IF public.get_my_real_role() NOT IN ('coordenador', 'dirigente') THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;

  RETURN QUERY
    SELECT p.id, p.full_name, p.avatar_url, p.section, p.role, p.helper_role, p.helper_section
    FROM public.profiles p
    WHERE p.role = 'desbravador'
    ORDER BY p.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_club_members_for_assignment() TO authenticated;
