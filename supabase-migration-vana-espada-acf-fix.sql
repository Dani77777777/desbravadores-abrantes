-- ============================================
-- FIX: alinhar o banco de versiculos do VanaEspada com a ACF
-- ============================================
-- Conferido excerto a excerto contra https://www.bibliaonline.com.br/acf
-- em 2026-09-17. Dos 42 versiculos ativos com excerto, 30 ja batiam certo;
-- os restantes tinham texto de uma Almeida mais antiga (Corrigida / ARC)
-- creditado como "Almeida (ACF)".
--
-- IDEMPOTENTE: sao UPDATEs por livro+capitulo+versiculo. Correr duas vezes
-- nao muda nada. Nao apaga nem cria linhas.
--
-- Corre no SQL Editor do Supabase. No fim ha um SELECT de conferencia.
-- ============================================

BEGIN;

-- ============================================
-- 1. TEXTO TROCADO (nao era ACF)
-- ============================================

-- Genesis 1:27 — "macho e femea" -> "homem e mulher"
UPDATE public.vanaespada_verses SET excerpt =
  'E criou Deus o homem à sua imagem; à imagem de Deus o criou; homem e mulher os criou.'
WHERE book_id = 1 AND chapter = 1 AND verse_start = 27;

-- Proverbios 22:6 — "Instrui o menino" -> "Educa a criança"
UPDATE public.vanaespada_verses SET excerpt =
  'Educa a criança no caminho em que deve andar; e até quando envelhecer não se desviará dele.'
WHERE book_id = 20 AND chapter = 22 AND verse_start = 6;

-- Isaias 40:31 — "as suas forças" -> "as forças"
UPDATE public.vanaespada_verses SET excerpt =
  'Mas os que esperam no SENHOR renovarão as forças, subirão com asas como águias; correrão, e não se cansarão; caminharão, e não se fatigarão.'
WHERE book_id = 23 AND chapter = 40 AND verse_start = 31;

-- Jeremias 29:11 — "que penso de vos" -> "que tenho a vosso respeito"
UPDATE public.vanaespada_verses SET excerpt =
  'Porque eu bem sei os pensamentos que tenho a vosso respeito, diz o SENHOR; pensamentos de paz, e não de mal, para vos dar o fim que esperais.'
WHERE book_id = 24 AND chapter = 29 AND verse_start = 11;

-- Miqueias 6:8 — "beneficencia" -> "benignidade"
UPDATE public.vanaespada_verses SET excerpt =
  'Ele te declarou, ó homem, o que é bom; e que é o que o SENHOR pede de ti, senão que pratiques a justiça, e ames a benignidade, e andes humildemente com o teu Deus?'
WHERE book_id = 33 AND chapter = 6 AND verse_start = 8;

-- Mateus 28:19 — "ensinai todas as nacoes, batizando-as" -> "fazei discipulos de todas as nacoes, batizando-os"
UPDATE public.vanaespada_verses SET excerpt =
  'Portanto ide, fazei discípulos de todas as nações, batizando-os em nome do Pai, e do Filho, e do Espírito Santo.'
WHERE book_id = 40 AND chapter = 28 AND verse_start = 19;

-- Atos 1:8 — "a virtude" -> "o poder"; "Judeia" sem acento na ACF
UPDATE public.vanaespada_verses SET excerpt =
  'Mas recebereis o poder do Espírito Santo, que há de vir sobre vós; e ser-me-eis testemunhas, tanto em Jerusalém como em toda a Judeia e Samaria, e até aos confins da terra.'
WHERE book_id = 44 AND chapter = 1 AND verse_start = 8;

-- Atos 2:4 — "conforme o Espirito Santo lhes concedia" -> "conforme o Espirito lhes concedia"
UPDATE public.vanaespada_verses SET excerpt =
  'E todos foram cheios do Espírito Santo, e começaram a falar noutras línguas, conforme o Espírito lhes concedia que falassem.'
WHERE book_id = 44 AND chapter = 2 AND verse_start = 4;

-- Romanos 12:2 — "nao vos conformeis / transformai-vos" -> "nao sejais conformados / sede transformados"
UPDATE public.vanaespada_verses SET excerpt =
  'E não sejais conformados com este mundo, mas sede transformados pela renovação do vosso entendimento, para que experimenteis qual seja a boa, agradável, e perfeita vontade de Deus.'
WHERE book_id = 45 AND chapter = 12 AND verse_start = 2;

-- 1 Corintios 13:4 — "caridade" -> "amor"
UPDATE public.vanaespada_verses SET excerpt =
  'O amor é sofredor, é benigno; o amor não é invejoso; o amor não trata com leviandade, não se ensoberbece.'
WHERE book_id = 46 AND chapter = 13 AND verse_start = 4;

-- 2 Timoteo 3:16 — "para redarguir" -> "para repreender"
UPDATE public.vanaespada_verses SET excerpt =
  'Toda a Escritura é divinamente inspirada, e proveitosa para ensinar, para repreender, para corrigir, para instruir em justiça.'
WHERE book_id = 55 AND chapter = 3 AND verse_start = 16;

