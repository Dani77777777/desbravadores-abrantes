-- ============================================
-- FERRAMENTAS · SORTEADOR — ecrã do projetor
-- ============================================
-- Uma linha por anfitrião (coordenador/dirigente/ajudante). O telemóvel escreve o
-- estado do sorteio em `state` e a página do projetor (mesma conta, noutro
-- dispositivo) lê-o por realtime. Não há histórico aqui: os "já sorteados" ficam
-- guardados temporariamente no browser de quem sorteia.

CREATE TABLE IF NOT EXISTS public.raffle_screens (
  host_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.raffle_screens ENABLE ROW LEVEL SECURITY;

-- Cada um só vê/escreve o seu ecrã; só cargos de gestão (efetivos) o podem criar.
DROP POLICY IF EXISTS "raffle_screens_own" ON public.raffle_screens;
CREATE POLICY "raffle_screens_own" ON public.raffle_screens FOR ALL
  USING (host_id = auth.uid())
  WITH CHECK (
    host_id = auth.uid()
    AND public.get_my_role() IN ('coordenador', 'dirigente')
  );

-- ── Realtime ─────────────────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.raffle_screens;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
