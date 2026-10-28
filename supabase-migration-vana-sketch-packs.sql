-- ============================================================
-- VanaSketch — packs de palavras
-- As palavras deixam de vir do dicionário do VANTUR (só 5 letras, muitas
-- abstratas) e passam a vir de packs próprios, fáceis de desenhar. O host
-- escolhe os packs no lobby (ex.: só "Natal" num evento de Natal).
--
-- Correr depois do supabase-setup-vana-sketch.sql.
-- Seguro de correr mais do que uma vez: os packs iniciais só são criados
-- se ainda não existirem, e palavras repetidas são ignoradas.
-- ============================================================

-- ── Tabelas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vanasketch_packs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  emoji       text        NOT NULL DEFAULT '🎨',
  description text,
  -- Vem já escolhido no lobby
  is_default  boolean     NOT NULL DEFAULT false,
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vanasketch_packs_name_unique
  ON public.vanasketch_packs (lower(name));

CREATE TABLE IF NOT EXISTS public.vanasketch_pack_words (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id    uuid        NOT NULL REFERENCES public.vanasketch_packs(id) ON DELETE CASCADE,
  word       text        NOT NULL CHECK (char_length(trim(word)) BETWEEN 2 AND 30),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vanasketch_pack_words_unique
  ON public.vanasketch_pack_words (pack_id, lower(word));

-- Packs escolhidos pelo host para a sessão (vazio = lista de reserva do código)
ALTER TABLE public.vanasketch_sessions
  ADD COLUMN IF NOT EXISTS pack_ids uuid[] NOT NULL DEFAULT '{}';

-- ── RLS ──────────────────────────────────────────────────────
-- Só a liderança lê e gere os packs; o sorteio das palavras é feito no
-- servidor (service role), por isso os jogadores nunca leem as listas.
ALTER TABLE public.vanasketch_packs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanasketch_pack_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vs_packs_admin_all" ON public.vanasketch_packs;
CREATE POLICY "vs_packs_admin_all" ON public.vanasketch_packs FOR ALL TO authenticated
  USING (public.get_my_role() IN ('dirigente','coordenador'))
  WITH CHECK (public.get_my_role() IN ('dirigente','coordenador'));

DROP POLICY IF EXISTS "vs_pack_words_admin_all" ON public.vanasketch_pack_words;
CREATE POLICY "vs_pack_words_admin_all" ON public.vanasketch_pack_words FOR ALL TO authenticated
  USING (public.get_my_role() IN ('dirigente','coordenador'))
  WITH CHECK (public.get_my_role() IN ('dirigente','coordenador'));

-- ── Packs iniciais ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.vs_seed_pack(
  p_name text, p_emoji text, p_description text, p_default boolean, p_sort int, p_words text[]
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.vanasketch_packs WHERE lower(name) = lower(p_name);
  IF v_id IS NOT NULL THEN
    RETURN; -- já existe: não mexer no que a liderança já personalizou
  END IF;
  INSERT INTO public.vanasketch_packs (name, emoji, description, is_default, sort_order)
  VALUES (p_name, p_emoji, p_description, p_default, p_sort)
  RETURNING id INTO v_id;
  INSERT INTO public.vanasketch_pack_words (pack_id, word)
  SELECT v_id, w FROM unnest(p_words) AS w
  ON CONFLICT DO NOTHING;
END;
$$;

SELECT pg_temp.vs_seed_pack('Bíblia', '📖', 'Personagens, objetos e histórias da Bíblia', true, 1, ARRAY[
  'Arca de Noé', 'Cruz', 'Pomba', 'Cordeiro', 'Estrela', 'Coroa', 'Templo', 'Serpente',
  'Baleia', 'Leão', 'Pão', 'Peixe', 'Barco', 'Rede', 'Espada', 'Escudo', 'Harpa',
  'Trombeta', 'Poço', 'Videira', 'Anjo', 'Pastor', 'Ovelha', 'Camelo', 'Burro',
  'Arco-íris', 'Nuvem', 'Relâmpago', 'Moeda', 'Lâmpada', 'Uvas', 'Figueira',
  'Torre de Babel', 'Mar Vermelho', 'Funda', 'Gigante', 'Manjedoura', 'Tábuas da Lei',
  'Sarça ardente', 'Escada', 'Muralha', 'Palmeira', 'Cesto', 'Cântaro', 'Sandálias',
  'Coroa de espinhos', 'Túmulo', 'Bastão', 'Gafanhoto', 'Rã', 'Jardim do Éden',
  'Maçã', 'Cajado', 'Tenda', 'Fogo', 'Chuva', 'Montanha', 'Rio', 'Deserto'
]);

SELECT pg_temp.vs_seed_pack('Acampamento', '🏕️', 'Desbravadores, natureza e vida ao ar livre', true, 2, ARRAY[
  'Tenda', 'Fogueira', 'Bússola', 'Mochila', 'Lenço', 'Apito', 'Corda', 'Lanterna',
  'Mapa', 'Nó', 'Machado', 'Saco-cama', 'Marshmallow', 'Cantil', 'Canivete',
  'Binóculos', 'Bandeira', 'Floresta', 'Montanha', 'Rio', 'Canoa', 'Pinheiro',
  'Cogumelo', 'Esquilo', 'Mosquito', 'Lua', 'Uniforme', 'Árvore', 'Pegadas',
  'Cabana', 'Ponte', 'Cascata', 'Pinha', 'Fósforo', 'Panela', 'Lago'
]);

SELECT pg_temp.vs_seed_pack('Natal', '🎄', 'Para os eventos de Natal', false, 3, ARRAY[
  'Árvore de Natal', 'Presépio', 'Estrela de Belém', 'Pai Natal', 'Rena', 'Presente',
  'Meia', 'Sino', 'Vela', 'Boneco de neve', 'Floco de neve', 'Bolo-rei', 'Lareira',
  'Trenó', 'Gorro', 'Bengala doce', 'Coroa de Advento', 'Reis Magos', 'Camelo',
  'Pastores', 'Anjo', 'Manjedoura', 'Chocolate quente', 'Bola de Natal', 'Luzes',
  'Laço', 'Neve', 'Bolachas', 'Chaminé', 'Azevinho'
]);

SELECT pg_temp.vs_seed_pack('Verão', '☀️', 'Praia, calor e férias', false, 4, ARRAY[
  'Praia', 'Sol', 'Guarda-sol', 'Toalha', 'Óculos de sol', 'Gelado', 'Melancia',
  'Castelo de areia', 'Balde', 'Concha', 'Estrela-do-mar', 'Caranguejo', 'Onda',
  'Prancha de surf', 'Barbatanas', 'Piscina', 'Boia', 'Chinelos', 'Protetor solar',
  'Ventoinha', 'Limonada', 'Gaivota', 'Farol', 'Barco à vela', 'Bola de praia',
  'Golfinho', 'Palmeira', 'Mergulho', 'Chapéu de palha', 'Ilha'
]);

SELECT pg_temp.vs_seed_pack('Páscoa', '🐣', 'Para os eventos da Páscoa', false, 5, ARRAY[
  'Ovo', 'Coelho', 'Pinto', 'Túmulo vazio', 'Cruz', 'Pedra', 'Jardim', 'Folar',
  'Amêndoas', 'Cesta', 'Flores', 'Borboleta', 'Folha de palmeira', 'Jumento',
  'Galo', 'Sol nascente', 'Pão', 'Cálice', 'Coroa de espinhos', 'Lençol'
]);

SELECT pg_temp.vs_seed_pack('Animais', '🐾', 'Fácil para os mais novos', false, 6, ARRAY[
  'Elefante', 'Girafa', 'Leão', 'Tigre', 'Macaco', 'Cobra', 'Tubarão', 'Polvo',
  'Tartaruga', 'Pinguim', 'Coruja', 'Papagaio', 'Galinha', 'Vaca', 'Porco', 'Cavalo',
  'Cão', 'Gato', 'Rato', 'Coelho', 'Urso', 'Raposa', 'Lobo', 'Sapo', 'Abelha',
  'Aranha', 'Caracol', 'Formiga', 'Borboleta', 'Canguru', 'Zebra', 'Hipopótamo',
  'Crocodilo', 'Baleia', 'Morcego', 'Ovelha'
]);

SELECT pg_temp.vs_seed_pack('Dia a dia', '🏠', 'Objetos, comida e transportes', false, 7, ARRAY[
  'Telemóvel', 'Óculos', 'Relógio', 'Chave', 'Guarda-chuva', 'Tesoura', 'Lápis',
  'Livro', 'Cadeira', 'Cama', 'Televisão', 'Frigorífico', 'Escova de dentes',
  'Sapato', 'Chapéu', 'Bicicleta', 'Carro', 'Avião', 'Comboio', 'Foguetão', 'Bola',
  'Guitarra', 'Piano', 'Bolo', 'Pizza', 'Hambúrguer', 'Banana', 'Cenoura', 'Ananás',
  'Escola', 'Casa', 'Computador', 'Mochila', 'Bateria', 'Robô'
]);

-- Confirmação
SELECT p.emoji, p.name, p.is_default, count(w.id) AS palavras
FROM public.vanasketch_packs p
LEFT JOIN public.vanasketch_pack_words w ON w.pack_id = p.id
GROUP BY p.id
ORDER BY p.sort_order, p.name;
