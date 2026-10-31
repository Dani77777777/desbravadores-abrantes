-- ============================================
-- VANACORO — primeiras 44 perguntas da "Pergunta da Semana"
-- Ficam todas NA FILA (sem data). Para lhes dar data, carrega em "Agendar fila"
-- em /admin/vana-coro: abrem de 7 em 7 dias às 18:00 (ou de 3 em 3 com o modo turbo).
--
-- Requer: supabase-setup-vana-coro.sql.
-- Correr no SQL Editor do Supabase. É idempotente: uma pergunta com o mesmo
-- texto não é inserida duas vezes.
-- A ordem de created_at é a ordem do "Agendar fila" (temas alternados).
-- ============================================

INSERT INTO public.vanacoro_questions (prompt, allow_guests, created_at)
SELECT q.prompt, q.allow_guests, now() + q.ord * interval '1 millisecond'
FROM (VALUES
  ( 1, 'O que nunca falta na mochila de um acampamento?', true),
  ( 2, 'Diz uma personagem bíblica que andou de barco.', true),
  ( 3, 'Diz uma desculpa para chegar atrasado à igreja.', true),
  ( 4, 'Diz uma peça do uniforme de um desbravador.', true),
  ( 5, 'O que é que se come ao pequeno-almoço?', true),
  ( 6, 'Diz um milagre de Jesus.', true),
  ( 7, 'Diz uma coisa que se faz à volta de uma fogueira.', true),
  ( 8, 'O que é que se come num almoço partilhado na igreja?', true),
  ( 9, 'Diz um animal que aparece na Bíblia.', true),
  (10, 'Diz uma coisa que os pais dizem sempre.', true),
  (11, 'Diz um nó que um desbravador deve saber fazer.', true),
  (12, 'Diz uma personagem da Bíblia que era muito corajosa.', true),
  (13, 'Diz uma coisa que se esquece sempre de levar para um acampamento.', true),
  (14, 'Diz uma coisa que se faz ao sábado à tarde.', true),
  (15, 'Diz uma comida que aparece na Bíblia.', true),
  (16, 'Diz uma coisa que se leva para a praia.', true),
  (17, 'Diz um bicho que pode aparecer na tenda durante a noite.', true),
  (18, 'Diz uma parábola de Jesus.', true),
  (19, 'O que é que se leva para a igreja ao sábado?', true),
  (20, 'Diz uma coisa que se aprende nos Desbravadores.', true),
  (21, 'Diz um rei da Bíblia.', true),
  (22, 'Diz uma razão para não conseguires dormir num acampamento.', true),
  (23, 'Diz uma coisa que se faz antes de dormir.', true),
  (24, 'Diz uma história da Bíblia em que aparece água.', true),
  (25, 'Diz uma atividade que se faz numa reunião do clube.', true),
  (26, 'Diz uma coisa que distrai as pessoas durante o sermão.', true),
  (27, 'Diz uma profissão que aparece na Bíblia.', true),
  (28, 'O que é que se cozinha numa fogueira?', true),
  (29, 'Diz uma personagem bíblica que passou fome.', true),
  (30, 'Diz um desporto que se joga no recreio da escola.', true),
  (31, 'Diz uma coisa que pode correr mal ao montar uma tenda.', true),
  (32, 'Diz um livro da Bíblia que toda a gente conhece.', true),
  (33, 'Diz uma frase que os dirigentes repetem muitas vezes.', false),
  (34, 'Diz uma coisa que se usa para te orientares na natureza.', true),
  (35, 'Diz uma personagem da Bíblia que fugiu de alguém.', true),
  (36, 'Diz um cântico que toda a gente sabe cantar.', true),
  (37, 'Diz uma coisa que se encontra numa floresta.', true),
  (38, 'Diz uma coisa que faz um bom amigo.', true),
  (39, 'Diz um sítio onde o clube devia ir numa saída.', true),
  (40, 'Diz uma coisa que se faz nas férias de verão.', true),
  (41, 'O que é que um desbravador leva sempre para uma reunião do clube?', false),
  (42, 'Diz uma personagem bíblica que viveu numa cidade grande.', true),
  (43, 'Diz uma coisa que se vê no céu à noite num acampamento.', true),
  (44, 'Diz uma coisa que se faz quando chove num acampamento.', true)
) AS q(ord, prompt, allow_guests)
WHERE NOT EXISTS (
  SELECT 1 FROM public.vanacoro_questions e WHERE e.prompt = q.prompt
);

-- Confirmação
SELECT count(*) AS perguntas_na_fila
FROM public.vanacoro_questions
WHERE opens_at IS NULL;
