-- ============================================
-- MIGRAÇÃO: Disponibilidade dos jogos (ativar / desativar / restringir por cargo)
-- ============================================
-- Uma linha por jogo (o id é o mesmo de utils/games.ts):
--   • enabled = false            → indisponível para todos
--   • allowed_roles              → quem pode entrar quando está ativo
--                                  ('desbravador' também cobre visitantes sem conta)
--   • hidden = true              → quem não pode entrar nem vê o jogo (surpresas);
--                                  sem isto, vê-o marcado como "Indisponível"
-- Jogos sem linha contam como ativos para todos, por isso um jogo novo aparece
-- disponível até alguém mudar a configuração em Gestão → Jogos.
--
-- Leitura pública (a landing page e o middleware precisam dela sem login).
-- Só a coordenação (cargo efetivo, inclui ajudantes de coordenação) altera.
--
-- Requer: supabase-migration-helpers.sql (get_my_role() efetivo).
-- Corre no SQL Editor do Supabase. É idempotente: se já a tinhas corrido antes de
-- existir a opção "esconder", corre-a outra vez para acrescentar a coluna `hidden`.
-- ============================================

CREATE TABLE IF NOT EXISTS public.game_settings (
  game_id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  allowed_roles text[] NOT NULL DEFAULT ARRAY['desbravador', 'dirigente', 'coordenador']::text[],
  updated_by uuid,              -- sem FK: a configuração sobrevive a contas apagadas
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_settings_roles_valid
    CHECK (allowed_roles <@ ARRAY['desbravador', 'dirigente', 'coordenador']::text[]),
  CONSTRAINT game_settings_roles_not_empty
    CHECK (cardinality(allowed_roles) > 0)
);

-- Opção "esconder" (acrescentada depois da primeira versão desta migração)
ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

ALTER TABLE public.game_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view game settings" ON public.game_settings;
CREATE POLICY "Anyone can view game settings" ON public.game_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Coordinators can insert game settings" ON public.game_settings;
CREATE POLICY "Coordinators can insert game settings" ON public.game_settings
  FOR INSERT WITH CHECK (public.get_my_role() = 'coordenador');

DROP POLICY IF EXISTS "Coordinators can update game settings" ON public.game_settings;
CREATE POLICY "Coordinators can update game settings" ON public.game_settings
  FOR UPDATE USING (public.get_my_role() = 'coordenador')
  WITH CHECK (public.get_my_role() = 'coordenador');
-- Sem DELETE: para "repor", volta-se a ativar para todos.

GRANT SELECT ON public.game_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.game_settings TO authenticated;

-- Jogos atuais (ativos para todos). Não mexe em configurações já feitas.
INSERT INTO public.game_settings (game_id) VALUES
  ('vantur'),
  ('vana-quest'),
  ('vana-words'),
  ('vana-trilha'),
  ('vana-camp')
ON CONFLICT (game_id) DO NOTHING;
