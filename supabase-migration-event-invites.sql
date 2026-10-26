-- ============================================
-- MIGRAÇÃO: Convites por email para eventos
-- ============================================
-- Na lista de membros, a liderança pode convidar os membros por investir para um
-- evento. O convite vai por email (Gmail do clube, ver lib/email.ts) para o email
-- da conta; nos perfis familiares vai para o email da conta principal.
--
-- event_invites   → quem já foi convidado para cada evento (evita repetir).
-- email_opt_outs  → quem pediu para deixar de receber convites (link no fim do email).
--
-- As duas tabelas só têm políticas de leitura: a escrita é feita pelo servidor
-- (service role) depois de verificar as permissões.
--
-- Corre este ficheiro no SQL Editor do Supabase. É idempotente.
-- ============================================

CREATE TABLE IF NOT EXISTS public.event_invites (
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- O email foi para a conta principal da família (perfil familiar)
  sent_to_family boolean NOT NULL DEFAULT false,
  sent_count integer NOT NULL DEFAULT 1,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.email_opt_outs (
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_opt_outs ENABLE ROW LEVEL SECURITY;

-- Mesma regra das presenças: coordenação vê todos, dirigentes só a sua secção.
DROP POLICY IF EXISTS "Leaders can view invites" ON public.event_invites;
CREATE POLICY "Leaders can view invites" ON public.event_invites FOR SELECT USING (
  public.get_my_role() = 'coordenador'
  OR (
    public.get_my_role() = 'dirigente'
    AND (SELECT section::text FROM public.profiles WHERE id = user_id) = public.get_my_leadership_section()
  )
);

DROP POLICY IF EXISTS "View own or managed opt-outs" ON public.email_opt_outs;
CREATE POLICY "View own or managed opt-outs" ON public.email_opt_outs FOR SELECT USING (
  user_id = auth.uid()
  OR public.get_my_role() = 'coordenador'
  OR (
    public.get_my_role() = 'dirigente'
    AND (SELECT section::text FROM public.profiles WHERE id = user_id) = public.get_my_leadership_section()
  )
);

-- Registo de um envio (chamado só pelo servidor, com service role).
CREATE OR REPLACE FUNCTION public.record_event_invite(
  p_event_id uuid, p_user_id uuid, p_invited_by uuid, p_family boolean
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.event_invites (event_id, user_id, invited_by, sent_to_family)
  VALUES (p_event_id, p_user_id, p_invited_by, p_family)
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET invited_by = EXCLUDED.invited_by,
        sent_to_family = EXCLUDED.sent_to_family,
        sent_count = public.event_invites.sent_count + 1,
        sent_at = now();
$$;

REVOKE ALL ON FUNCTION public.record_event_invite(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_event_invite(uuid, uuid, uuid, boolean) TO service_role;
