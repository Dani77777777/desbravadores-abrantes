-- ============================================
-- VANACORO — DADOS DE TESTE: gerar respostas falsas
-- ============================================
-- Cria 6 perguntas de teste JÁ FECHADAS (com o prefixo "[Teste] ") e enche-as de
-- respostas de convidados falsos, para testar a revisão e o jogo sem esperar
-- semanas nem mexer nas perguntas verdadeiras da fila.
--
-- • As perguntas de teste já fecharam: ninguém as vê em /perguntas. Aceitam convidados,
--   porque as respostas falsas são de convidados.
-- • As respostas têm variações de propósito ("Jonas", "jonas!", "Noé", "noe",
--   "frontal" vs "lanterna", "marshmalows" com erro…) para testar o agrupamento.
-- • A pergunta dos animais tem só 9 pessoas: serve para testar o aviso "mínimo 12".
-- • Todas as respostas falsas ficam marcadas com ip_hash = 'teste-vanacoro'.
--
-- Para apagar tudo: supabase-teste-vana-coro-apagar.sql
-- Requer: supabase-setup-vana-coro.sql. Correr no SQL Editor do Supabase.
-- Pode correr-se mais do que uma vez: cada vez acrescenta mais pessoas às mesmas perguntas.
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
  (1, '[Teste] O que nunca falta na mochila de um acampamento?', 22),
  (2, '[Teste] Diz uma personagem bíblica que andou de barco.', 18),
  (3, '[Teste] Diz uma desculpa para chegar atrasado à igreja.', 15),
  (4, '[Teste] Diz um animal que aparece na Bíblia.', 9),
  (5, '[Teste] O que é que se come num almoço partilhado na igreja?', 25),
  (6, '[Teste] Diz uma coisa que se faz à volta de uma fogueira.', 16);

INSERT INTO _teste_respostas VALUES
  -- 1. Mochila
  (1, 'Lanterna', 6), (1, 'lanterna', 4), (1, 'Uma lanterna', 2), (1, 'Frontal', 2), (1, 'luz', 1),
  (1, 'Saco-cama', 5), (1, 'saco cama', 3), (1, 'Saco de cama', 2),
  (1, 'Escova de dentes', 4), (1, 'escova dos dentes', 2), (1, 'Pasta de dentes', 1),
  (1, 'Garrafa de água', 3), (1, 'Cantil', 2), (1, 'água', 2),
  (1, 'Bíblia', 3), (1, 'biblia', 2),
  (1, 'Canivete', 3), (1, 'Repelente', 2), (1, 'Papel higiénico', 2), (1, 'papel higienico', 1),
  (1, 'Bolachas', 2), (1, 'Casaco', 1), (1, 'Kispo', 1), (1, 'Lenço', 1), (1, 'Corda', 1), (1, 'sei lá', 1),
  -- 2. Barco
  (2, 'Jonas', 6), (2, 'jonas', 3), (2, 'Jonas!', 1),
  (2, 'Noé', 6), (2, 'noe', 3), (2, 'Noe', 1),
  (2, 'Pedro', 5), (2, 'São Pedro', 2), (2, 'pedro', 1),
  (2, 'Jesus', 5), (2, 'jesus', 1),
  (2, 'Paulo', 3), (2, 'Apóstolo Paulo', 1),
  (2, 'Os discípulos', 2), (2, 'Moisés', 1), (2, 'Moizés', 1), (2, 'João', 1), (2, 'Tiago', 1),
  -- 3. Desculpa
  (3, 'Adormeci', 6), (3, 'adormeci', 2), (3, 'Acordei tarde', 4), (3, 'acordei tarde', 1),
  (3, 'Trânsito', 5), (3, 'transito', 2), (3, 'Havia muito trânsito', 1),
  (3, 'O carro avariou', 3), (3, 'carro avariado', 1),
  (3, 'A minha mãe demorou', 2), (3, 'Os pais demoraram', 2),
  (3, 'Não encontrava a roupa', 2), (3, 'Estava a chover', 2), (3, 'Perdi o autocarro', 2), (3, 'O cão fugiu', 1),
  -- 4. Animais (poucas pessoas)
  (4, 'Leão', 5), (4, 'leao', 2), (4, 'Cordeiro', 4), (4, 'Ovelha', 3), (4, 'Serpente', 3), (4, 'cobra', 2),
  (4, 'Burro', 2), (4, 'Jumenta', 1), (4, 'Baleia', 2), (4, 'Grande peixe', 1), (4, 'Pomba', 2), (4, 'Corvo', 1),
  -- 5. Almoço partilhado
  (5, 'Lasanha', 6), (5, 'lasanha', 2), (5, 'Lasanha vegetariana', 1),
  (5, 'Arroz', 5), (5, 'arroz', 2), (5, 'Salada', 5), (5, 'salada', 1),
  (5, 'Bolo', 4), (5, 'Bolos', 2), (5, 'Massa no forno', 3), (5, 'Massa', 2),
  (5, 'Empadão', 3), (5, 'empadao', 1), (5, 'Grão', 2), (5, 'Quiche', 2), (5, 'Sopa', 2), (5, 'Fruta', 2), (5, 'Hambúrgueres de soja', 1),
  -- 6. Fogueira
  (6, 'Cantar', 6), (6, 'cantar', 2), (6, 'Cânticos', 2), (6, 'Cantar músicas', 1),
  (6, 'Contar histórias', 5), (6, 'Histórias', 2),
  (6, 'Assar marshmallows', 4), (6, 'marshmallows', 2), (6, 'Marshmalows', 1),
  (6, 'Conversar', 3), (6, 'Falar', 1), (6, 'Aquecer', 2), (6, 'Aquecer as mãos', 1),
  (6, 'Orar', 2), (6, 'Oração', 1), (6, 'Comer', 2), (6, 'Jogos', 1);

-- As perguntas de teste (abriram há 14 dias e fecharam há 7). Se já existirem, reaproveita-as.
INSERT INTO public.vanacoro_questions (prompt, allow_guests, opens_at, closes_at, created_at)
SELECT p.prompt, true, now() - interval '14 days', now() - interval '7 days', now() - interval '20 days'
FROM _teste_perguntas p
WHERE NOT EXISTS (SELECT 1 FROM public.vanacoro_questions q WHERE q.prompt = p.prompt);

-- Perguntas criadas por uma versão anterior deste script (eram "só membros")
UPDATE public.vanacoro_questions SET allow_guests = true
WHERE prompt LIKE '[Teste] %' AND allow_guests = false;

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
        -- "Noé" e "noe" da mesma pessoa contam como a mesma: a segunda é ignorada.
        INSERT INTO public.vanacoro_answers (question_id, guest_id, ip_hash, raw_text, normalized_text, created_at)
        VALUES (v_question, v_guest, 'teste-vanacoro', r.texto, pg_temp.vanacoro_norm(r.texto), v_quando)
        ON CONFLICT (question_id, respondent_key, normalized_text) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

DROP TABLE IF EXISTS pg_temp._teste_perguntas;
DROP TABLE IF EXISTS pg_temp._teste_respostas;

-- Confirmação: pessoas e respostas por pergunta de teste
SELECT q.prompt,
       count(DISTINCT a.respondent_key) AS pessoas,
       count(a.id) AS respostas
FROM public.vanacoro_questions q
LEFT JOIN public.vanacoro_answers a ON a.question_id = q.id
WHERE q.prompt LIKE '[Teste] %'
GROUP BY q.prompt
ORDER BY q.prompt;
