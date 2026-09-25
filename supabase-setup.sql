-- ============================================
-- SUPABASE SETUP - Desbravadores Abrantes
-- ============================================
-- Ficheiro completo e auto-suficiente corrido em 22/02/2026.
-- ============================================

-- ============================================
-- 0. TIPOS PERSONALIZADOS (ENUMS)
-- ============================================
DO $$ BEGIN
  CREATE TYPE public.app_section AS ENUM ('rebentos', 'ticoes', 'exploradores', 'companheiros', 'embaixadores');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('desbravador', 'dirigente', 'coordenador');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- 1. TABELAS PRINCIPAIS
-- ============================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  birth_date date,
  role public.app_role NOT NULL DEFAULT 'desbravador',
  section public.app_section NOT NULL DEFAULT 'rebentos',
  leadership_section public.app_section, -- A secção que o líder coordena
  total_xp integer NOT NULL DEFAULT 0,
  current_gold integer NOT NULL DEFAULT 0,
  is_invested boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Garantir que a coluna existe caso a tabela já tenha sido criada antes sem ela
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS leadership_section public.app_section;

-- Cargos de "Ajudante": dão acesso de gestão (como dirigente/coordenador) sem deixar
-- de ser membro (mantém role='desbravador', continua na leaderboard). Ver secção 11.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS helper_role public.app_role;        -- 'coordenador' | 'dirigente' | NULL
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS helper_section public.app_section;   -- secção quando helper_role='dirigente'

CREATE TABLE IF NOT EXISTS public.points_log (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  awarded_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  amount_xp integer NOT NULL DEFAULT 0,
  amount_gold integer NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Garantir que o default existe caso a tabela já exista
ALTER TABLE public.points_log ALTER COLUMN awarded_by_user_id SET DEFAULT auth.uid();

-- Ligar cada registo de pontos ao evento que o originou (permite reverter eventos)
ALTER TABLE public.points_log ADD COLUMN IF NOT EXISTS event_id uuid;
CREATE INDEX IF NOT EXISTS idx_points_log_event_id ON public.points_log(event_id);

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  message text NOT NULL,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_section text,
  target_role text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  title text NOT NULL,
  description text,
  created_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_section text NULL,
  xp_reward integer NOT NULL DEFAULT 0,
  gold_reward integer NOT NULL DEFAULT 0,
  deadline date NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.task_completions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  points_awarded boolean NOT NULL DEFAULT false,
  awarded_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE(task_id, user_id)
);

-- ============================================
-- 2. FUNÇÕES SECURITY DEFINER (Bypass RLS)
-- ============================================

-- Cargo EFETIVO: o do ajudante (helper_role), se existir; senão o real.
CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(helper_role::text, role::text) FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_section() RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT section::text FROM public.profiles WHERE id = auth.uid();
$$;

-- Secção de liderança EFETIVA: a do ajudante (helper_section), se existir; senão a real.
CREATE OR REPLACE FUNCTION public.get_my_leadership_section() RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(helper_section::text, leadership_section::text) FROM public.profiles WHERE id = auth.uid();
$$;

-- Cargo REAL (sem considerar ajudante) — usado para gatear a gestão de cargos.
CREATE OR REPLACE FUNCTION public.get_my_real_role() RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid();
$$;

-- ============================================
-- 3. RLS POLICIES
-- ============================================

-- PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Leaders can view their charges" ON public.profiles;
DROP POLICY IF EXISTS "Coordinators can view all" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own" ON public.profiles;
DROP POLICY IF EXISTS "Coordinators can update profiles" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Leaders can view their charges" ON public.profiles FOR SELECT 
  USING (public.get_my_role() = 'dirigente' AND section::text = public.get_my_leadership_section());
CREATE POLICY "Coordinators can view all" ON public.profiles FOR SELECT USING (public.get_my_role() = 'coordenador');
CREATE POLICY "Users can update own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Coordinators can update profiles" ON public.profiles FOR UPDATE USING (public.get_my_role() = 'coordenador');

