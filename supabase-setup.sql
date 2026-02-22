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

CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_section() RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT section::text FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_leadership_section() RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT leadership_section::text FROM public.profiles WHERE id = auth.uid();
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

CREATE POLICY "Users can view relevant announcements" ON public.announcements FOR SELECT USING (
    (target_user_id IS NULL AND target_section IS NULL AND target_role IS NULL)
    OR target_user_id = auth.uid()
    OR target_section = public.get_my_section()
    OR target_section = public.get_my_leadership_section()
    OR target_role = public.get_my_role()
);
CREATE POLICY "Authenticated users can create announcements" ON public.announcements FOR INSERT WITH CHECK (auth.uid() = author_id);

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

-- Função para atualizar totais de XP e Gold automaticamente ao inserir no log
CREATE OR REPLACE FUNCTION public.update_profile_totals() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles
  SET 
    total_xp = GREATEST(0, total_xp + NEW.amount_xp),
    current_gold = GREATEST(0, current_gold + NEW.amount_gold),
    updated_at = now()
  WHERE id = NEW.target_user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_points_log_insert ON public.points_log;
CREATE TRIGGER on_points_log_insert AFTER INSERT ON public.points_log
FOR EACH ROW EXECUTE PROCEDURE public.update_profile_totals();

-- 1 ⚠️ SINCRONIZAÇÃO INICIAL (Correção de erros passados)
-- Este comando recalcula os totais baseados no histórico real de cada utilizador.
UPDATE public.profiles p
SET 
  total_xp = COALESCE((SELECT SUM(amount_xp) FROM public.points_log WHERE target_user_id = p.id), 0),
  current_gold = COALESCE((SELECT SUM(amount_gold) FROM public.points_log WHERE target_user_id = p.id), 0)
WHERE p.role = 'desbravador';

