-- Uma conta principal pode gerir vários familiares. Cada familiar continua a
-- pertencer apenas a uma conta principal, sem relações em cadeia.

ALTER TABLE public.family_account_links
  DROP CONSTRAINT IF EXISTS family_account_links_owner_unique;

CREATE OR REPLACE FUNCTION public.enforce_family_account_link_exclusive()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Um perfil associado não pode ser associado duas vezes nem tornar-se principal.
  IF EXISTS (
    SELECT 1
    FROM public.family_account_links
    WHERE associated_user_id IN (NEW.owner_user_id, NEW.associated_user_id)
  ) THEN
    RAISE EXCEPTION 'Um perfil associado não pode pertencer a outra família.';
  END IF;
  RETURN NEW;
END;
$$;
