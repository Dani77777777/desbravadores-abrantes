-- ============================================
-- MIGRAÇÃO: Eventos online
-- ============================================
-- Um evento pode ser presencial (como até agora: texto do local + ponto no mapa)
-- ou online, com o link da reunião (Google Meet, Zoom, Teams, YouTube…).
-- O link é opcional ao criar — pode ser acrescentado mais tarde ao editar.
--
-- O link só é visível para membros com sessão (Painel). Os visitantes da página
-- inicial veem apenas "Online": o papel anon perde o acesso à coluna online_url.
--
-- Corre este ficheiro no SQL Editor do Supabase. É idempotente.
-- ============================================

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS online_url text;

-- Só links http(s), e só em eventos online
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_online_url_check;
ALTER TABLE public.events ADD CONSTRAINT events_online_url_check CHECK (
  online_url IS NULL
  OR (is_online AND online_url ~* '^https?://\S+$' AND length(online_url) <= 2000)
);

-- Visitantes (anon): todas as colunas dos eventos menos o link.
-- O GRANT de tabela inteira tapa os de coluna, por isso tira-se o da tabela e dão-se
-- as colunas uma a uma. Colunas que se criem depois NÃO ficam visíveis ao anon —
-- se a página inicial passar a precisar de uma, volta a correr este bloco.
REVOKE SELECT ON public.events FROM anon;
DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'events' AND column_name <> 'online_url';
  EXECUTE format('GRANT SELECT (%s) ON public.events TO anon', v_cols);
END $$;
