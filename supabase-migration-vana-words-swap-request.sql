-- ============================================================
-- VanaWords — pedido de troca de equipa (team_preview)
-- Jogador pede para trocar; host aceita (troca) ou recusa (limpa o pedido).
-- ============================================================

ALTER TABLE public.vanawords_players
  ADD COLUMN IF NOT EXISTS swap_requested boolean NOT NULL DEFAULT false;
