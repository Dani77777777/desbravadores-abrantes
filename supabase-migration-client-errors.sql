-- ============================================
-- REGISTO DE ERROS DO CLIENTE
-- Desbravadores Abrantes
-- ============================================
-- Quando um ecrã rebenta no browser (os "Application error: a client-side
-- exception has occurred" dos eventos ao vivo), o ecrã de recuperação
-- (components/game-error/GameErrorScreen.tsx e app/global-error.tsx) chama a
-- server action logClientError, que guarda aqui uma linha por erro.
--
-- Corre este ficheiro inteiro no SQL Editor do Supabase. É idempotente.
--
--  • Qualquer pessoa pode INSERIR (anon e authenticated): os convidados dos
--    jogos também têm erros. Ninguém pode alterar nem apagar.
--  • Só a coordenação real LÊ (get_my_real_role() = 'coordenador').
--  • Os limites de tamanho estão também na tabela, porque o INSERT está aberto.
--  • url guarda só o caminho (sem query string): nada de tokens nem emails.
--
-- Para ver os últimos erros:
--   SELECT created_at, game, session_id, message, url, user_agent
--   FROM public.client_error_logs ORDER BY created_at DESC LIMIT 50;
-- Para limpar os antigos (no SQL Editor):
--   DELETE FROM public.client_error_logs WHERE created_at < now() - interval '90 days';
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_error_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  url         text,
  game        text,          -- 'vana-quest', 'vana-camp', ... ou NULL fora dos jogos
  session_id  text,          -- sessão do jogo, quando o endereço a tem
  message     text,
  stack       text,
  digest      text,          -- identificador do Next.js para erros do servidor
  user_agent  text,

  CONSTRAINT client_error_logs_sizes_check CHECK (
    char_length(COALESCE(url, '')) <= 500
    AND char_length(COALESCE(game, '')) <= 50
    AND char_length(COALESCE(session_id, '')) <= 100
    AND char_length(COALESCE(message, '')) <= 500
    AND char_length(COALESCE(stack, '')) <= 4000
    AND char_length(COALESCE(digest, '')) <= 100
    AND char_length(COALESCE(user_agent, '')) <= 400
  )
);

CREATE INDEX IF NOT EXISTS client_error_logs_created_idx
  ON public.client_error_logs (created_at DESC);

ALTER TABLE public.client_error_logs ENABLE ROW LEVEL SECURITY;

-- Inserir: aberto a todos, mas ninguém regista um erro em nome de outra pessoa.
DROP POLICY IF EXISTS "Erros do cliente: qualquer pessoa regista" ON public.client_error_logs;
CREATE POLICY "Erros do cliente: qualquer pessoa regista" ON public.client_error_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Ler: só a coordenação real.
DROP POLICY IF EXISTS "Erros do cliente: coordenação real lê" ON public.client_error_logs;
CREATE POLICY "Erros do cliente: coordenação real lê" ON public.client_error_logs
  FOR SELECT TO authenticated
  USING (public.get_my_real_role() = 'coordenador');

REVOKE ALL ON public.client_error_logs FROM PUBLIC, anon, authenticated;
GRANT INSERT ON public.client_error_logs TO anon, authenticated;
GRANT SELECT ON public.client_error_logs TO authenticated;
GRANT ALL ON public.client_error_logs TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
