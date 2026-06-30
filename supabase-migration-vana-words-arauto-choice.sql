-- ============================================================
-- VanaWords — escolha manual de Arauto + resposta do Arauto
-- ============================================================

-- Modo de revelação por equipa durante 'arauto_spin':
--   'spin'    -> mostra a animação da roleta (mesmo quando o host escolhe
--                diretamente quem ganha — "viciar a roleta")
--   'instant' -> mostra logo o Arauto escolhido, sem animação
ALTER TABLE public.vanawords_sessions
  ADD COLUMN IF NOT EXISTS arauto_reveal_a text NOT NULL DEFAULT 'spin'
    CHECK (arauto_reveal_a IN ('spin', 'instant'));
ALTER TABLE public.vanawords_sessions
  ADD COLUMN IF NOT EXISTS arauto_reveal_b text NOT NULL DEFAULT 'spin'
    CHECK (arauto_reveal_b IN ('spin', 'instant'));

-- Resposta do jogador escolhido como Arauto (apenas preferência — o host decide)
ALTER TABLE public.vanawords_players
  ADD COLUMN IF NOT EXISTS arauto_response text NOT NULL DEFAULT 'pending'
    CHECK (arauto_response IN ('pending', 'accepted', 'declined'));
