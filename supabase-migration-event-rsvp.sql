-- ============================================
-- MIGRAÇÃO: Confirmação de presença nos eventos ("Vou / Não vou")
-- ============================================
-- • Ao criar/editar um evento, a liderança pode ligar "Pedir confirmação de presença"
--   (events.rsvp_enabled) e, opcionalmente, um prazo (events.rsvp_deadline).
--   Sem prazo, pode-se responder até o evento começar.
-- • O desbravador responde no Painel (RPC set_event_rsvp) e pode mudar a resposta
--   dentro do prazo.
-- • A resposta é só uma INTENÇÃO: as presenças reais continuam a ser marcadas e
--   validadas pelos dirigentes/coordenadores em event_attendance (que dá os pontos).
-- • As Tendas e boleias usam quem disse "Vou".
--
-- Corre este ficheiro inteiro no SQL Editor do Supabase. É idempotente.
-- ============================================

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS rsvp_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS rsvp_deadline timestamptz;

CREATE TABLE IF NOT EXISTS public.event_rsvps (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  going boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_rsvps_user_idx ON public.event_rsvps (user_id);

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

-- Ver: a própria resposta; a coordenação vê todas; o dirigente vê as da sua secção
-- (a mesma regra das presenças).
DROP POLICY IF EXISTS "event_rsvps_select" ON public.event_rsvps;
CREATE POLICY "event_rsvps_select" ON public.event_rsvps FOR SELECT USING (
  user_id = auth.uid()
  OR public.get_my_role() = 'coordenador'
  OR (
    public.get_my_role() = 'dirigente'
    AND (SELECT section::text FROM public.profiles WHERE id = user_id) = public.get_my_leadership_section()
  )
);

-- Não há policies de escrita: responde-se só pela RPC (que valida o prazo e o público do evento).

CREATE OR REPLACE FUNCTION public.set_event_rsvp(p_event_id uuid, p_going boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entra outra vez.';
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado.';
  END IF;

  IF NOT v_event.rsvp_enabled THEN
    RAISE EXCEPTION 'Este evento não pede confirmação de presença.';
  END IF;

  IF v_event.is_finished OR now() >= COALESCE(v_event.rsvp_deadline, v_event.start_at) THEN
    RAISE EXCEPTION 'O prazo para responder já terminou.';
  END IF;

  -- Evento de uma secção: só os membros dessa secção (ou os seus dirigentes/ajudantes).
  IF v_event.target_section IS NOT NULL
     AND v_event.target_section::text IS DISTINCT FROM public.get_my_section()
     AND v_event.target_section::text IS DISTINCT FROM public.get_my_leadership_section() THEN
    RAISE EXCEPTION 'Este evento não é para a tua secção.';
  END IF;

  INSERT INTO public.event_rsvps (event_id, user_id, going)
  VALUES (p_event_id, v_uid, p_going)
  ON CONFLICT (event_id, user_id)
  DO UPDATE SET going = EXCLUDED.going, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_event_rsvp(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_event_rsvp(uuid, boolean) TO authenticated;
