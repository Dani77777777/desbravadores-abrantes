-- ============================================
-- MIGRAÇÃO: Salvaguardas nas mudanças de cargo
-- ============================================
-- 1. O clube nunca fica sem coordenador: não é possível retirar o cargo ao
--    último coordenador (nem ao próprio). Primeiro promove-se outra pessoa.
-- 2. Promover um ajudante a dirigente/coordenador remove o cargo de ajudante.
--    Antes ficava gravado e tinha prioridade (get_my_role usa COALESCE(helper_role, role)),
--    por isso um "Ajudante · Rebentos" promovido a Coordenador continuava a ser
--    tratado como dirigente dos Rebentos.
--
-- O SQL Editor / service role (auth.uid() NULL) não é bloqueado, para ser sempre
-- possível recuperar a coordenação em caso de emergência.
-- Corre no SQL Editor do Supabase. É idempotente.
-- ============================================

CREATE OR REPLACE FUNCTION public.normalize_role_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- 1. Último coordenador
  IF OLD.role = 'coordenador' AND NEW.role <> 'coordenador' AND auth.uid() IS NOT NULL THEN
    PERFORM 1 FROM public.profiles WHERE role = 'coordenador' AND id <> OLD.id LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Não é possível retirar o cargo ao último coordenador. Promove primeiro outra pessoa a coordenador.';
    END IF;
  END IF;

  -- 2. Promoção de ajudante → deixa de ser ajudante
  IF NEW.role IN ('dirigente', 'coordenador') THEN
    NEW.helper_role := NULL;
    NEW.helper_section := NULL;
  END IF;

  -- Só dirigentes têm classe de liderança
  IF NEW.role <> 'dirigente' THEN
    NEW.leadership_section := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- O nome começa por "trg_n" para correr antes de "trg_protect_role_columns"
-- (os triggers BEFORE correm por ordem alfabética).
DROP TRIGGER IF EXISTS trg_normalize_role_change ON public.profiles;
CREATE TRIGGER trg_normalize_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_role_change();

-- Limpeza de dados existentes: dirigentes/coordenadores que ainda têm cargo de ajudante.
UPDATE public.profiles
   SET helper_role = NULL, helper_section = NULL
 WHERE role IN ('dirigente', 'coordenador')
   AND (helper_role IS NOT NULL OR helper_section IS NOT NULL);
