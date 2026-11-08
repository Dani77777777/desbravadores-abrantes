-- ============================================
-- MIGRAÇÃO: Sorteador — prémios do sorteio da Pergunta da Semana
-- ============================================
-- Regista quem ganhou um prémio (físico ou XP e Gold) no sorteio entre quem respondeu
-- a uma Pergunta da Semana. A chave primária impede que a mesma pessoa receba duas
-- vezes pela mesma pergunta. O XP e o Gold continuam a entrar pelo points_log.
--
-- RLS ligada e sem políticas: só o servidor (service role) lê e grava, depois de
-- confirmar o cargo e a secção de quem sorteia.
--
-- Requer: supabase-setup-vana-coro.sql.
-- Corre o ficheiro inteiro no SQL Editor do Supabase. É idempotente.
-- ============================================

CREATE TABLE IF NOT EXISTS public.question_raffle_prizes (
  question_id uuid NOT NULL REFERENCES public.vanacoro_questions(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  prize       text NOT NULL CHECK (char_length(prize) BETWEEN 1 AND 80),
  awarded_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  awarded_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, profile_id)
);

ALTER TABLE public.question_raffle_prizes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.question_raffle_prizes FROM anon, authenticated;
GRANT ALL ON public.question_raffle_prizes TO service_role;

-- Confirmação
SELECT count(*) AS premios_registados FROM public.question_raffle_prizes;
