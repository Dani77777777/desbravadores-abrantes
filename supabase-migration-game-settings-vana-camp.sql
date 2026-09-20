-- ============================================
-- MIGRAÇÃO: VanaCamp: Infiltrados na disponibilidade dos jogos
-- ============================================
-- Acrescenta a linha do VanaCamp à tabela `game_settings`, para o jogo poder
-- ser ativado/desativado, limitado por cargo ou escondido em Gestão → Jogos,
-- tal como os outros jogos.
--
-- Requer: supabase-migration-game-settings.sql (cria a tabela e as RLS).
-- Corre no SQL Editor do Supabase. É idempotente: se a linha já existir,
-- a configuração que já tiveres feita fica intacta.
--
-- Nota: um jogo sem linha na tabela já conta como ativo para todos — isto
-- serve para o VanaCamp aparecer desde já com a configuração explícita.
-- ============================================

-- Rede de segurança: a coluna "esconder" foi acrescentada depois da primeira
-- versão da migração da disponibilidade.
ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

-- Ativo para todos. Para o guardar como surpresa (ex.: revelar só no
-- acampamento), muda depois em Gestão → Jogos: limita à coordenação e
-- liga o "Esconder de quem não pode jogar".
INSERT INTO public.game_settings (game_id, enabled, allowed_roles, hidden)
VALUES ('vana-camp', true, ARRAY['desbravador', 'dirigente', 'coordenador']::text[], false)
ON CONFLICT (game_id) DO NOTHING;

-- Confirmação
SELECT game_id, enabled, allowed_roles, hidden
FROM public.game_settings
ORDER BY game_id;