-- Hebreus 11:1 — "que se nao veem" -> "que nao se veem"
UPDATE public.vanaespada_verses SET excerpt =
  'Ora, a fé é o firme fundamento das coisas que se esperam, e a prova das coisas que não se veem.'
WHERE book_id = 58 AND chapter = 11 AND verse_start = 1;

-- ============================================
-- 2. PONTUACAO E MAIUSCULAS
-- ============================================

-- Salmos 133:1 — "Oh! quao" -> "Oh! Quao"
UPDATE public.vanaespada_verses SET excerpt =
  'Oh! Quão bom e quão suave é que os irmãos vivam em união.'
WHERE book_id = 19 AND chapter = 133 AND verse_start = 1;

-- Joao 14:6 — ". Ninguem" -> "; ninguem"
UPDATE public.vanaespada_verses SET excerpt =
  'Disse-lhe Jesus: Eu sou o caminho, e a verdade e a vida; ninguém vem ao Pai, senão por mim.'
WHERE book_id = 43 AND chapter = 14 AND verse_start = 6;

-- Galatas 5:22-23 — o v.23 comeca frase nova na ACF
UPDATE public.vanaespada_verses SET excerpt =
  'Mas o fruto do Espírito é: amor, gozo, paz, longanimidade, benignidade, bondade, fé, mansidão, temperança. Contra estas coisas não há lei.'
WHERE book_id = 48 AND chapter = 5 AND verse_start = 22;

-- Colossenses 3:23 — virgula a mais depois do "E"
UPDATE public.vanaespada_verses SET excerpt =
  'E tudo quanto fizerdes, fazei-o de todo o coração, como ao Senhor, e não aos homens.'
WHERE book_id = 51 AND chapter = 3 AND verse_start = 23;

-- ============================================
-- 3. TETRAGRAMA: no AT a ACF escreve SENHOR em versalete
-- ============================================

-- Deuteronomio 6:5
UPDATE public.vanaespada_verses SET excerpt =
  'Amarás, pois, o SENHOR teu Deus de todo o teu coração, e de toda a tua alma, e de todas as tuas forças.'
WHERE book_id = 5 AND chapter = 6 AND verse_start = 5;

-- Josue 1:9
UPDATE public.vanaespada_verses SET excerpt =
  'Não to mandei eu? Esforça-te, e tem bom ânimo; não temas, nem te espantes; porque o SENHOR teu Deus é contigo, por onde quer que andares.'
WHERE book_id = 6 AND chapter = 1 AND verse_start = 9;

-- 1 Samuel 17:45
UPDATE public.vanaespada_verses SET excerpt =
  'Davi, porém, disse ao filisteu: Tu vens a mim com espada, e com lança, e com escudo; porém eu venho a ti em nome do SENHOR dos Exércitos, o Deus dos exércitos de Israel, a quem tens afrontado.'
WHERE book_id = 9 AND chapter = 17 AND verse_start = 45;

-- ============================================
-- 4. EXCERTOS CORTADOS A MEIO DO VERSICULO
-- ============================================
-- Estes tres nao estao errados, so acabam antes do fim do versiculo e fechavam
-- com ponto final, como se fosse o texto todo. As reticencias deixam isso claro
-- a quem esta a conferir numa Biblia fisica.
-- (Mateus 5:13 fica como esta: acaba num ponto de interrogacao, le-se bem.)

-- Eclesiastes 12:1
UPDATE public.vanaespada_verses SET excerpt =
  'Lembra-te também do teu Criador nos dias da tua mocidade, antes que venham os maus dias…'
WHERE book_id = 21 AND chapter = 12 AND verse_start = 1;

-- Daniel 6:22
UPDATE public.vanaespada_verses SET excerpt =
  'O meu Deus enviou o seu anjo, e fechou a boca dos leões, para que não me fizessem dano…'
WHERE book_id = 27 AND chapter = 6 AND verse_start = 22;

-- ============================================
-- 5. CREDITO DA TRADUCAO (opcional)
-- ============================================
-- Descomenta se quiseres o nome completo no projetor, agora que o texto
-- e mesmo o da Almeida Corrigida Fiel.
--
-- UPDATE public.vanaespada_verses
--    SET translation = 'Almeida Corrigida Fiel (ACF)'
--  WHERE translation = 'Almeida (ACF)';

COMMIT;

-- ============================================
-- CONFERENCIA: mostra so os versiculos tocados por este ficheiro
-- ============================================
SELECT book_id, chapter, verse_start, verse_end, difficulty, excerpt
FROM public.vanaespada_verses
WHERE (book_id, chapter, verse_start) IN (
  (1,1,27), (20,22,6), (23,40,31), (24,29,11), (33,6,8), (40,28,19),
  (44,1,8), (44,2,4), (45,12,2), (46,13,4), (55,3,16), (58,11,1),
  (19,133,1), (43,14,6), (48,5,22), (51,3,23),
  (5,6,5), (6,1,9), (9,17,45),
  (21,12,1), (27,6,22)
)
ORDER BY book_id, chapter, verse_start;
