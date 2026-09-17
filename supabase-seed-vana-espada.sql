-- ============================================
-- SEED: banco de versiculos do VanaEspada (Modo A, "Onde Esta?")
-- ============================================
-- 43 versiculos conhecidos, com o texto na tradicao Almeida (ACF) — a mesma que
-- a Biblia Online usa e para onde os links e os QR codes do jogo apontam.
--
-- Requer: supabase-setup-vana-espada.sql
-- Corre no SQL Editor do Supabase.
--
-- IDEMPOTENTE: cada linha so entra se ainda nao existir um versiculo com o mesmo
-- livro + capitulo + versiculo inicial. Correr duas vezes nao duplica nada, e as
-- alteracoes que fizeres no admin NAO sao revertidas.
--
-- ✅ CONFERIDO a 2026-09-17, excerto a excerto, contra https://www.bibliaonline.com.br/acf
-- Se editares algum excerto aqui, atualiza tambem o banco que ja esta em producao
-- (ver supabase-migration-vana-espada-acf-fix.sql).
--
-- ⚠️ ANTES DO PRIMEIRO JOGO A SERIO: confere cada excerto numa Biblia fisica ou
-- em https://www.bibliaonline.com.br/acf . O texto foi escrito a partir da
-- tradicao Almeida, mas pode ter diferencas de palavra face a edicao exata do
-- clube — e num jogo de versos de memoria a redacao conta. Na pagina de gestao
-- ves cada versiculo com a sua referencia, o que torna a conferencia rapida.
--
-- ⚠️ DIREITOS DE AUTOR: sao excertos curtos (uma frase por versiculo) e o
-- projetor mostra sempre a traducao, como manda a seccao 8.1 do docs/VanaEspada.md.
-- Se o clube usar outra traducao, edita os excertos no admin e muda o campo
-- "Traducao" — nao e preciso mexer neste ficheiro.
--
-- DIFICULDADE = quao dificil e LOCALIZAR o versiculo, nao quao conhecido ele e:
--   easy    toda a gente sabe a referencia de cor (Gn 1:1, Sl 23:1, Jo 3:16)
--   medium  sabe-se o livro, o capitulo ja custa
--   hard    precisa de conhecer mesmo a Biblia
-- ============================================

INSERT INTO public.vanaespada_verses
  (book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags)
