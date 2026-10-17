-- ============================================
-- MIGRAÇÃO: resposta de confirmação pelos dirigentes/coordenadores
-- ============================================
-- Permite à liderança marcar "Vai" ou "Não vai" apenas para membros que
-- ainda não responderam a um evento que pede confirmação.
--
-- Corre este ficheiro no SQL Editor do Supabase DEPOIS de
-- supabase-migration-event-rsvp.sql.
-- ============================================

CREATE OR REPLACE FUNCTION public.set_event_rsvp_for_member(
  p_event_id uuid,
  p_user_id uuid,
  p_going boolean
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_role text := public.get_my_role();
  v_member_section text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entra outra vez.';
  END IF;

  IF v_role NOT IN ('coordenador', 'dirigente') THEN
    RAISE EXCEPTION 'Sem permissão para responder por um membro.';
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado.';
  END IF;

  IF NOT v_event.rsvp_enabled THEN
    RAISE EXCEPTION 'Este evento não pede confirmação de presença.';
  END IF;

  IF v_event.is_finished THEN
    RAISE EXCEPTION 'Este evento já foi finalizado.';
  END IF;

  SELECT section::text INTO v_member_section FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membro não encontrado.';
  END IF;

  -- O membro tem de fazer parte do público-alvo do evento.
  IF v_event.target_section IS NOT NULL
     AND v_member_section IS DISTINCT FROM v_event.target_section::text THEN
    RAISE EXCEPTION 'Este membro não faz parte do público deste evento.';
  END IF;

  -- O dirigente (incluindo ajudante de dirigente) fica limitado à sua classe.
  IF v_role = 'dirigente'
     AND v_member_section IS DISTINCT FROM public.get_my_leadership_section() THEN
    RAISE EXCEPTION 'Só podes responder por membros da tua secção.';
  END IF;

  -- Não substitui o que o próprio membro já respondeu.
  PERFORM 1
  FROM public.event_rsvps
  WHERE event_id = p_event_id AND user_id = p_user_id;
  IF FOUND THEN
    RAISE EXCEPTION 'Este membro já respondeu.';
  END IF;

  INSERT INTO public.event_rsvps (event_id, user_id, going)
  VALUES (p_event_id, p_user_id, p_going);
END;
$$;

REVOKE ALL ON FUNCTION public.set_event_rsvp_for_member(uuid, uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_event_rsvp_for_member(uuid, uuid, boolean) TO authenticated;
