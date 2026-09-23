-- ============================================
-- FERRAMENTAS · CRONÓMETRO + TENDAS E BOLEIAS
-- ============================================
-- 1. timer_screens  — ecrã do projetor do Cronómetro (modo "controlar a partir do telemóvel").
-- 2. profiles.gender — sexo escolhido no onboarding, depois fixo ('m' | 'f' | NULL =
--    conta antiga que ainda não o indicou; pode fazê-lo uma vez no perfil).
--    Enquanto for NULL, a ferramenta usa um palpite pelo primeiro nome.
-- 3. trip_plans     — distribuição de tendas e boleias (ida/volta) de um evento.
--    A liderança edita o rascunho (`draft`); ao publicar copia-se para `published`
--    e cada participante vê a sua tenda/carro no Painel (RPC get_my_trip_assignments).
--
-- Corre este ficheiro inteiro no SQL Editor do Supabase. É idempotente.
-- ============================================


-- ============================================
-- 1. CRONÓMETRO — ecrã do projetor
-- ============================================
-- Igual ao raffle_screens: uma linha por anfitrião; o telemóvel escreve `state`
-- e o projetor (mesma conta) lê por realtime. O tempo é descrito como "tempo
-- decorrido no envio + a correr?", por isso só se escreve em iniciar/pausar/etc.

CREATE TABLE IF NOT EXISTS public.timer_screens (
  host_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.timer_screens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "timer_screens_own" ON public.timer_screens;
CREATE POLICY "timer_screens_own" ON public.timer_screens FOR ALL
  USING (host_id = auth.uid())
  WITH CHECK (
    host_id = auth.uid()
    AND public.get_my_role() IN ('coordenador', 'dirigente')
  );

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.timer_screens;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================
-- 2. SEXO DO MEMBRO
-- ============================================
-- Escolhe-se no onboarding e fica fixo. Contas antigas (NULL) podem indicá-lo UMA vez
-- no perfil. Depois disso só a coordenação o muda (para corrigir um engano).

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender text;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_gender_check CHECK (gender IN ('m', 'f'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.protect_gender_column() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.gender IS NOT NULL
     AND NEW.gender IS DISTINCT FROM OLD.gender
     AND auth.uid() IS NOT NULL
     AND public.get_my_role() IS DISTINCT FROM 'coordenador' THEN
    NEW.gender := OLD.gender;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_gender_column ON public.profiles;
CREATE TRIGGER trg_protect_gender_column
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_gender_column();


-- ============================================
-- 3. TENDAS E BOLEIAS
-- ============================================

CREATE TABLE IF NOT EXISTS public.trip_plans (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  published jsonb,
  published_at timestamptz,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_plans ENABLE ROW LEVEL SECURITY;

-- Coordenação: qualquer evento. Dirigente (ou ajudante de secção): eventos da sua secção.
CREATE OR REPLACE FUNCTION public.can_manage_trip(p_event_id uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.get_my_role() = 'coordenador'
      OR (
        public.get_my_role() = 'dirigente'
        AND EXISTS (
          SELECT 1 FROM public.events e
          WHERE e.id = p_event_id
            AND e.target_section IS NOT NULL
            AND e.target_section = public.get_my_leadership_section()
        )
      );
$$;

DROP POLICY IF EXISTS "trip_plans_leaders" ON public.trip_plans;
CREATE POLICY "trip_plans_leaders" ON public.trip_plans FOR ALL
  USING (public.can_manage_trip(event_id))
  WITH CHECK (public.can_manage_trip(event_id));

-- Os membros NÃO leem a tabela (o rascunho é interno). Veem só a versão publicada
-- dos eventos em que aparecem, e só até 2 dias depois do evento.
CREATE OR REPLACE FUNCTION public.get_my_trip_assignments()
RETURNS TABLE (
  event_id uuid,
  title text,
  location text,
  start_at timestamptz,
  end_at timestamptz,
  published jsonb,
  published_at timestamptz
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT e.id, e.title, e.location, e.start_at, e.end_at, p.published, p.published_at
  FROM public.trip_plans p
  JOIN public.events e ON e.id = p.event_id
  WHERE auth.uid() IS NOT NULL
    AND p.published IS NOT NULL
    AND (p.published -> 'names') ? auth.uid()::text
    AND COALESCE(e.end_at, e.start_at) > now() - interval '2 days'
  ORDER BY e.start_at;
$$;

REVOKE ALL ON FUNCTION public.get_my_trip_assignments() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_trip_assignments() TO authenticated;