-- SALVAGUARDA DE CARGOS: só o coordenador REAL pode mudar role/leadership/helper.
-- A política acima usa o cargo EFETIVO (para o ajudante-de-coordenação poder fazer
-- gestão geral, ex.: investidura), mas este trigger impede-o de alterar cargos.
-- A RPC assign_helper ativa a flag de bypass para poder nomear ajudantes.
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

-- RPC: nomear / remover ajudante.
--   p_helper_role NULL -> remove (limpa colunas).
--   coordenador real   -> qualquer âmbito (Coordenação ou dirigente de qualquer secção).
--   dirigente real     -> força dirigente da sua própria secção de liderança.
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

  PERFORM set_config('app.allow_role_change', 'on', true);
  UPDATE public.profiles
    SET helper_role = v_new_role,
        helper_section = v_new_section,
        updated_at = now()
    WHERE id = p_target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_helper(uuid, text, text) TO authenticated;

-- RPC: listar todos os membros do clube (para o seletor de nomeação de ajudante).
-- Necessária porque a RLS impede um dirigente de ver membros de outras secções.
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

-- POINTS_LOG
ALTER TABLE public.points_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own points" ON public.points_log;
DROP POLICY IF EXISTS "Authenticated users can insert points" ON public.points_log;

CREATE POLICY "Users can view own points" ON public.points_log FOR SELECT USING (target_user_id = auth.uid() OR awarded_by_user_id = auth.uid());
CREATE POLICY "Authenticated users can insert points" ON public.points_log FOR INSERT WITH CHECK (auth.uid() = awarded_by_user_id);

-- ANNOUNCEMENTS
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view relevant announcements" ON public.announcements;
DROP POLICY IF EXISTS "Authenticated users can create announcements" ON public.announcements;
DROP POLICY IF EXISTS "Leaders can create announcements" ON public.announcements;

CREATE POLICY "Users can view relevant announcements" ON public.announcements FOR SELECT USING (
    -- Author always sees their own sent messages
    author_id = auth.uid()
    -- Personal messages
    OR target_user_id = auth.uid()
    -- When target_role IS set → only users with that role see it
    -- (also checks section if one is specified)
    OR (
        target_role IS NOT NULL
        AND target_role = public.get_my_role()
        AND (
            target_section IS NULL
            OR target_section = public.get_my_section()
            OR target_section = public.get_my_leadership_section()
        )
    )
    -- When target_section is set but NO target_role → any member of that section
    OR (
        target_role IS NULL
        AND target_user_id IS NULL
        AND target_section IS NOT NULL
        AND (
            target_section = public.get_my_section()
            OR target_section = public.get_my_leadership_section()
        )
    -- Global messages (sent to everyone)
    OR (
        target_role IS NULL
        AND target_section IS NULL
        AND target_user_id IS NULL
    )
);
CREATE POLICY "Leaders can create announcements" ON public.announcements FOR INSERT WITH CHECK (
    auth.uid() = author_id
    AND public.get_my_role() IN ('dirigente', 'coordenador')
);
CREATE POLICY "Authors can delete their announcements" ON public.announcements FOR DELETE USING (
    auth.uid() = author_id OR public.get_my_role() = 'coordenador'
);

-- TASKS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View relevant tasks" ON public.tasks;
DROP POLICY IF EXISTS "Leaders can create tasks" ON public.tasks;
DROP POLICY IF EXISTS "Task creators can update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Task creators can delete tasks" ON public.tasks;

CREATE POLICY "View relevant tasks" ON public.tasks FOR SELECT USING (
  target_section IS NULL 
  OR target_section = public.get_my_section()
  OR target_section = public.get_my_leadership_section()
  OR public.get_my_role() = 'coordenador'
);
CREATE POLICY "Leaders can create tasks" ON public.tasks FOR INSERT WITH CHECK (
  auth.uid() = created_by_user_id AND public.get_my_role() IN ('dirigente', 'coordenador')
);
CREATE POLICY "Task creators can update tasks" ON public.tasks FOR UPDATE USING (
  created_by_user_id = auth.uid() OR public.get_my_role() = 'coordenador'
);
CREATE POLICY "Task creators can delete tasks" ON public.tasks FOR DELETE USING (
  created_by_user_id = auth.uid() OR public.get_my_role() = 'coordenador'
);

-- TASK_COMPLETIONS
ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view relevant completions" ON public.task_completions;
DROP POLICY IF EXISTS "Desbravadores can mark tasks complete" ON public.task_completions;
DROP POLICY IF EXISTS "Leaders can award points on completions" ON public.task_completions;
DROP POLICY IF EXISTS "Leaders can delete completions" ON public.task_completions;

CREATE POLICY "Users can view relevant completions" ON public.task_completions FOR SELECT USING (
    user_id = auth.uid()
    OR public.get_my_role() = 'coordenador'
    OR (
      public.get_my_role() = 'dirigente'
      AND (SELECT section::text FROM public.profiles WHERE id = user_id) = public.get_my_leadership_section()
    )
);
CREATE POLICY "Desbravadores can mark tasks complete" ON public.task_completions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Leaders can award points on completions" ON public.task_completions FOR UPDATE USING (
    public.get_my_role() = 'coordenador'
    OR (
      public.get_my_role() = 'dirigente'
      AND (SELECT section::text FROM public.profiles WHERE id = user_id) = public.get_my_leadership_section()
    )
);
CREATE POLICY "Leaders can delete completions" ON public.task_completions FOR DELETE USING (
    public.get_my_role() = 'coordenador'
    OR (
      public.get_my_role() = 'dirigente'
      AND (SELECT section::text FROM public.profiles WHERE id = user_id) = public.get_my_leadership_section()
    )
);

