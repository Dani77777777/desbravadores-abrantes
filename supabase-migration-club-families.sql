-- Famílias: uma só ideia de família no clube (pais, mães, irmãos…).
--
-- Cada pessoa da família é Adulto ou Criança. Os ADULTOS podem entrar nas contas das
-- CRIANÇAS da mesma família; as crianças não entram em conta nenhuma, e um adulto não
-- entra na conta de outro adulto. Substitui as "contas familiares" (family_account_links),
-- que passam para aqui no fim deste ficheiro. As tabelas antigas ficam, mas deixam de ser usadas.
--
-- Cada pessoa pertence no máximo a uma família. Os adultos criam a família e os perfis das
-- crianças no perfil, e convidam os outros por código (48 h, uma utilização); a coordenação vê
-- e corrige tudo na administração dos membros. Só a coordenação muda Adulto/Criança à mão.
-- As tabelas só são lidas e escritas pelas ações do servidor (service role).

CREATE TABLE IF NOT EXISTS public.club_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.club_family_members (
  family_id uuid NOT NULL REFERENCES public.club_families(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'adult' CHECK (kind IN ('adult', 'child')),
  -- Perfil criado pela família, sem email próprio (só se entra nele a partir de um adulto).
  managed boolean NOT NULL DEFAULT false,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, user_id),
  CONSTRAINT club_family_members_one_family UNIQUE (user_id)
);

ALTER TABLE public.club_family_members ADD COLUMN IF NOT EXISTS managed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS club_family_members_family_idx ON public.club_family_members (family_id);

-- Um convite ativo por família (gerar outro substitui o anterior; apaga-se ao ser aceite).
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
-- SECURITY DEFINER: quando o Auth apaga uma conta, a cascata corre com o papel
-- supabase_auth_admin, que não tem acesso a estas tabelas.
CREATE OR REPLACE FUNCTION public.delete_empty_club_family()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
REVOKE ALL ON FUNCTION public.delete_empty_club_family() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_empty_club_family() TO service_role;

-- ── Passar as contas familiares que já existem ──────────────────────────────
-- Cada conta principal com perfis associados passa a ser uma família ("Família" + último
-- apelido). A conta principal fica Adulto (era a responsável). Os perfis associados criados
-- sem email ficam Criança; os que têm conta própria ficam pela idade (18 anos ou mais = adulto,
-- e então deixam de se poder trocar com a conta principal, como dois adultos).
-- Quem já estiver numa família fica onde está. Pode correr-se mais do que uma vez.
DO $$
DECLARE
  owner_row record;
  new_family uuid;
BEGIN
  FOR owner_row IN
    SELECT DISTINCT l.owner_user_id AS id, p.full_name
    FROM public.family_account_links l
    JOIN public.profiles p ON p.id = l.owner_user_id
    WHERE NOT EXISTS (SELECT 1 FROM public.club_family_members m WHERE m.user_id = l.owner_user_id)
  LOOP
    INSERT INTO public.club_families (name, created_by)
    VALUES (
      left('Família ' || coalesce(nullif(regexp_replace(trim(coalesce(owner_row.full_name, '')), '^.*\s', ''), ''), 'sem nome'), 40),
      owner_row.id
    )
    RETURNING id INTO new_family;

    INSERT INTO public.club_family_members (family_id, user_id, kind, managed, added_by)
    VALUES (new_family, owner_row.id, 'adult', false, owner_row.id);

    INSERT INTO public.club_family_members (family_id, user_id, kind, managed, added_by)
    SELECT
      new_family,
      l.associated_user_id,
      CASE
        WHEN coalesce((u.raw_app_meta_data ->> 'family_account')::boolean, false) THEN 'child'
        WHEN p.birth_date IS NOT NULL AND p.birth_date <= (current_date - interval '18 years') THEN 'adult'
        WHEN p.birth_date IS NULL THEN 'adult'
        ELSE 'child'
      END,
      coalesce((u.raw_app_meta_data ->> 'family_account')::boolean, false)
        AND coalesce(u.email, '') LIKE '%@family.desbravadores-abrantes.invalid',
      owner_row.id
    FROM public.family_account_links l
    JOIN public.profiles p ON p.id = l.associated_user_id
    LEFT JOIN auth.users u ON u.id = l.associated_user_id
    WHERE l.owner_user_id = owner_row.id
      AND NOT EXISTS (SELECT 1 FROM public.club_family_members m WHERE m.user_id = l.associated_user_id);
  END LOOP;
END;
$$;
