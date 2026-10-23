-- ============================================
-- VANTUR — Desafio diário de palavras (estilo Wordle, modos Solo/Mix/Plex)
-- Correr no SQL Editor do Supabase.
--
-- As tabelas e as RPCs de sorteio foram criadas à mão no Supabase e nunca
-- estiveram no repositório; este ficheiro reconstrói-as a partir do que o
-- código espera (app/jogos/vantur, components/vantur, app/admin/vantur,
-- lib/actions/vana-sketch.ts):
--   • vantur_sessions    — uma sessão por utilizador+modo (o upsert diário substitui a antiga)
--   • vantur_dictionary  — palavras bíblicas de 5 letras (também alimenta o VanaSketch)
--   • portuguese_words   — dicionário geral, só de reserva para o sorteio
--   • rpc('get_random_vantur_words',  { count }) -> [{ word }]
--   • rpc('get_random_general_words', { count }) -> [{ word_clean }]
--
-- IDEMPOTENTE. Numa base de dados que já tem o VANTUR, as tabelas ficam como
-- estão (CREATE TABLE IF NOT EXISTS) e as duas RPCs são substituídas.
--
-- Correr ANTES de supabase-setup-game-analytics.sql e de
-- supabase-migration-game-points-multiplier.sql (ambos usam vantur_sessions;
-- award_vantur_rewards vive nesse último).
-- ============================================

-- 1. Sessões --------------------------------------------------------------
-- award_vantur_rewards usa cardinality() em secret_words e completed_indices,
-- por isso são arrays e não jsonb.
CREATE TABLE IF NOT EXISTS public.vantur_sessions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('solo', 'mix', 'plex')),
  secret_words text[] NOT NULL DEFAULT '{}',
  attempts text[] NOT NULL DEFAULT '{}',
  completed_indices integer[] NOT NULL DEFAULT '{}',
  is_finished boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mode)
);

CREATE INDEX IF NOT EXISTS idx_vantur_sessions_user ON public.vantur_sessions(user_id);

-- 2. Dicionários ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vantur_dictionary (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  word text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- O admin faz upsert sem onConflict: word_clean tem de ser a chave primária.
CREATE TABLE IF NOT EXISTS public.portuguese_words (
  word_clean text PRIMARY KEY,
  word_display text NOT NULL
);

-- 3. RLS ------------------------------------------------------------------
ALTER TABLE public.vantur_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vantur_dictionary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portuguese_words  ENABLE ROW LEVEL SECURITY;

-- Cada utilizador só vê e altera as suas sessões (a contagem diária do admin
-- e a analítica leem pelo service role / triggers SECURITY DEFINER).
DROP POLICY IF EXISTS "vantur_sessions_select" ON public.vantur_sessions;
CREATE POLICY "vantur_sessions_select" ON public.vantur_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "vantur_sessions_insert" ON public.vantur_sessions;
CREATE POLICY "vantur_sessions_insert" ON public.vantur_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "vantur_sessions_update" ON public.vantur_sessions;
CREATE POLICY "vantur_sessions_update" ON public.vantur_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Os dicionários são geridos pela liderança (Gestão -> VANTUR). Os jogadores
-- não os leem diretamente: as palavras secretas saem pelas RPCs abaixo.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vantur_dictionary', 'portuguese_words']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (public.get_my_role() IN (''dirigente'',''coordenador''))
         WITH CHECK (public.get_my_role() IN (''dirigente'',''coordenador''))',
      t || '_admin_all', t
    );
  END LOOP;
END;
$$;

-- 4. RPCs de sorteio ------------------------------------------------------
-- O parâmetro chama-se "count" porque é assim que o jogo as chama.
-- SECURITY DEFINER: o jogador recebe só as N palavras sorteadas, nunca o
-- dicionário inteiro. O teto de 10 impede que alguém o despeje pela RPC
-- (o jogo pede no máximo 4, no modo Plex).
--
-- DROP antes do CREATE: o tipo de retorno (e o tipo do parâmetro) da versão
-- antiga não são conhecidos e o CREATE OR REPLACE falha se forem diferentes.
DROP FUNCTION IF EXISTS public.get_random_vantur_words(integer);
DROP FUNCTION IF EXISTS public.get_random_vantur_words(bigint);
DROP FUNCTION IF EXISTS public.get_random_general_words(integer);
DROP FUNCTION IF EXISTS public.get_random_general_words(bigint);

CREATE FUNCTION public.get_random_vantur_words(count integer)
RETURNS TABLE (word text)
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.word
  FROM public.vantur_dictionary d
  WHERE char_length(d.word) = 5
  ORDER BY random()
  LIMIT LEAST(GREATEST($1, 0), 10);
$$;

-- Reserva, quando o dicionário bíblico tem menos palavras do que as pedidas.
CREATE FUNCTION public.get_random_general_words(count integer)
RETURNS TABLE (word_clean text)
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.word_clean
  FROM public.portuguese_words w
  WHERE char_length(w.word_clean) = 5
  ORDER BY random()
  LIMIT LEAST(GREATEST($1, 0), 10);
$$;

REVOKE ALL ON FUNCTION public.get_random_vantur_words(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_random_vantur_words(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_random_vantur_words(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.get_random_general_words(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_random_general_words(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_random_general_words(integer) TO authenticated;
