-- ============================================
-- MIGRAÇÃO: Reverter atribuição de pontos de um evento
-- ============================================
-- Permite ao dirigente/coordenador reverter um evento já finalizado:
--   * remove os pontos atribuídos (XP/Gold) a todos os membros
--   * marca as presenças como "ainda não atribuídas" (mantendo o estado)
--   * reabre o evento (is_finished = false) para corrigir a atribuição
--
-- Pode ser executado várias vezes em segurança (idempotente).

-- 1. Ligar cada registo de pontos ao evento que o originou
ALTER TABLE public.points_log
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_points_log_event_id ON public.points_log(event_id);

-- 2. Backfill: associar registos de pontos antigos ao respetivo evento.
--    Os pontos de eventos são gravados com a descrição "Participação em: <título> ...".
--    Como reuniões recorrentes partilham o mesmo título, desempatamos pelo momento
--    de atribuição (points_log.created_at mais próximo de event_attendance.awarded_at,
--    dentro de uma janela de 1 hora).
WITH ranked AS (
  SELECT
    pl.id AS log_id,
    ea.event_id,
    ROW_NUMBER() OVER (
      PARTITION BY pl.id
      ORDER BY abs(extract(epoch FROM (pl.created_at - ea.awarded_at)))
    ) AS rn
  FROM public.points_log pl
  JOIN public.events e
    ON pl.description LIKE 'Participação em: ' || e.title || '%'
  JOIN public.event_attendance ea
    ON ea.event_id = e.id
   AND ea.user_id = pl.target_user_id
   AND ea.points_awarded = true
   AND ea.awarded_at IS NOT NULL
  WHERE pl.event_id IS NULL
    AND abs(extract(epoch FROM (pl.created_at - ea.awarded_at))) < 3600
)
UPDATE public.points_log pl
SET event_id = ranked.event_id
FROM ranked
WHERE pl.id = ranked.log_id
  AND ranked.rn = 1;

-- 3. Função para reverter um evento (atómica, com verificação de permissões)
CREATE OR REPLACE FUNCTION public.revert_event_points(p_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_role text := public.get_my_role();
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado.';
  END IF;

  -- Apenas coordenador, ou dirigente da secção-alvo do evento (mesma regra da gestão de eventos)
  IF NOT (
    v_role = 'coordenador'
    OR (v_role = 'dirigente' AND v_event.target_section = public.get_my_leadership_section())
  ) THEN
    RAISE EXCEPTION 'Sem permissão para reverter este evento.';
  END IF;

  -- 1. Remover os pontos atribuídos por este evento.
  --    O gatilho on_points_log_change recalcula automaticamente os totais dos perfis.
  DELETE FROM public.points_log WHERE event_id = p_event_id;

  -- 2. Marcar presenças como não atribuídas (mantém o estado presente/atrasado/faltou para correção)
  UPDATE public.event_attendance
  SET points_awarded = false, awarded_at = NULL, updated_at = now()
  WHERE event_id = p_event_id;

  -- 3. Reabrir o evento
  UPDATE public.events
  SET is_finished = false, updated_at = now()
  WHERE id = p_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revert_event_points(uuid) TO authenticated;