SELECT s.book_id, s.chapter, s.verse_start, s.verse_end, s.excerpt, s.translation, s.difficulty, s.tags
FROM (
  VALUES
    -- ── FACEIS ────────────────────────────────────────────────
    (1::smallint, 1::smallint, 1::smallint, 1::smallint,
     'No princípio criou Deus os céus e a terra.',
     'Almeida (ACF)', 'easy', ARRAY['criação','memorização']::text[]),

    (2, 20, 8, 8,
     'Lembra-te do dia do sábado, para o santificar.',
     'Almeida (ACF)', 'easy', ARRAY['sábado','memorização']),

    (6, 1, 9, 9,
     'Não to mandei eu? Esforça-te, e tem bom ânimo; não temas, nem te espantes; porque o SENHOR teu Deus é contigo, por onde quer que andares.',
     'Almeida (ACF)', 'easy', ARRAY['coragem','desbravadores']),

    (19, 23, 1, 1,
     'O SENHOR é o meu pastor, nada me faltará.',
     'Almeida (ACF)', 'easy', ARRAY['confiança','memorização']),

    (19, 119, 105, 105,
     'Lâmpada para os meus pés é tua palavra, e luz para o meu caminho.',
     'Almeida (ACF)', 'easy', ARRAY['palavra','memorização']),

    (20, 3, 5, 6,
     'Confia no SENHOR de todo o teu coração, e não te estribes no teu próprio entendimento. Reconhece-o em todos os teus caminhos, e ele endireitará as tuas veredas.',
     'Almeida (ACF)', 'easy', ARRAY['confiança','desbravadores']),

    (23, 40, 31, 31,
     'Mas os que esperam no SENHOR renovarão as forças, subirão com asas como águias; correrão, e não se cansarão; caminharão, e não se fatigarão.',
     'Almeida (ACF)', 'easy', ARRAY['esperança','memorização']),

    (40, 6, 33, 33,
     'Mas, buscai primeiro o reino de Deus, e a sua justiça, e todas estas coisas vos serão acrescentadas.',
     'Almeida (ACF)', 'easy', ARRAY['reino','memorização']),

    (43, 3, 16, 16,
     'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna.',
     'Almeida (ACF)', 'easy', ARRAY['salvação','memorização']),

    (45, 6, 23, 23,
     'Porque o salário do pecado é a morte, mas o dom gratuito de Deus é a vida eterna, por Cristo Jesus nosso Senhor.',
     'Almeida (ACF)', 'easy', ARRAY['salvação','memorização']),

    (49, 6, 17, 17,
     'Tomai também o capacete da salvação, e a espada do Espírito, que é a palavra de Deus.',
     'Almeida (ACF)', 'easy', ARRAY['armadura','palavra']),

    (50, 4, 13, 13,
     'Posso todas as coisas em Cristo que me fortalece.',
     'Almeida (ACF)', 'easy', ARRAY['força','memorização']),

    (62, 1, 9, 9,
     'Se confessarmos os nossos pecados, ele é fiel e justo para nos perdoar os pecados, e nos purificar de toda a injustiça.',
     'Almeida (ACF)', 'easy', ARRAY['perdão','memorização']),

    -- ── MEDIOS ────────────────────────────────────────────────
    (5, 6, 5, 5,
     'Amarás, pois, o SENHOR teu Deus de todo o teu coração, e de toda a tua alma, e de todas as tuas forças.',
     'Almeida (ACF)', 'medium', ARRAY['amor','lei']),

    (19, 46, 1, 1,
     'Deus é o nosso refúgio e fortaleza, socorro bem presente na angústia.',
     'Almeida (ACF)', 'medium', ARRAY['confiança']),

    (24, 29, 11, 11,
     'Porque eu bem sei os pensamentos que tenho a vosso respeito, diz o SENHOR; pensamentos de paz, e não de mal, para vos dar o fim que esperais.',
     'Almeida (ACF)', 'medium', ARRAY['promessa','memorização']),

    (27, 6, 22, 22,
     'O meu Deus enviou o seu anjo, e fechou a boca dos leões, para que não me fizessem dano…',
     'Almeida (ACF)', 'medium', ARRAY['proteção','história']),

    (40, 5, 13, 13,
     'Vós sois o sal da terra; e se o sal for insípido, com que se há de salgar?',
     'Almeida (ACF)', 'medium', ARRAY['discipulado']),

    (40, 28, 19, 19,
     'Portanto ide, fazei discípulos de todas as nações, batizando-os em nome do Pai, e do Filho, e do Espírito Santo.',
     'Almeida (ACF)', 'medium', ARRAY['missão','memorização']),

    (41, 16, 15, 15,
     'E disse-lhes: Ide por todo o mundo, pregai o evangelho a toda criatura.',
     'Almeida (ACF)', 'medium', ARRAY['missão']),

    (42, 2, 7, 7,
     'E deu à luz a seu filho primogênito, e envolveu-o em panos, e deitou-o numa manjedoura, porque não havia lugar para eles na estalagem.',
     'Almeida (ACF)', 'medium', ARRAY['natal','história']),

    (43, 11, 35, 35,
     'Jesus chorou.',
     'Almeida (ACF)', 'medium', ARRAY['curiosidade']),

    (43, 14, 6, 6,
     'Disse-lhe Jesus: Eu sou o caminho, e a verdade e a vida; ninguém vem ao Pai, senão por mim.',
     'Almeida (ACF)', 'medium', ARRAY['salvação','memorização']),

    (44, 2, 4, 4,
     'E todos foram cheios do Espírito Santo, e começaram a falar noutras línguas, conforme o Espírito lhes concedia que falassem.',
     'Almeida (ACF)', 'medium', ARRAY['espírito','história']),

    (45, 8, 28, 28,
     'E sabemos que todas as coisas contribuem juntamente para o bem daqueles que amam a Deus, daqueles que são chamados segundo o seu propósito.',
     'Almeida (ACF)', 'medium', ARRAY['promessa','memorização']),

    (46, 13, 4, 4,
     'O amor é sofredor, é benigno; o amor não é invejoso; o amor não trata com leviandade, não se ensoberbece.',
     'Almeida (ACF)', 'medium', ARRAY['amor']),

    (48, 5, 22, 23,
     'Mas o fruto do Espírito é: amor, gozo, paz, longanimidade, benignidade, bondade, fé, mansidão, temperança. Contra estas coisas não há lei.',
     'Almeida (ACF)', 'medium', ARRAY['espírito','desbravadores']),

    (55, 3, 16, 16,
     'Toda a Escritura é divinamente inspirada, e proveitosa para ensinar, para repreender, para corrigir, para instruir em justiça.',
     'Almeida (ACF)', 'medium', ARRAY['palavra','memorização']),

    (58, 11, 1, 1,
     'Ora, a fé é o firme fundamento das coisas que se esperam, e a prova das coisas que não se veem.',
     'Almeida (ACF)', 'medium', ARRAY['fé','memorização']),

    -- ── DIFICEIS ──────────────────────────────────────────────
    (1, 1, 27, 27,
     'E criou Deus o homem à sua imagem; à imagem de Deus o criou; homem e mulher os criou.',
     'Almeida (ACF)', 'hard', ARRAY['criação']),

    (2, 14, 14, 14,
     'O SENHOR pelejará por vós, e vós vos calareis.',
     'Almeida (ACF)', 'hard', ARRAY['confiança','história']),

    (9, 16, 7, 7,
     'Porque o SENHOR não vê como vê o homem, pois o homem vê o que está diante dos olhos, porém o SENHOR olha para o coração.',
     'Almeida (ACF)', 'hard', ARRAY['carácter','história']),

    (9, 17, 45, 45,
     'Tu vens a mim com espada, e com lança, e com escudo; porém eu venho a ti em nome do SENHOR dos Exércitos, o Deus dos exércitos de Israel, a quem tens afrontado.',
     'Almeida (ACF)', 'hard', ARRAY['coragem','história']),

    (19, 133, 1, 1,
     'Oh! Quão bom e quão suave é que os irmãos vivam em união.',
     'Almeida (ACF)', 'hard', ARRAY['união','desbravadores']),

    (20, 22, 6, 6,
     'Educa a criança no caminho em que deve andar; e até quando envelhecer não se desviará dele.',
     'Almeida (ACF)', 'hard', ARRAY['educação']),

    (21, 12, 1, 1,
     'Lembra-te também do teu Criador nos dias da tua mocidade, antes que venham os maus dias…',
     'Almeida (ACF)', 'hard', ARRAY['juventude','desbravadores']),

    (23, 41, 10, 10,
     'Não temas, porque eu sou contigo; não te assombres, porque eu sou teu Deus; eu te fortaleço, e te ajudo, e te sustento com a destra da minha justiça.',
     'Almeida (ACF)', 'hard', ARRAY['coragem','promessa']),

    (33, 6, 8, 8,
     'Ele te declarou, ó homem, o que é bom; e que é o que o SENHOR pede de ti, senão que pratiques a justiça, e ames a benignidade, e andes humildemente com o teu Deus?',
     'Almeida (ACF)', 'hard', ARRAY['justiça','humildade']),

    (44, 1, 8, 8,
     'Mas recebereis o poder do Espírito Santo, que há de vir sobre vós; e ser-me-eis testemunhas, tanto em Jerusalém como em toda a Judeia e Samaria, e até aos confins da terra.',
     'Almeida (ACF)', 'hard', ARRAY['missão','espírito']),

    (45, 12, 2, 2,
     'E não sejais conformados com este mundo, mas sede transformados pela renovação do vosso entendimento, para que experimenteis qual seja a boa, agradável, e perfeita vontade de Deus.',
     'Almeida (ACF)', 'hard', ARRAY['carácter']),

    (51, 3, 23, 23,
     'E tudo quanto fizerdes, fazei-o de todo o coração, como ao Senhor, e não aos homens.',
     'Almeida (ACF)', 'hard', ARRAY['serviço','desbravadores']),

    (66, 14, 6, 6,
     'E vi outro anjo voar pelo meio do céu, e tinha o evangelho eterno, para o proclamar aos que habitam sobre a terra, e a toda a nação, e tribo, e língua, e povo.',
     'Almeida (ACF)', 'hard', ARRAY['profecia','missão']),

    (66, 21, 4, 4,
     'E Deus limpará de seus olhos toda a lágrima; e não haverá mais morte, nem pranto, nem clamor, nem dor; porque já as primeiras coisas são passadas.',
     'Almeida (ACF)', 'hard', ARRAY['esperança','promessa'])
) AS s(book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty, tags)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.vanaespada_verses e
  WHERE e.book_id = s.book_id
    AND e.chapter = s.chapter
    AND e.verse_start = s.verse_start
);

-- ============================================
-- Confirmacao: quantos versiculos ficaram disponiveis por dificuldade.
-- O "Onde Esta?" so sorteia versiculos ativos COM excerto.
-- ============================================
SELECT
  difficulty,
  count(*) AS total,
  count(*) FILTER (WHERE active AND excerpt IS NOT NULL) AS jogaveis
FROM public.vanaespada_verses
GROUP BY difficulty
ORDER BY CASE difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END;
