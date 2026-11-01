-- ============================================
-- VANACORO · FAMÍLIAS SORTEADAS
-- ============================================
-- No Formador de equipas (Modo Famílias) formam-se as famílias e sorteia-se quem joga.
-- Na sala de espera do VanaCoro, "Usar as famílias sorteadas" copia as duas famílias para
-- a sessão: os nomes das equipas e a lista de quem é de cada família (`vanacoro_roster`).
-- A partir daí cada um entra logo na sua família:
--   • membros pela conta;
--   • convidados pelo telemóvel onde marcaram presença pelo QR, ou escolhendo o nome na lista.
-- Quem não está na lista está numa família que fica a assistir.
--
-- `vanacoro_roster` não tem políticas: só o servidor lê (as sessões são públicas e a lista
-- tem nomes de visitas). Corre este ficheiro inteiro no SQL Editor do Supabase. É idempotente.
-- ============================================

ALTER TABLE public.vanacoro_sessions ADD COLUMN IF NOT EXISTS uses_families boolean NOT NULL DEFAULT false;

-- Que pessoa da lista é este jogador (id do perfil, ou "guest:…" para as visitas).
ALTER TABLE public.vanacoro_players ADD COLUMN IF NOT EXISTS roster_key text;
CREATE UNIQUE INDEX IF NOT EXISTS vanacoro_players_one_per_roster_key
  ON public.vanacoro_players (session_id, roster_key) WHERE roster_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.vanacoro_roster (
  session_id uuid NOT NULL REFERENCES public.vanacoro_sessions(id) ON DELETE CASCADE,
  key        text NOT NULL,
  team       text NOT NULL CHECK (team IN ('a', 'b')),
  name       text NOT NULL,
  is_guest   boolean NOT NULL DEFAULT false,
  PRIMARY KEY (session_id, key)
);

ALTER TABLE public.vanacoro_roster ENABLE ROW LEVEL SECURITY;
