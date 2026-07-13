-- ============================================================
-- VanaWords — corrige eventos DELETE em Realtime
-- Sem REPLICA IDENTITY FULL, os eventos DELETE só incluem a PK no
-- registo antigo, por isso filtros como `session_id=eq.X` não
-- correspondem e o cliente nunca é notificado da remoção.
-- ============================================================

ALTER TABLE public.vanawords_guesses REPLICA IDENTITY FULL;
ALTER TABLE public.vanawords_players REPLICA IDENTITY FULL;
ALTER TABLE public.vanawords_turns   REPLICA IDENTITY FULL;
