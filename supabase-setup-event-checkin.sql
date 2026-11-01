-- ============================================
-- PRESENÇAS POR QR (Ecrã do Clube → Presenças)
-- ============================================
-- O projetor mostra um QR que muda a cada 30 s. Quem o lê:
--   • membros: ficam marcados SÓ no rascunho das presenças (event_attendance com
--     points_awarded = false). A liderança confirma e finaliza como sempre.
--     `checkin_at` diz que a marcação veio do QR (NULL = marcado por um dirigente).
--   • convidados (sem conta): escrevem o nome e ficam em `event_guests`, uma tabela
--     temporária. Quando as presenças do evento são finalizadas (ou 24 h depois do
--     fim do evento) os nomes apagam-se e fica só o número em `events.guests_count`.
--
-- `event_guests` não tem políticas: só o servidor (service role) lê e escreve.
-- Corre este ficheiro inteiro no SQL Editor do Supabase. É idempotente.
-- ============================================

ALTER TABLE public.event_attendance ADD COLUMN IF NOT EXISTS checkin_at timestamptz;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS guests_count integer;

CREATE TABLE IF NOT EXISTS public.event_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  -- Guardado no telemóvel do convidado: prova que é ele (ex.: ao entrar no VanaCoro).
  secret uuid NOT NULL DEFAULT gen_random_uuid(),
  -- Para limitar quantos convidados o mesmo telemóvel/rede regista (hash, não o IP).
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_guests_event_idx ON public.event_guests (event_id, created_at);

ALTER TABLE public.event_guests ENABLE ROW LEVEL SECURITY;


-- ============================================
-- Apagar os convidados e guardar só o número
-- ============================================

CREATE OR REPLACE FUNCTION public.close_event_guests(p_event_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  WITH gone AS (DELETE FROM public.event_guests WHERE event_id = p_event_id RETURNING 1)
  SELECT count(*) INTO v_count FROM gone;

  -- Soma (um evento reaberto e finalizado outra vez pode ter recebido mais visitas).
  IF v_count > 0 OR NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id AND guests_count IS NOT NULL) THEN
    UPDATE public.events SET guests_count = COALESCE(guests_count, 0) + v_count WHERE id = p_event_id;
  END IF;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.close_event_guests(uuid) FROM PUBLIC, anon, authenticated;

-- Ao finalizar as presenças (is_finished passa a true), seja por onde for.
CREATE OR REPLACE FUNCTION public.events_close_guests_on_finish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_finished AND NOT COALESCE(OLD.is_finished, false) THEN
    PERFORM public.close_event_guests(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_close_guests_on_finish ON public.events;
CREATE TRIGGER events_close_guests_on_finish
  AFTER UPDATE OF is_finished ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_close_guests_on_finish();

-- Rede de segurança para eventos que nunca chegam a ser finalizados: 24 h depois do
-- fim (ou do início, se não tiver fim). O servidor chama isto sempre que alguém
-- regista uma presença ou abre o ecrã das presenças, por isso não precisa de pg_cron.
CREATE OR REPLACE FUNCTION public.cleanup_stale_event_guests()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event uuid;
  v_total integer := 0;
BEGIN
  FOR v_event IN
    SELECT DISTINCT g.event_id
    FROM public.event_guests g
    JOIN public.events e ON e.id = g.event_id
    WHERE COALESCE(e.end_at, e.start_at) < now() - interval '24 hours'
  LOOP
    v_total := v_total + public.close_event_guests(v_event);
  END LOOP;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_event_guests() FROM PUBLIC, anon, authenticated;
