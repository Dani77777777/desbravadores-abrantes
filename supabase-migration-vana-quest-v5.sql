-- Migration v5: marcar quando os pontos foram atribuídos numa sessão
-- (evita duplicar prémios se carregares no botão duas vezes)

ALTER TABLE public.vana_quest_sessions
  ADD COLUMN IF NOT EXISTS points_awarded_at timestamptz;
