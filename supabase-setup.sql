-- ============================================
-- SUPABASE SETUP - Desbravadores Abrantes
-- ============================================
-- Execute este SQL no Supabase SQL Editor
-- Ordem: Execute tudo de uma vez

-- ============================================
-- 1. TRIGGER: Criar perfil automaticamente
-- ============================================

-- Função que cria o perfil quando utilizador se regista
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, role, section, total_xp, current_gold, is_invested)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    'desbravador',
    'rebentos',
    0,
    0,
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger que executa quando um utilizador é criado
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 2. RLS POLICIES - Tabela PROFILES
-- ============================================

-- Ativar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas (se existirem)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Coordinators can view section profiles" ON public.profiles;
DROP POLICY IF EXISTS "Coordinators can update section profiles" ON public.profiles;

-- Utilizadores podem ver o próprio perfil
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Utilizadores podem inserir o próprio perfil
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Utilizadores podem atualizar o próprio perfil
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- ============================================
-- 3. RLS POLICIES - Tabela POINTS_LOG
-- ============================================

ALTER TABLE public.points_log ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas
DROP POLICY IF EXISTS "Users can view own points" ON public.points_log;
DROP POLICY IF EXISTS "Coordinators can insert points" ON public.points_log;

-- Utilizadores podem ver os próprios registos
CREATE POLICY "Users can view own points"
  ON public.points_log
  FOR SELECT
  USING (target_user_id = auth.uid() OR awarded_by_user_id = auth.uid());

-- Qualquer utilizador autenticado pode inserir pontos (será validado pela aplicação)
CREATE POLICY "Authenticated users can insert points"
  ON public.points_log
  FOR INSERT
  WITH CHECK (auth.uid() = awarded_by_user_id);

-- ============================================
-- 4. RLS POLICIES - Tabela ANNOUNCEMENTS
-- ============================================

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas
DROP POLICY IF EXISTS "Users can view relevant announcements" ON public.announcements;
DROP POLICY IF EXISTS "Coordinators can create announcements" ON public.announcements;

-- Todos podem ver avisos públicos
CREATE POLICY "Users can view announcements"
  ON public.announcements
  FOR SELECT
  USING (true);

-- Utilizadores autenticados podem criar avisos
CREATE POLICY "Authenticated users can create announcements"
  ON public.announcements
  FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- ============================================
-- VERIFICAÇÃO
-- ============================================
-- Execute estas queries para verificar se tudo está OK:

-- Ver utilizadores criados
-- SELECT id, email, created_at FROM auth.users;

-- Ver perfis criados
-- SELECT id, full_name, role, section, birth_date FROM public.profiles;

-- Ver políticas RLS ativas
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public';
