-- ============================================
-- FERRAMENTAS · FORMADOR DE EQUIPAS — ecrã do projetor
-- ============================================
-- Igual ao raffle_screens/timer_screens: uma linha por anfitrião com o estado das
-- equipas (`state`). Serve para:
--   • o projetor noutro computador (mesma conta) seguir por realtime;
--   • o Cronómetro ir buscar as últimas equipas formadas, mesmo noutro dispositivo.
--
-- Corre este ficheiro inteiro no SQL Editor do Supabase. É idempotente.
-- ============================================

CREATE TABLE IF NOT EXISTS public.team_screens (
  host_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_screens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_screens_own" ON public.team_screens;
CREATE POLICY "team_screens_own" ON public.team_screens FOR ALL
  USING (host_id = auth.uid())
  WITH CHECK (
    host_id = auth.uid()
    AND public.get_my_role() IN ('coordenador', 'dirigente')
  );

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.team_screens;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
