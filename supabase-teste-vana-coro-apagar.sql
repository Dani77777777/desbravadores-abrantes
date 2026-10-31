-- ============================================
-- VANACORO — DADOS DE TESTE: apagar
-- ============================================
-- Apaga tudo o que supabase-teste-vana-coro-gerar.sql criou:
--   • as perguntas com o prefixo "[Teste] " (e, em cascata, as respostas delas);
--   • qualquer resposta falsa marcada com ip_hash = 'teste-vanacoro'.
-- Não toca nas perguntas verdadeiras nem nas respostas verdadeiras.
-- Nas fases seguintes, os grupos e o quadro das perguntas de teste também saem
-- em cascata com a pergunta.
--
-- Correr no SQL Editor do Supabase. Pode correr-se as vezes que quiseres.
-- ============================================

DELETE FROM public.vanacoro_answers WHERE ip_hash = 'teste-vanacoro';

DELETE FROM public.vanacoro_questions WHERE prompt LIKE '[Teste] %';

-- Confirmação: tem de dar 0 e 0
SELECT
  (SELECT count(*) FROM public.vanacoro_questions WHERE prompt LIKE '[Teste] %') AS perguntas_de_teste,
  (SELECT count(*) FROM public.vanacoro_answers WHERE ip_hash = 'teste-vanacoro') AS respostas_de_teste;
