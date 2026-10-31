-- ============================================
-- VANACORO — DADOS DE TESTE: mais 6 perguntas para o banco
-- ============================================
-- Acrescenta 6 perguntas de teste JÁ FECHADAS (prefixo "[Teste] "), todas com 14+
-- pessoas, para chegares às ~8–9 perguntas prontas que um jogo precisa e testares a
-- Fase 3 (jogo ao vivo). Não mexe nas 6 do supabase-teste-vana-coro-gerar.sql.
--
-- • As respostas dizem o mesmo por palavras diferentes ("Água em vinho" / "Transformou
--   a água em vinho", "Lais de guia" / "Bowline", "Davi" / "Dávide"…): bom para a IA.
-- • Há algumas armadilhas: "Banana" e "Fruta", "Torradas" e "Pão" (parecidas, mas não
--   iguais) e um "Nó cego" para esconderes como lixo.
-- • Todas as respostas falsas ficam marcadas com ip_hash = 'teste-vanacoro'.
--
-- Para apagar tudo (estas e as outras de teste): supabase-teste-vana-coro-apagar.sql
-- Requer: supabase-setup-vana-coro.sql. Correr no SQL Editor do Supabase.
-- Pode correr-se mais do que uma vez: cada vez acrescenta mais pessoas a estas 6.
-- ============================================

-- A mesma normalização do site (utils/vana-coro/normalize.ts), para o português
CREATE OR REPLACE FUNCTION pg_temp.vanacoro_norm(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    trim(regexp_replace(
      regexp_replace(
        translate(lower(t), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
        '[^a-z0-9 ]', ' ', 'g'),
      '\s+', ' ', 'g')),
    '^(o|a|os|as|um|uma|uns|umas) (.)', '\2')
$$;

DROP TABLE IF EXISTS pg_temp._teste_perguntas;
DROP TABLE IF EXISTS pg_temp._teste_respostas;
CREATE TEMP TABLE _teste_perguntas (k int PRIMARY KEY, prompt text, pessoas int);
CREATE TEMP TABLE _teste_respostas (k int, texto text, peso int);

INSERT INTO _teste_perguntas VALUES
  (7,  '[Teste] Diz um milagre de Jesus.', 20),
  (8,  '[Teste] Diz uma peça do uniforme de um desbravador.', 18),
  (9,  '[Teste] O que é que se come ao pequeno-almoço?', 24),
  (10, '[Teste] Diz um rei da Bíblia.', 17),
  (11, '[Teste] Diz uma coisa que se faz ao sábado à tarde.', 21),
  (12, '[Teste] Diz um nó que um desbravador deve saber fazer.', 14);

INSERT INTO _teste_respostas VALUES
  -- 7. Milagres
  (7, 'Multiplicação dos pães', 5), (7, 'Pães e peixes', 3), (7, 'multiplicou os pães', 2), (7, 'multiplicaçao dos paes', 1),
  (7, 'Água em vinho', 5), (7, 'Transformou a água em vinho', 3), (7, 'agua em vinho', 2), (7, 'Bodas de Caná', 1),
  (7, 'Andar sobre as águas', 4), (7, 'Andou sobre o mar', 2), (7, 'caminhar na água', 1),
  (7, 'Ressuscitar Lázaro', 3), (7, 'Lázaro', 3), (7, 'lazaro', 1),
  (7, 'Curou o cego', 3), (7, 'Cego de nascença', 1), (7, 'Acalmou a tempestade', 2), (7, 'Curou os leprosos', 2),
  -- 8. Uniforme
  (8, 'Lenço', 6), (8, 'lenço', 3), (8, 'lenco', 1), (8, 'Lenço amarelo', 1),
  (8, 'Camisa', 4), (8, 'Camisa caqui', 2), (8, 'camisa', 1),
  (8, 'Anel do lenço', 3), (8, 'Passador', 1), (8, 'anel', 1),
  (8, 'Cinto', 3), (8, 'Calças', 3), (8, 'calça', 1),
  (8, 'Boné', 2), (8, 'Emblemas', 2), (8, 'Insígnias', 1), (8, 'Especialidades', 1), (8, 'Botas', 1),
  -- 9. Pequeno-almoço
  (9, 'Cereais', 6), (9, 'cereais', 2), (9, 'Corn flakes', 1), (9, 'Cereal', 1),
  (9, 'Pão', 4), (9, 'Pão com manteiga', 3), (9, 'pao', 1),
  (9, 'Torradas', 4), (9, 'torrada', 1),
  (9, 'Leite', 4), (9, 'Leite com chocolate', 2), (9, 'Leite com cereais', 1),
  (9, 'Fruta', 3), (9, 'Banana', 2), (9, 'Iogurte', 3), (9, 'iogurte', 1),
  (9, 'Panquecas', 2), (9, 'Pancakes', 1), (9, 'Ovos mexidos', 2), (9, 'Café com leite', 2), (9, 'Galão', 1),
  -- 10. Reis
  (10, 'David', 6), (10, 'Davi', 2), (10, 'Dávide', 1), (10, 'Rei David', 2),
  (10, 'Salomão', 5), (10, 'salomao', 2),
  (10, 'Saul', 4), (10, 'saul', 1),
  (10, 'Herodes', 3), (10, 'Nabucodonosor', 2), (10, 'Nabuco', 1),
  (10, 'Ezequias', 1), (10, 'Josias', 1), (10, 'Acabe', 1), (10, 'Jesus, o Rei dos reis', 1),
  -- 11. Sábado à tarde
  (11, 'Passear', 4), (11, 'Dar um passeio', 3), (11, 'Caminhada', 2), (11, 'passeio na natureza', 1),
  (11, 'Desbravadores', 4), (11, 'Reunião do clube', 2), (11, 'clube', 1),
  (11, 'Dormir a sesta', 3), (11, 'Sesta', 2), (11, 'dormir', 1),
  (11, 'JA', 3), (11, 'Ir ao JA', 2), (11, 'Programa JA', 1),
  (11, 'Estar com os amigos', 2), (11, 'Visitar a família', 2), (11, 'Ler a Bíblia', 2), (11, 'Almoço em família', 1),
  -- 12. Nós
  (12, 'Nó direito', 5), (12, 'no direito', 2), (12, 'Nó quadrado', 1),
  (12, 'Lais de guia', 4), (12, 'Laís de guia', 2), (12, 'Bowline', 1),
  (12, 'Nó de oito', 3), (12, 'Nó em oito', 1),
  (12, 'Volta do fiel', 3), (12, 'volta de fiel', 1),
  (12, 'Nó de escota', 2), (12, 'Nó de correr', 2), (12, 'Catau', 1), (12, 'Nó cego', 1);

-- As perguntas (abriram há 14 dias e fecharam há 7). Se já existirem, reaproveita-as.
INSERT INTO public.vanacoro_questions (prompt, allow_guests, opens_at, closes_at, created_at)
SELECT p.prompt, true, now() - interval '14 days', now() - interval '7 days', now() - interval '20 days'
FROM _teste_perguntas p
WHERE NOT EXISTS (SELECT 1 FROM public.vanacoro_questions q WHERE q.prompt = p.prompt);

-- As respostas: cada pessoa falsa dá 1 a 3 respostas, escolhidas ao acaso pelo peso
-- (amostragem sem repetição: ordenar por -ln(random()) / peso).
DO $$
DECLARE
  p record;
  r record;
  v_question uuid;
  v_guest uuid;
  v_quantas int;
  v_quando timestamptz;
BEGIN
  FOR p IN SELECT * FROM _teste_perguntas ORDER BY k LOOP
    SELECT id INTO v_question FROM public.vanacoro_questions WHERE prompt = p.prompt;

    FOR i IN 1..p.pessoas LOOP
      v_guest := gen_random_uuid();
      v_quantas := CASE WHEN random() < 0.4 THEN 1 WHEN random() < 0.7 THEN 2 ELSE 3 END;
      v_quando := now() - interval '14 days' + random() * interval '7 days';

      FOR r IN
        SELECT texto FROM _teste_respostas
        WHERE k = p.k
        ORDER BY -ln(random()) / peso
        LIMIT v_quantas
      LOOP
        -- "Lenço" e "lenço" da mesma pessoa contam como a mesma: a segunda é ignorada.
        INSERT INTO public.vanacoro_answers (question_id, guest_id, ip_hash, raw_text, normalized_text, created_at)
        VALUES (v_question, v_guest, 'teste-vanacoro', r.texto, pg_temp.vanacoro_norm(r.texto), v_quando)
        ON CONFLICT (question_id, respondent_key, normalized_text) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

DROP TABLE IF EXISTS pg_temp._teste_perguntas;
DROP TABLE IF EXISTS pg_temp._teste_respostas;

-- Confirmação: pessoas e respostas por pergunta de teste (todas, as 12)
SELECT q.prompt,
       count(DISTINCT a.respondent_key) AS pessoas,
       count(a.id) AS respostas
FROM public.vanacoro_questions q
LEFT JOIN public.vanacoro_answers a ON a.question_id = q.id
WHERE q.prompt LIKE '[Teste] %'
GROUP BY q.prompt
ORDER BY q.prompt;
