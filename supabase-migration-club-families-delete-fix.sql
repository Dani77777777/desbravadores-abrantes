-- ============================================================================
-- Apagar contas que estão numa família
-- ============================================================================
-- Ao apagar uma conta, o Supabase Auth apaga a linha em auth.users com o papel
-- supabase_auth_admin. A cascata apaga o membro da família e o trigger
-- club_family_members_delete_empty corria com esse papel, que não tem acesso a
-- club_family_members: "permission denied for table club_family_members", e o
-- Auth devolvia "Database error deleting user".
-- A função passa a SECURITY DEFINER (corre como o dono), como as outras
-- funções de trigger que mexem em tabelas sem políticas.
-- Pode correr-se mais do que uma vez.

CREATE OR REPLACE FUNCTION public.delete_empty_club_family()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.club_family_members WHERE family_id = OLD.family_id) THEN
    DELETE FROM public.club_families WHERE id = OLD.family_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Só o trigger a chama: ninguém precisa de a executar diretamente.
REVOKE ALL ON FUNCTION public.delete_empty_club_family() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_empty_club_family() TO service_role;
