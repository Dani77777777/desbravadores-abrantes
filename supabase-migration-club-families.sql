-- Famílias do clube: quem é família de quem (pais, mães, irmãos…), à parte das contas familiares.
-- Não dá acesso a conta nenhuma (isso continua a ser só o responsável da conta familiar).
-- Serve para o Formador de equipas (Modo Famílias) e o VanaCoro manterem a família junta.
--
-- Cada pessoa pertence no máximo a uma família. Os membros criam a família no perfil e convidam
-- os outros por código; a coordenação vê e corrige tudo na administração dos membros.
-- As tabelas só são lidas e escritas pelas ações do servidor (service role), como as contas familiares.

CREATE TABLE IF NOT EXISTS public.club_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.club_family_members (
  family_id uuid NOT NULL REFERENCES public.club_families(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Adulto ou criança (pais e irmãos mais velhos responsáveis são adultos).
  kind text NOT NULL DEFAULT 'adult' CHECK (kind IN ('adult', 'child')),
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, user_id),
  CONSTRAINT club_family_members_one_family UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS club_family_members_family_idx ON public.club_family_members (family_id);

-- Um convite ativo por família (gerar outro substitui o anterior).
CREATE TABLE IF NOT EXISTS public.club_family_invites (
  family_id uuid PRIMARY KEY REFERENCES public.club_families(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.club_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_family_invites ENABLE ROW LEVEL SECURITY;
-- Sem políticas de propósito: o cliente não lê nem escreve diretamente (evita enumerar famílias).

-- Uma família sem ninguém desaparece (quem sai por último, ou contas apagadas).
CREATE OR REPLACE FUNCTION public.delete_empty_club_family()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.club_family_members WHERE family_id = OLD.family_id) THEN
    DELETE FROM public.club_families WHERE id = OLD.family_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS club_family_members_delete_empty ON public.club_family_members;
CREATE TRIGGER club_family_members_delete_empty
  AFTER DELETE ON public.club_family_members
  FOR EACH ROW EXECUTE FUNCTION public.delete_empty_club_family();