-- ============================================
-- 4. CICLO DE VIDA (Idade e Secção)
-- ============================================

CREATE OR REPLACE FUNCTION public.calculate_section(birth_date date) RETURNS public.app_section LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN date_part('year', age(birth_date)) BETWEEN 3  AND 5  THEN 'rebentos'::public.app_section
    WHEN date_part('year', age(birth_date)) BETWEEN 6  AND 10 THEN 'ticoes'::public.app_section
    WHEN date_part('year', age(birth_date)) BETWEEN 11 AND 15 THEN 'exploradores'::public.app_section
    WHEN date_part('year', age(birth_date)) BETWEEN 16 AND 23 THEN 'companheiros'::public.app_section
    ELSE 'embaixadores'::public.app_section
  END;
$$;

CREATE OR REPLACE FUNCTION public.handle_lifecycle_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_section public.app_section;
  kid_name text;
BEGIN
  kid_name := COALESCE(NEW.full_name, 'Desbravador');

  -- 1. Mudança de Secção por Idade
  IF NEW.birth_date IS NOT NULL THEN
    new_section := public.calculate_section(NEW.birth_date);
    IF (OLD.section IS DISTINCT FROM new_section) THEN
      NEW.section := new_section;
      NEW.is_invested := false; -- Perde investidura ao subir de classe
      
      INSERT INTO public.announcements (title, message, target_user_id)
      VALUES (
        'Nova Etapa! 🆙',
        'Parabéns, ' || kid_name || '! Passaste para os ' || upper(new_section::text) || '. Prepara-te para a tua nova investidura!',
        NEW.id
      );
    END IF;
  END IF;

  -- 2. Cerimónia de Investidura (Check marcado manual)
  IF (OLD.is_invested = false AND NEW.is_invested = true) THEN
    INSERT INTO public.announcements (title, message, target_user_id)
    VALUES (
      'Investidura Concluída! 🧣',
      'Parabéns, ' || kid_name || '! És agora oficialmente um membro investido dos ' || upper(NEW.section::text) || '. Usa o teu lenço com orgulho!',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_lifecycle ON public.profiles;
CREATE TRIGGER on_profile_lifecycle BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE public.handle_lifecycle_changes();

-- ============================================
-- 5. AUTOMAÇÃO DE PONTOS (Sincronização)
-- ============================================

-- Função para atualizar totais de XP e Gold automaticamente ao alterar o log (Recálculo total para evitar erros)
CREATE OR REPLACE FUNCTION public.update_profile_totals() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
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

DROP TRIGGER IF EXISTS on_points_log_change ON public.points_log;
CREATE TRIGGER on_points_log_change AFTER INSERT OR UPDATE OR DELETE ON public.points_log
FOR EACH ROW EXECUTE PROCEDURE public.update_profile_totals();

-- Remover gatilho antigo se existir (limpeza)
DROP TRIGGER IF EXISTS on_points_log_insert ON public.points_log;

-- 1 ⚠️ SINCRONIZAÇÃO INICIAL (Correção de erros passados)
-- Este comando recalcula os totais baseados no histórico real de cada utilizador.
UPDATE public.profiles p
SET 
  total_xp = COALESCE((SELECT SUM(amount_xp) FROM public.points_log WHERE target_user_id = p.id), 0),
  current_gold = COALESCE((SELECT SUM(amount_gold) FROM public.points_log WHERE target_user_id = p.id), 0)
WHERE p.role = 'desbravador';

-- ============================================
-- 6. TRANSFERÊNCIA DE GOLD
-- ============================================

CREATE OR REPLACE FUNCTION public.transfer_gold(recipient_id uuid, amount integer, transfer_description text DEFAULT 'Transferência de Gold')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
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

-- ============================================
-- 6. SUGESTÕES E CRÍTICAS
-- ============================================

CREATE TABLE IF NOT EXISTS public.suggestions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  target text NOT NULL CHECK (target IN ('dirigente', 'coordenador')),
  content text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  points_awarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own suggestions" ON public.suggestions;
DROP POLICY IF EXISTS "Users can insert suggestions" ON public.suggestions;
DROP POLICY IF EXISTS "Users can delete own suggestions" ON public.suggestions;
DROP POLICY IF EXISTS "Leaders can view suggestions" ON public.suggestions;
DROP POLICY IF EXISTS "Leaders can mark suggestions as read" ON public.suggestions;

CREATE POLICY "Users can view own suggestions" ON public.suggestions 
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert suggestions" ON public.suggestions 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own suggestions" ON public.suggestions 
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Leaders can view suggestions" ON public.suggestions 
  FOR SELECT USING (
    public.get_my_role() = 'coordenador'
    OR (
      public.get_my_role() = 'dirigente'
      AND target = 'dirigente'
      AND (SELECT section::text FROM public.profiles WHERE id = user_id) = public.get_my_leadership_section()
    )
  );

CREATE POLICY "Leaders can mark suggestions as read" ON public.suggestions 
  FOR UPDATE USING (
    public.get_my_role() = 'coordenador'
    OR (
      public.get_my_role() = 'dirigente'
      AND target = 'dirigente'
      AND (SELECT section::text FROM public.profiles WHERE id = user_id) = public.get_my_leadership_section()
    )
  );

-- ============================================
-- 7. LEADERBOARD (Ranking Público)
-- ============================================

-- Vista pública para o ranking
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT 
    id,
    full_name,
    avatar_url,
    -- Dirigentes: a secção que lideram.
    CASE WHEN role = 'dirigente' THEN COALESCE(leadership_section, section) ELSE section END AS section,
    role,
    total_xp,
    current_gold,
    (total_xp + current_gold) as combined_score,
    is_invested
FROM public.profiles
WHERE role IN ('desbravador', 'dirigente')
ORDER BY total_xp DESC;

-- Permissões para acesso anónimo à vista
GRANT SELECT ON public.leaderboard TO anon;
GRANT SELECT ON public.leaderboard TO authenticated;

-- Política para permitir que qualquer pessoa veja os dados básicos de desbravadores (necessário para a vista)
CREATE POLICY "Public can view desbravador leaderboard info" ON public.profiles
FOR SELECT
USING (role = 'desbravador');

COMMENT ON VIEW public.leaderboard IS 'Public view for the club leaderboard: desbravadores and dirigentes (not coordenadores).';

-- ============================================
-- 8. EVENTOS E AGENDA
-- ============================================

DO $$ BEGIN
  CREATE TYPE public.attendance_status AS ENUM ('presente', 'atrasado', 'faltou');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.events (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  title text NOT NULL,
  description text,
  location text,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  target_section text,
  xp_reward integer NOT NULL DEFAULT 0,
  gold_reward integer NOT NULL DEFAULT 0,
  late_discount_percent float NOT NULL DEFAULT 0.25,
  absent_penalty_percent float NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_finished boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_attendance (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status public.attendance_status NOT NULL DEFAULT 'presente',
  points_awarded boolean NOT NULL DEFAULT false,
  awarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- RLS para EVENTOS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View relevant events" ON public.events;
CREATE POLICY "View relevant events" ON public.events FOR SELECT USING (
  target_section IS NULL 
  OR target_section = public.get_my_section()
  OR target_section = public.get_my_leadership_section()
  OR public.get_my_role() = 'coordenador'
);

DROP POLICY IF EXISTS "Leaders can manage events" ON public.events;
CREATE POLICY "Leaders can manage events" ON public.events FOR ALL USING (
  public.get_my_role() = 'coordenador'
  OR (
    public.get_my_role() = 'dirigente' 
    AND (target_section = public.get_my_leadership_section())
  )
);

-- RLS para PRESENÇAS
ALTER TABLE public.event_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own attendance" ON public.event_attendance;
CREATE POLICY "Users can view own attendance" ON public.event_attendance FOR SELECT USING (
  user_id = auth.uid()
  OR public.get_my_role() = 'coordenador'
  OR (
    public.get_my_role() = 'dirigente'
    AND (SELECT section::text FROM public.profiles WHERE id = user_id) = public.get_my_leadership_section()
  )
);

DROP POLICY IF EXISTS "Leaders can manage attendance" ON public.event_attendance;
CREATE POLICY "Leaders can manage attendance" ON public.event_attendance FOR ALL USING (
  public.get_my_role() = 'coordenador'
  OR (
    public.get_my_role() = 'dirigente'
    AND (SELECT section::text FROM public.profiles WHERE id = user_id) = public.get_my_leadership_section()
  )
);

-- Chave estrangeira points_log -> events (criada agora que a tabela events existe)
DO $$ BEGIN
  ALTER TABLE public.points_log
    ADD CONSTRAINT points_log_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Reverter a atribuição de pontos de um evento finalizado.
-- Remove os pontos atribuídos, marca as presenças como não atribuídas e reabre o evento.
CREATE OR REPLACE FUNCTION public.revert_event_points(p_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_role text := public.get_my_role();
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado.';
  END IF;

  -- Apenas coordenador, ou dirigente da secção-alvo do evento (mesma regra da gestão de eventos)
  IF NOT (
    v_role = 'coordenador'
    OR (v_role = 'dirigente' AND v_event.target_section = public.get_my_leadership_section())
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

GRANT EXECUTE ON FUNCTION public.revert_event_points(uuid) TO authenticated;

-- ============================================
-- 9. SETUP DE STORAGE (Imagens de Perfil)
-- ============================================

-- Tentar criar o bucket 'imagens' se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('imagens', 'imagens', true)
ON CONFLICT (id) DO NOTHING;

-- POLÍTICAS DE STORAGE
-- Permitir que qualquer pessoa veja as imagens (bucket público)
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'imagens' );

-- Permitir que utilizadores autenticados façam upload para a pasta avatars/
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'imagens' 
  AND (storage.foldername(name))[1] = 'avatars'
);

-- Permitir que os utilizadores atualizem/apaguem os seus próprios ficheiros
DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
CREATE POLICY "Users can update their own avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'imagens' AND owner = auth.uid() );

DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;
CREATE POLICY "Users can delete their own avatars"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'imagens' AND owner = auth.uid() );

-- Imagens de produtos da loja (pasta products/) — só coordenadores escrevem.
-- A leitura já é pública pela política "Public Access" acima.
DROP POLICY IF EXISTS "Coordinators can upload product images" ON storage.objects;
CREATE POLICY "Coordinators can upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'imagens'
  AND (storage.foldername(name))[1] = 'products'
  AND public.get_my_role() = 'coordenador'
);

DROP POLICY IF EXISTS "Coordinators can update product images" ON storage.objects;
CREATE POLICY "Coordinators can update product images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'imagens'
  AND (storage.foldername(name))[1] = 'products'
  AND public.get_my_role() = 'coordenador'
);

DROP POLICY IF EXISTS "Coordinators can delete product images" ON storage.objects;
CREATE POLICY "Coordinators can delete product images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'imagens'
  AND (storage.foldername(name))[1] = 'products'
  AND public.get_my_role() = 'coordenador'
);
