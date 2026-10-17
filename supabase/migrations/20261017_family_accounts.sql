-- Contas familiares: uma ligação exclusiva entre a conta principal e a conta associada.
-- A sessão muda realmente para a outra conta, por isso todas as permissões e dados
-- existentes continuam a aplicar-se sem exceções especiais na aplicação.

CREATE TABLE IF NOT EXISTS public.family_account_links (
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  associated_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT family_account_links_owner_unique UNIQUE (owner_user_id),
  CONSTRAINT family_account_links_associated_unique UNIQUE (associated_user_id),
  CONSTRAINT family_account_links_different_users CHECK (owner_user_id <> associated_user_id),
  PRIMARY KEY (owner_user_id, associated_user_id)
);

CREATE TABLE IF NOT EXISTS public.family_account_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS family_account_requests_one_pending_owner
  ON public.family_account_requests (owner_user_id)
  WHERE status = 'pending';

ALTER TABLE public.family_account_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_account_requests ENABLE ROW LEVEL SECURITY;

-- Os UNIQUE individuais impedem dois filhos para o mesmo responsável e o mesmo
-- filho em duas ligações. Este trigger cobre também o cruzamento A→B e B→C.
CREATE OR REPLACE FUNCTION public.enforce_family_account_link_exclusive()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.family_account_links
    WHERE owner_user_id IN (NEW.owner_user_id, NEW.associated_user_id)
       OR associated_user_id IN (NEW.owner_user_id, NEW.associated_user_id)
  ) THEN
    RAISE EXCEPTION 'Cada conta só pode pertencer a uma associação familiar.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_family_account_link_exclusive ON public.family_account_links;
CREATE TRIGGER enforce_family_account_link_exclusive
  BEFORE INSERT ON public.family_account_links
  FOR EACH ROW EXECUTE FUNCTION public.enforce_family_account_link_exclusive();

-- As tabelas são acedidas apenas por ações do servidor com validações explícitas.
-- Não expor pedidos nem relações diretamente pelo cliente impede enumeração de contas.
