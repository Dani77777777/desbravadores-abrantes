-- ============================================
-- COFRE — registo do dinheiro do clube
-- Desbravadores Abrantes
-- ============================================
-- Correr DEPOIS de supabase-migration-store-security-fix.sql (ou do
-- supabase-schema-completo.sql). Idempotente: corre-se inteira no SQL Editor,
-- e pode voltar a correr-se. Especificação em docs/Cofre.md.
--
-- O Cofre NÃO é a conta do clube (essa é a da igreja, gerida pelo tesoureiro).
-- Regista cada euro que entra ou sai e QUEM o tem na mão: só coordenadores reais.
--
--  1. Tipos payment_method e cash_movement_kind.
--  2. store_purchases: payment_method, received_by e payment_ref ("DA-0427").
--  3. club_cash_movements: movimentos imutáveis (correções por estorno), só
--     leitura para a coordenação real; escrita só pelas funções.
--  4. Vista cofre_em_mao: dinheiro do clube em mão por coordenador.
--  5. Loja integrada: mark_purchase_paid (como foi pago, quem recebeu),
--     set_purchase_receiver (encomendas pagas antes do Cofre),
--     correct_purchase_payment, refund_purchase (quem devolveu),
--     process_purchase / get_guest_purchases com a referência.
--  6. Movimentos manuais: cofre_register (despesa, outra entrada, abertura) e
--     cofre_reverse (estorno).
--  7. Relatório: cofre_store_summary (vendas da loja por artigo, com margem).
--  8. Comprovativos: bucket privado cofre-comprovativos.
--  9. Um artigo com vendas pagas não se apaga (desativa-se).
--
-- AINDA NÃO: entregas ao tesoureiro da igreja e pagamento direto à conta da
-- igreja (docs/Cofre.md, Fase 1 "entrega_tesouraria" e Fase 3). A direção ainda
-- está a avaliar. O dinheiro sai do "em mão" só por despesas, reembolsos e
-- estornos.
-- ============================================

BEGIN;

-- ============================================================================
-- 1. TIPOS
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('numerario', 'mbway', 'transferencia');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cash_movement_kind AS ENUM
    ('venda', 'reembolso', 'entrada_outra', 'despesa', 'estorno', 'abertura');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. STORE_PURCHASES: como foi pago, quem recebeu, referência
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS public.store_payment_ref_seq;
REVOKE ALL ON SEQUENCE public.store_payment_ref_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON SEQUENCE public.store_payment_ref_seq TO service_role;

ALTER TABLE public.store_purchases
  ADD COLUMN IF NOT EXISTS payment_method public.payment_method,
  ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_ref text;

-- Referências das compras que já existem, por ordem de criação (DA-0001, ...).
-- A sequência nunca anda para trás: uma referência de uma encomenda apagada
-- não volta a ser usada.
DO $$
DECLARE
  v_max integer;
  v_last bigint;
  v_called boolean;
BEGIN
  SELECT last_value, is_called INTO v_last, v_called FROM public.store_payment_ref_seq;

  SELECT GREATEST(
           COALESCE(max(substring(payment_ref FROM 4)::integer), 0),
           CASE WHEN v_called THEN v_last ELSE 0 END
         )
    INTO v_max
  FROM public.store_purchases
  WHERE payment_ref ~ '^DA-[0-9]+$';

  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM public.store_purchases
    WHERE payment_ref IS NULL
  )
  UPDATE public.store_purchases sp
  SET payment_ref = 'DA-' || lpad((v_max + o.rn)::text, 4, '0')
  FROM ordered o
  WHERE sp.id = o.id;

  SELECT COALESCE(max(substring(payment_ref FROM 4)::integer), 0) INTO v_max
  FROM public.store_purchases
  WHERE payment_ref ~ '^DA-[0-9]+$';

  IF v_max > 0 AND (NOT v_called OR v_last < v_max) THEN
    PERFORM setval('public.store_payment_ref_seq', v_max, true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.store_purchase_set_payment_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.payment_ref IS NULL THEN
    NEW.payment_ref := 'DA-' || lpad(nextval('public.store_payment_ref_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.store_purchase_set_payment_ref() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_purchase_set_payment_ref() TO service_role;

DROP TRIGGER IF EXISTS store_purchases_payment_ref ON public.store_purchases;
CREATE TRIGGER store_purchases_payment_ref
  BEFORE INSERT ON public.store_purchases
  FOR EACH ROW EXECUTE FUNCTION public.store_purchase_set_payment_ref();

ALTER TABLE public.store_purchases ALTER COLUMN payment_ref SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_purchases_payment_ref_key') THEN
    ALTER TABLE public.store_purchases ADD CONSTRAINT store_purchases_payment_ref_key UNIQUE (payment_ref);
  END IF;
END $$;

-- ============================================================================
-- 3. CLUB_CASH_MOVEMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.club_cash_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  occurred_on   date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Lisbon')::date,
  kind          public.cash_movement_kind NOT NULL,
  amount_eur    numeric(10,2) NOT NULL CHECK (amount_eur > 0),
  method        public.payment_method NOT NULL,
  -- Coordenador que tem o dinheiro (em numerário ou na sua conta pessoal).
  holder_id     uuid NOT NULL REFERENCES public.profiles(id),
  -- Se a compra for apagada (ex.: o membro apagou a conta), o movimento fica;
  -- a descrição já tem a referência, o artigo e o comprador.
  purchase_id   uuid REFERENCES public.store_purchases(id) ON DELETE SET NULL,
  description   text NOT NULL CHECK (length(btrim(description)) > 0),
  receipt_path  text,                                -- bucket privado cofre-comprovativos
  created_by    uuid NOT NULL REFERENCES public.profiles(id),
  reverses_id   uuid UNIQUE REFERENCES public.club_cash_movements(id),

  CONSTRAINT cofre_estorno_check CHECK ((kind = 'estorno') = (reverses_id IS NOT NULL)),
  CONSTRAINT cofre_purchase_kind_check CHECK (purchase_id IS NULL OR kind IN ('venda', 'reembolso', 'estorno'))
);
CREATE INDEX IF NOT EXISTS club_cash_movements_holder_idx   ON public.club_cash_movements(holder_id);
CREATE INDEX IF NOT EXISTS club_cash_movements_purchase_idx ON public.club_cash_movements(purchase_id);
CREATE INDEX IF NOT EXISTS club_cash_movements_occurred_idx ON public.club_cash_movements(occurred_on);

-- Nada se apaga e nada se edita. A única alteração aceite é a ligação à compra
-- cair para NULL quando a compra é apagada (ON DELETE SET NULL).
-- Aplica-se também às funções SECURITY DEFINER: é essa a ideia.
CREATE OR REPLACE FUNCTION public.cofre_movements_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Os movimentos do Cofre não se apagam. Faz um estorno.';
  END IF;
  IF OLD.purchase_id IS NOT NULL AND NEW.purchase_id IS NULL
     AND (to_jsonb(NEW) - 'purchase_id') = (to_jsonb(OLD) - 'purchase_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Os movimentos do Cofre não se editam. Faz um estorno.';
END;
$$;
REVOKE ALL ON FUNCTION public.cofre_movements_immutable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cofre_movements_immutable() TO service_role;

DROP TRIGGER IF EXISTS cofre_movements_immutable ON public.club_cash_movements;
CREATE TRIGGER cofre_movements_immutable
  BEFORE UPDATE OR DELETE ON public.club_cash_movements
  FOR EACH ROW EXECUTE FUNCTION public.cofre_movements_immutable();

-- RLS: só leitura, só coordenação real. Escrita SÓ pelas funções.
ALTER TABLE public.club_cash_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cofre: coordenação real lê" ON public.club_cash_movements;
CREATE POLICY "Cofre: coordenação real lê" ON public.club_cash_movements
  FOR SELECT USING (public.get_my_real_role() = 'coordenador');
REVOKE ALL ON public.club_cash_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.club_cash_movements TO authenticated;
GRANT ALL ON public.club_cash_movements TO service_role;

-- ============================================================================
-- 4. "EM MÃO"
-- ============================================================================
-- Sinal de cada movimento no "em mão" de quem tem o dinheiro. Um estorno tem o
-- sinal contrário do movimento que anula.
CREATE OR REPLACE FUNCTION public.cofre_sign(
  p_kind public.cash_movement_kind,
  p_reversed_kind public.cash_movement_kind DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN p_kind = 'estorno' THEN -1 ELSE 1 END
       * CASE CASE WHEN p_kind = 'estorno' THEN p_reversed_kind ELSE p_kind END
           WHEN 'venda' THEN 1
           WHEN 'entrada_outra' THEN 1
           WHEN 'abertura' THEN 1
           WHEN 'reembolso' THEN -1
           WHEN 'despesa' THEN -1
           ELSE 0
         END;
$$;
REVOKE ALL ON FUNCTION public.cofre_sign(public.cash_movement_kind, public.cash_movement_kind) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cofre_sign(public.cash_movement_kind, public.cash_movement_kind) TO authenticated, service_role;

-- Uma linha por coordenador com movimentos. security_invoker: herda a RLS da tabela.
DROP VIEW IF EXISTS public.cofre_em_mao;
CREATE VIEW public.cofre_em_mao WITH (security_invoker = true) AS
SELECT
  m.holder_id,
  p.full_name,
  p.avatar_url,
  COALESCE(sum(s.signed_eur), 0)::numeric(10,2) AS em_mao_eur,
  COALESCE(sum(s.signed_eur) FILTER (WHERE m.method = 'numerario'), 0)::numeric(10,2) AS em_numerario_eur,
  COALESCE(sum(s.signed_eur) FILTER (WHERE m.method IS DISTINCT FROM 'numerario'), 0)::numeric(10,2) AS na_conta_eur,
  max(m.created_at) AS ultimo_movimento
FROM public.club_cash_movements m
LEFT JOIN public.club_cash_movements o ON o.id = m.reverses_id
CROSS JOIN LATERAL (SELECT public.cofre_sign(m.kind, o.kind) * m.amount_eur AS signed_eur) s
LEFT JOIN public.profiles p ON p.id = m.holder_id
GROUP BY m.holder_id, p.full_name, p.avatar_url;

REVOKE ALL ON public.cofre_em_mao FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cofre_em_mao TO authenticated;
GRANT ALL ON public.cofre_em_mao TO service_role;

-- Saldo de um coordenador (p_method: NULL = tudo; 'numerario' = só numerário).
-- Uso interno das funções abaixo (que já verificaram a permissão).
CREATE OR REPLACE FUNCTION public.cofre_balance(p_holder_id uuid, p_method public.payment_method DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(sum(public.cofre_sign(m.kind, o.kind) * m.amount_eur), 0)
  FROM public.club_cash_movements m
  LEFT JOIN public.club_cash_movements o ON o.id = m.reverses_id
  WHERE m.holder_id = p_holder_id
    AND (p_method IS NULL OR m.method = p_method);
$$;
REVOKE ALL ON FUNCTION public.cofre_balance(uuid, public.payment_method) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cofre_balance(uuid, public.payment_method) TO service_role;

-- Texto de uma compra nos movimentos: "DA-0427 · Pin do clube ×2 · Ana Silva"
CREATE OR REPLACE FUNCTION public.cofre_purchase_label(p_purchase_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT sp.payment_ref || ' · ' || COALESCE(p.name, 'Artigo')
         || CASE WHEN COALESCE(sp.quantity, 1) > 1 THEN ' ×' || sp.quantity ELSE '' END
         || ' · ' || COALESCE(pr.full_name, sp.buyer_name, 'Comprador')
  FROM public.store_purchases sp
  LEFT JOIN public.store_products p ON p.id = sp.product_id
  LEFT JOIN public.profiles pr ON pr.id = sp.user_id
  WHERE sp.id = p_purchase_id;
$$;
REVOKE ALL ON FUNCTION public.cofre_purchase_label(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cofre_purchase_label(uuid) TO service_role;

-- O dinheiro do clube só fica com coordenadores reais.
CREATE OR REPLACE FUNCTION public.cofre_assert_holder(p_holder_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_holder_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_holder_id AND role = 'coordenador'
  ) THEN
    RAISE EXCEPTION 'Quem tem o dinheiro tem de ser um coordenador.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.cofre_assert_holder(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cofre_assert_holder(uuid) TO service_role;

-- ============================================================================
-- 5. LOJA
-- ============================================================================

-- 5.1 Compra: igual à versão das correções de segurança, mas devolve também a
--     referência (payment_ref), que o comprador vê no fim da compra.
CREATE OR REPLACE FUNCTION public.process_purchase(
  p_product_id uuid,
  p_discount_eur numeric DEFAULT 0,
  p_buyer_name text DEFAULT NULL,
  p_quantity integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_product record;
  v_user_gold integer := 0;
  v_user_xp integer := 0;
  v_rate integer;
  v_discount numeric := COALESCE(round(p_discount_eur, 2), 0);
  v_max_discount numeric;
  v_gold_cost integer := 0;
  v_amount_due numeric;
  v_paid boolean;
  v_key_id uuid;
  v_key_value text;
  v_status public.purchase_status;
  v_purchase_id uuid;
  v_cancel_token uuid;
  v_payment_ref text;
  v_buyer_name text := NULLIF(trim(COALESCE(p_buyer_name, '')), '');
  v_qty integer := COALESCE(p_quantity, 1);
  v_total numeric;
  v_cost_total numeric;
  v_volume_pct numeric := 0;
  v_volume_eur numeric := 0;
  v_after_volume numeric;
  v_unpaid integer;
  v_guest_limit integer;
  v_due_text text;
BEGIN
  -- 1. Produto
  SELECT id, name, price_eur, max_discount_percent, type, stock, min_level,
         is_preorder, preorder_deadline, cost_price
  INTO v_product
  FROM public.store_products
  WHERE id = p_product_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado ou inativo.';
  END IF;

  -- Quantidade: 1 a 10 unidades por encomenda; digitais sempre 1 (uma chave por compra).
  IF v_qty < 1 OR v_qty > 10 THEN
    RAISE EXCEPTION 'Quantidade inválida (1 a 10 unidades por encomenda).';
  END IF;
  IF v_product.type = 'digital' AND v_qty <> 1 THEN
    RAISE EXCEPTION 'Artigos digitais compram-se um de cada vez.';
  END IF;
  v_total := round(v_product.price_eur * v_qty, 2);

  -- Desconto por quantidade: só físicos com custo definido, e nunca abaixo do custo.
  IF v_product.cost_price IS NOT NULL THEN
    v_cost_total := round(v_product.cost_price * v_qty, 2);
    IF v_product.type <> 'digital' THEN
      v_volume_pct := public.store_volume_discount_percent(v_qty);
      v_volume_eur := LEAST(round(v_total * v_volume_pct / 100.0, 2), GREATEST(0, v_total - v_cost_total));
      IF v_volume_eur <= 0 THEN
        v_volume_eur := 0;
        v_volume_pct := 0;
      END IF;
    END IF;
  END IF;
  v_after_volume := v_total - v_volume_eur;

  -- 2. Comprador
  IF v_user_id IS NULL THEN
    -- Convidado: precisa de nome, não tem Gold, e artigos com nível mínimo
    -- (mesmo Nível 1) são exclusivos de membros registados.
    IF v_buyer_name IS NULL THEN
      RAISE EXCEPTION 'Indica o teu nome para comprar sem conta.';
    END IF;
    IF v_discount > 0 THEN
      RAISE EXCEPTION 'Apenas membros registados podem usar Gold como desconto.';
    END IF;
    IF COALESCE(v_product.min_level, 0) > 0 THEN
      RAISE EXCEPTION 'Este artigo é exclusivo para membros de Nível %+. Regista-te e participa!', v_product.min_level;
    END IF;
  ELSE
    SELECT current_gold, total_xp INTO v_user_gold, v_user_xp
    FROM public.profiles WHERE id = v_user_id;

    -- Membros começam no Nível 1 (floor(XP/1000)+1); min_level 1 = "só membros".
    IF COALESCE(v_product.min_level, 0) > 0 AND (floor(v_user_xp / 1000) + 1) < v_product.min_level THEN
      RAISE EXCEPTION 'Nível insuficiente. Precisas de Nível %!', v_product.min_level;
    END IF;

    -- 3. Desconto em Gold (taxa dinâmica do momento)
    IF v_discount < 0 THEN
      RAISE EXCEPTION 'Desconto inválido.';
    END IF;

    -- Teto: % máxima sobre o preço base, e só o que sobra acima do custo.
    v_max_discount := round(v_total * v_product.max_discount_percent / 100.0, 2);
    IF v_cost_total IS NOT NULL THEN
      v_max_discount := LEAST(v_max_discount, GREATEST(0, v_after_volume - v_cost_total));
    END IF;
    IF v_discount > v_max_discount THEN
      RAISE EXCEPTION 'O desconto máximo deste artigo é % €.', v_max_discount;
    END IF;

    IF v_discount > 0 THEN
      v_rate := (public.get_gold_rate_info()->>'gold_per_euro')::integer;
      v_gold_cost := CEIL(v_discount * v_rate)::integer;

      IF v_user_gold < v_gold_cost THEN
        RAISE EXCEPTION 'Gold insuficiente. Este desconto custa % 🪙 e tens % 🪙.', v_gold_cost, v_user_gold;
      END IF;
    END IF;
  END IF;

  v_amount_due := round(v_after_volume - v_discount, 2);
  v_paid := v_amount_due <= 0;

  -- 4. Limite de encomendas por pagar (contra encomendas falsas que esgotam a loja).
  --    O lock evita que dois pedidos ao mesmo tempo passem os dois a contagem.
  IF NOT v_paid THEN
    IF v_user_id IS NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext('store_unpaid:guests'));
      SELECT COALESCE((SELECT max_guest_unpaid_orders FROM public.store_settings WHERE id = true), 10)
        INTO v_guest_limit;
      SELECT count(*) INTO v_unpaid
      FROM public.store_purchases
      WHERE user_id IS NULL AND status = 'pending' AND paid_at IS NULL;
      IF v_unpaid >= v_guest_limit THEN
        RAISE EXCEPTION 'Há muitas encomendas por pagar. Fala com a coordenação.';
      END IF;
    ELSE
      PERFORM pg_advisory_xact_lock(hashtext('store_unpaid:' || v_user_id::text));
      SELECT count(*) INTO v_unpaid
      FROM public.store_purchases
      WHERE user_id = v_user_id AND status = 'pending' AND paid_at IS NULL;
      IF v_unpaid >= 3 THEN
        RAISE EXCEPTION 'Já tens 3 encomendas por pagar. Paga ou cancela uma antes de fazeres outra.';
      END IF;
    END IF;
  END IF;

  -- 5. Disponibilidade
  IF v_product.is_preorder THEN
    -- Por encomenda: sem stock, só conta o prazo.
    IF v_product.preorder_deadline IS NOT NULL AND now() > v_product.preorder_deadline THEN
      RAISE EXCEPTION 'As reservas deste artigo já fecharam.';
    END IF;

  ELSIF v_product.type = 'physical' THEN
    UPDATE public.store_products SET stock = stock - v_qty
    WHERE id = p_product_id AND stock >= v_qty;
    IF NOT FOUND THEN
      IF v_product.stock <= 0 THEN
        RAISE EXCEPTION 'Produto esgotado.';
      END IF;
      RAISE EXCEPTION 'Só restam % unidades deste artigo.', v_product.stock;
    END IF;

  ELSIF v_product.type = 'digital' THEN
    IF v_paid THEN
      -- Paga já (toda com Gold): a chave é entregue agora.
      SELECT id, key_value INTO v_key_id, v_key_value
      FROM public.digital_keys
      WHERE product_id = p_product_id AND is_used = false
      LIMIT 1
      FOR UPDATE SKIP LOCKED;

      IF v_key_id IS NULL THEN
        RAISE EXCEPTION 'Não existem chaves digitais disponíveis para este produto.';
      END IF;

      UPDATE public.digital_keys SET is_used = true WHERE id = v_key_id;
    ELSE
      -- Por pagar: não se reserva chave nenhuma (seria legível antes de pagar).
      -- A chave é atribuída em mark_purchase_paid, quando o pagamento é confirmado.
      IF NOT EXISTS (
        SELECT 1 FROM public.digital_keys
        WHERE product_id = p_product_id AND is_used = false
      ) THEN
        RAISE EXCEPTION 'Não existem chaves digitais disponíveis para este produto.';
      END IF;
    END IF;
  END IF;

  -- 6. Débito do Gold do desconto
  IF v_gold_cost > 0 THEN
    INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
    VALUES (v_user_id, v_user_id, 0, -v_gold_cost, 'Desconto na Loja: ' || v_product.name);
  END IF;

  -- 7. Registo da compra
  -- Digital já pago fica entregue de imediato; tudo o resto aguarda pagamento/entrega.
  v_status := CASE WHEN v_paid AND v_product.type = 'digital'
                   THEN 'delivered'::public.purchase_status
                   ELSE 'pending'::public.purchase_status END;

  INSERT INTO public.store_purchases (
    user_id, buyer_name, product_id, status, digital_key_delivered,
    price_eur, discount_eur, amount_due_eur, gold_spent, gold_rate,
    paid_at, delivered_at, quantity, volume_discount_percent, volume_discount_eur
  )
  VALUES (
    v_user_id, v_buyer_name, p_product_id, v_status, v_key_value,
    v_product.price_eur, v_discount, v_amount_due, v_gold_cost, v_rate,
    CASE WHEN v_paid THEN now() END,
    CASE WHEN v_status = 'delivered' THEN now() END,
    v_qty, v_volume_pct, v_volume_eur
  )
  RETURNING id, cancel_token, payment_ref INTO v_purchase_id, v_cancel_token, v_payment_ref;

  v_due_text := to_char(v_amount_due, 'FM999990.00') || ' €';

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'payment_ref', v_payment_ref,
    -- Só o convidado precisa do token (o membro cancela pela conta).
    'cancel_token', CASE WHEN v_user_id IS NULL THEN v_cancel_token END,
    'amount_due_eur', v_amount_due,
    'discount_eur', v_discount,
    'volume_discount_percent', v_volume_pct,
    'volume_discount_eur', v_volume_eur,
    'gold_spent', v_gold_cost,
    'paid', v_paid,
    'quantity', v_qty,
    'preorder', v_product.is_preorder,
    'digital_key', CASE WHEN v_paid THEN v_key_value END,
    'message', CASE
      WHEN v_product.is_preorder AND NOT v_paid
        THEN 'Reserva registada! Paga ' || v_due_text || ' em dinheiro a um coordenador do clube. Levantas o artigo quando chegar.'
      WHEN v_product.is_preorder
        THEN 'Reserva paga com Gold! Levantas o artigo quando chegar.'
      WHEN NOT v_paid AND v_product.type = 'digital'
        THEN 'Pedido registado! Paga ' || v_due_text || ' em dinheiro a um coordenador do clube para receberes a chave.'
      WHEN NOT v_paid
        THEN 'Pedido registado! Paga ' || v_due_text || ' em dinheiro a um coordenador do clube para levantares o artigo.'
      WHEN v_product.type = 'digital'
        THEN 'Compra concluída!'
      ELSE 'Pago com Gold! Levanta o artigo com um coordenador do clube.'
    END
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5.2 Encomendas dos convidados: com a referência.
CREATE OR REPLACE FUNCTION public.get_guest_purchases(p_tokens uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', sp.id,
    'cancel_token', sp.cancel_token,
    'status', sp.status,
    'paid_at', sp.paid_at,
    'created_at', sp.created_at,
    'quantity', sp.quantity,
    'amount_due_eur', sp.amount_due_eur,
    'buyer_name', sp.buyer_name,
    'payment_ref', sp.payment_ref,
    'product_name', p.name,
    'product_type', p.type,
    'is_preorder', p.is_preorder
  ) ORDER BY sp.created_at DESC), '[]'::jsonb)
  FROM public.store_purchases sp
  LEFT JOIN public.store_products p ON p.id = sp.product_id
  WHERE sp.user_id IS NULL
    AND sp.cancel_token = ANY(COALESCE(p_tokens[1:20], '{}'));
$$;

-- 5.3 Confirmar pagamento: como foi pago e quem recebeu. Cria a "venda" no Cofre.
--     Assinatura nova: apaga-se a antiga primeiro (senão o PostgREST fica com
--     duas funções e o rpc() dá erro de ambiguidade).
DROP FUNCTION IF EXISTS public.mark_purchase_paid(uuid, boolean);
CREATE OR REPLACE FUNCTION public.mark_purchase_paid(
  p_purchase_id uuid,
  p_deliver boolean DEFAULT false,
  p_method public.payment_method DEFAULT 'numerario',
  p_received_by uuid DEFAULT NULL      -- NULL = quem está a confirmar
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purchase record;
  v_type public.product_type;
  v_key_id uuid;
  v_key_value text;
  v_receiver uuid := COALESCE(p_received_by, auth.uid());
  v_method public.payment_method := COALESCE(p_method, 'numerario');
  v_first_payment boolean;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão para confirmar pagamentos.';
  END IF;

  SELECT * INTO v_purchase FROM public.store_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;
  IF v_purchase.status = 'refunded' THEN
    RAISE EXCEPTION 'Esta compra foi reembolsada.';
  END IF;

  v_first_payment := v_purchase.paid_at IS NULL;
  IF v_first_payment AND COALESCE(v_purchase.amount_due_eur, 0) > 0 THEN
    PERFORM public.cofre_assert_holder(v_receiver);
  END IF;

  SELECT type INTO v_type FROM public.store_products WHERE id = v_purchase.product_id;

  -- Digital: a chave só sai do stock quando o pagamento é confirmado.
  IF v_type = 'digital' AND v_purchase.digital_key_delivered IS NULL THEN
    SELECT id, key_value INTO v_key_id, v_key_value
    FROM public.digital_keys
    WHERE product_id = v_purchase.product_id AND is_used = false
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_key_id IS NULL THEN
      RAISE EXCEPTION 'Já não há chaves digitais para este artigo. Junta chaves ao produto antes de confirmar o pagamento.';
    END IF;

    UPDATE public.digital_keys SET is_used = true WHERE id = v_key_id;
  END IF;

  UPDATE public.store_purchases
  SET paid_at = COALESCE(paid_at, now()),
      payment_method = CASE WHEN v_first_payment AND COALESCE(amount_due_eur, 0) > 0 THEN v_method ELSE payment_method END,
      received_by = CASE WHEN v_first_payment AND COALESCE(amount_due_eur, 0) > 0 THEN v_receiver ELSE received_by END,
      digital_key_delivered = COALESCE(digital_key_delivered, v_key_value),
      -- digital pago = entregue (a chave fica disponível); físico só se p_deliver
      status = CASE WHEN p_deliver OR v_type = 'digital' THEN 'delivered'::public.purchase_status ELSE status END,
      delivered_at = CASE WHEN p_deliver OR v_type = 'digital' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
      updated_at = now()
  WHERE id = p_purchase_id;

  -- Idempotente: só o primeiro pagamento entra no Cofre.
  IF v_first_payment AND COALESCE(v_purchase.amount_due_eur, 0) > 0 THEN
    INSERT INTO public.club_cash_movements (kind, amount_eur, method, holder_id, purchase_id, description, created_by)
    VALUES ('venda', v_purchase.amount_due_eur, v_method, v_receiver, p_purchase_id,
            public.cofre_purchase_label(p_purchase_id), auth.uid());
  END IF;
END;
$$;

-- 5.4 Encomendas pagas ANTES do Cofre: dizer quem recebeu o dinheiro.
--     p_still_held = true  → o dinheiro ainda está com essa pessoa: entra no
--                            "em mão" dela (venda com a data do pagamento).
--     p_still_held = false → já foi entregue ou gasto: fica só o registo de
--                            quem recebeu, sem movimento no Cofre.
CREATE OR REPLACE FUNCTION public.set_purchase_receiver(
  p_purchase_id uuid,
  p_received_by uuid,
  p_method public.payment_method DEFAULT 'numerario',
  p_still_held boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purchase record;
  v_method public.payment_method := COALESCE(p_method, 'numerario');
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;

  SELECT * INTO v_purchase FROM public.store_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;
  IF v_purchase.status = 'refunded' THEN
    RAISE EXCEPTION 'Esta compra foi reembolsada.';
  END IF;
  IF v_purchase.paid_at IS NULL THEN
    RAISE EXCEPTION 'Esta compra ainda não foi paga. Usa o botão "Pago".';
  END IF;
  IF COALESCE(v_purchase.amount_due_eur, 0) <= 0 THEN
    RAISE EXCEPTION 'Esta compra foi paga com Gold: não houve dinheiro.';
  END IF;
  IF v_purchase.received_by IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.club_cash_movements WHERE purchase_id = p_purchase_id AND kind = 'venda') THEN
    RAISE EXCEPTION 'Já está registado quem recebeu esta compra. Usa "Corrigir".';
  END IF;

  PERFORM public.cofre_assert_holder(p_received_by);

  UPDATE public.store_purchases
  SET payment_method = v_method, received_by = p_received_by, updated_at = now()
  WHERE id = p_purchase_id;

  IF COALESCE(p_still_held, true) THEN
    INSERT INTO public.club_cash_movements (kind, amount_eur, method, holder_id, purchase_id, occurred_on, description, created_by)
    VALUES ('venda', v_purchase.amount_due_eur, v_method, p_received_by, p_purchase_id,
            (v_purchase.paid_at AT TIME ZONE 'Europe/Lisbon')::date,
            public.cofre_purchase_label(p_purchase_id) || ' (pago antes do Cofre)', auth.uid());
  END IF;
END;
$$;

-- 5.5 Corrigir quem recebeu / como foi pago (engano ao marcar como pago).
--     Estorna a venda antiga e cria a certa. Sem venda no Cofre (paga antes do
--     Cofre e já entregue), só corrige o registo da compra.
CREATE OR REPLACE FUNCTION public.correct_purchase_payment(
  p_purchase_id uuid,
  p_received_by uuid,
  p_method public.payment_method,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purchase record;
  v_sale record;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Diz porque estás a corrigir.';
  END IF;
  IF p_method IS NULL THEN
    RAISE EXCEPTION 'Diz como foi pago.';
  END IF;

  SELECT * INTO v_purchase FROM public.store_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;
  IF v_purchase.status = 'refunded' THEN
    RAISE EXCEPTION 'Esta compra foi reembolsada.';
  END IF;
  IF v_purchase.paid_at IS NULL OR COALESCE(v_purchase.amount_due_eur, 0) <= 0 THEN
    RAISE EXCEPTION 'Esta compra não teve pagamento em dinheiro.';
  END IF;

  PERFORM public.cofre_assert_holder(p_received_by);

  -- Venda ativa (não estornada) desta compra
  SELECT m.* INTO v_sale
  FROM public.club_cash_movements m
  WHERE m.purchase_id = p_purchase_id AND m.kind = 'venda'
    AND NOT EXISTS (SELECT 1 FROM public.club_cash_movements r WHERE r.reverses_id = m.id)
  ORDER BY m.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_sale.holder_id = p_received_by AND v_sale.method = p_method THEN
      RAISE EXCEPTION 'Não há nada para corrigir.';
    END IF;

    INSERT INTO public.club_cash_movements (kind, amount_eur, method, holder_id, purchase_id, occurred_on, description, created_by, reverses_id)
    VALUES ('estorno', v_sale.amount_eur, v_sale.method, v_sale.holder_id, p_purchase_id, v_sale.occurred_on,
            'Estorno: ' || v_reason, auth.uid(), v_sale.id);

    INSERT INTO public.club_cash_movements (kind, amount_eur, method, holder_id, purchase_id, occurred_on, description, created_by)
    VALUES ('venda', v_sale.amount_eur, p_method, p_received_by, p_purchase_id, v_sale.occurred_on,
            public.cofre_purchase_label(p_purchase_id) || ' (corrigido: ' || v_reason || ')', auth.uid());
  ELSIF v_purchase.received_by IS NULL THEN
    RAISE EXCEPTION 'Ainda não está registado quem recebeu. Usa "Quem recebeu?".';
  END IF;

  UPDATE public.store_purchases
  SET payment_method = p_method, received_by = p_received_by, updated_at = now()
  WHERE id = p_purchase_id;
END;
$$;

-- 5.6 Reembolso / cancelamento pela coordenação. Numa compra paga, o dinheiro
--     sai do "em mão" de quem devolve (em numerário ou da sua conta).
DROP FUNCTION IF EXISTS public.refund_purchase(uuid);
CREATE OR REPLACE FUNCTION public.refund_purchase(
  p_purchase_id uuid,
  p_method public.payment_method DEFAULT 'numerario'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purchase record;
  v_product_name text;
  v_type public.product_type;
  v_is_preorder boolean;
  v_method public.payment_method := COALESCE(p_method, 'numerario');
  v_balance numeric;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Apenas coordenadores podem realizar reembolsos.';
  END IF;

  SELECT * INTO v_purchase FROM public.store_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;
  IF v_purchase.status = 'refunded' THEN
    RAISE EXCEPTION 'Esta compra já foi reembolsada.';
  END IF;

  SELECT name, type, is_preorder INTO v_product_name, v_type, v_is_preorder
  FROM public.store_products WHERE id = v_purchase.product_id;

  -- 0. Dinheiro devolvido: sai do "em mão" de quem devolve.
  IF v_purchase.paid_at IS NOT NULL AND COALESCE(v_purchase.amount_due_eur, 0) > 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('cofre:' || auth.uid()::text));
    v_balance := public.cofre_balance(auth.uid());
    IF v_balance < v_purchase.amount_due_eur THEN
      RAISE EXCEPTION 'Não tens esse dinheiro em mão no Cofre (tens % €). Pede a quem recebeu para fazer o reembolso.',
        to_char(v_balance, 'FM999990.00');
    END IF;

    INSERT INTO public.club_cash_movements (kind, amount_eur, method, holder_id, purchase_id, description, created_by)
    VALUES ('reembolso', v_purchase.amount_due_eur, v_method, auth.uid(), p_purchase_id,
            public.cofre_purchase_label(p_purchase_id), auth.uid());
  END IF;

  -- 1. Devolver o Gold gasto no desconto (só membros registados)
  IF v_purchase.gold_spent > 0 AND v_purchase.user_id IS NOT NULL THEN
    INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
    VALUES (v_purchase.user_id, auth.uid(), 0, v_purchase.gold_spent, 'Reembolso de compra: ' || v_product_name);
  END IF;

  -- 2. Marcar como reembolsada
  UPDATE public.store_purchases
  SET status = 'refunded', updated_at = now()
  WHERE id = p_purchase_id;

  -- 3. Devolver stock (todas as unidades) se for físico com stock (não por encomenda)
  IF v_type = 'physical' AND NOT COALESCE(v_is_preorder, false) THEN
    UPDATE public.store_products SET stock = stock + COALESCE(v_purchase.quantity, 1) WHERE id = v_purchase.product_id;
  END IF;

  -- Nota: não "des-usamos" chaves digitais porque podem já ter sido vistas.
END;
$$;

-- ============================================================================
-- 6. MOVIMENTOS MANUAIS
-- ============================================================================

-- Despesa, outra entrada (quotas, donativos, rifas…) ou abertura (o dinheiro do
-- clube que cada coordenador já tem quando o Cofre arranca; uma por pessoa).
CREATE OR REPLACE FUNCTION public.cofre_register(
  p_kind public.cash_movement_kind,
  p_amount numeric,
  p_method public.payment_method,
  p_description text,
  p_holder_id uuid DEFAULT NULL,       -- NULL = quem regista
  p_occurred_on date DEFAULT NULL,     -- NULL = hoje
  p_receipt_path text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_holder uuid := COALESCE(p_holder_id, auth.uid());
  v_amount numeric := round(p_amount, 2);
  v_today date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_on date := COALESCE(p_occurred_on, (now() AT TIME ZONE 'Europe/Lisbon')::date);
  v_desc text := NULLIF(btrim(COALESCE(p_description, '')), '');
  v_receipt text := NULLIF(btrim(COALESCE(p_receipt_path, '')), '');
  v_balance numeric;
  v_id uuid;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('entrada_outra', 'despesa', 'abertura') THEN
    RAISE EXCEPTION 'Tipo de movimento inválido.';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount > 100000 THEN
    RAISE EXCEPTION 'Valor inválido.';
  END IF;
  IF p_method IS NULL THEN
    RAISE EXCEPTION 'Diz se é em numerário ou na conta.';
  END IF;
  IF v_desc IS NULL THEN
    RAISE EXCEPTION 'Escreve uma descrição.';
  END IF;
  IF length(v_desc) > 300 THEN
    RAISE EXCEPTION 'A descrição é demasiado longa (máximo 300 caracteres).';
  END IF;
  IF v_on > v_today THEN
    RAISE EXCEPTION 'A data não pode ser no futuro.';
  END IF;
  IF v_receipt IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id = 'cofre-comprovativos' AND name = v_receipt
  ) THEN
    RAISE EXCEPTION 'O comprovativo não foi encontrado. Volta a anexá-lo.';
  END IF;

  PERFORM public.cofre_assert_holder(v_holder);
  PERFORM pg_advisory_xact_lock(hashtext('cofre:' || v_holder::text));

  IF p_kind = 'abertura' AND EXISTS (
    SELECT 1 FROM public.club_cash_movements m
    WHERE m.kind = 'abertura' AND m.holder_id = v_holder
      AND NOT EXISTS (SELECT 1 FROM public.club_cash_movements r WHERE r.reverses_id = m.id)
  ) THEN
    RAISE EXCEPTION 'Este coordenador já tem a contagem inicial registada. Se estiver errada, estorna-a primeiro.';
  END IF;

  IF p_kind = 'despesa' THEN
    v_balance := public.cofre_balance(v_holder);
    IF v_balance < v_amount THEN
      RAISE EXCEPTION 'Esse coordenador só tem % € do clube em mão no Cofre.', to_char(v_balance, 'FM999990.00');
    END IF;
    IF p_method = 'numerario' THEN
      v_balance := public.cofre_balance(v_holder, 'numerario');
      IF v_balance < v_amount THEN
        RAISE EXCEPTION 'Esse coordenador só tem % € do clube em numerário no Cofre.', to_char(v_balance, 'FM999990.00');
      END IF;
    END IF;
  END IF;

  INSERT INTO public.club_cash_movements (kind, amount_eur, method, holder_id, occurred_on, description, receipt_path, created_by)
  VALUES (p_kind, v_amount, p_method, v_holder, v_on, v_desc, v_receipt, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Estorno: anula um movimento com um movimento novo (mesmo valor, método e
-- detentor, sinal contrário). As vendas e reembolsos da loja corrigem-se pela
-- Loja (Corrigir / Reembolsar); um estorno não se estorna.
CREATE OR REPLACE FUNCTION public.cofre_reverse(p_movement_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mov record;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_id uuid;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Diz porque estás a estornar.';
  END IF;
  IF length(v_reason) > 300 THEN
    RAISE EXCEPTION 'O motivo é demasiado longo (máximo 300 caracteres).';
  END IF;

  SELECT * INTO v_mov FROM public.club_cash_movements WHERE id = p_movement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimento não encontrado.';
  END IF;
  IF v_mov.kind = 'estorno' THEN
    RAISE EXCEPTION 'Um estorno não se estorna.';
  END IF;
  IF v_mov.kind IN ('venda', 'reembolso') THEN
    RAISE EXCEPTION 'As vendas e os reembolsos da loja corrigem-se na Loja.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cofre:' || v_mov.holder_id::text));
  IF EXISTS (SELECT 1 FROM public.club_cash_movements WHERE reverses_id = p_movement_id) THEN
    RAISE EXCEPTION 'Este movimento já foi estornado.';
  END IF;

  INSERT INTO public.club_cash_movements (kind, amount_eur, method, holder_id, occurred_on, description, created_by, reverses_id)
  VALUES ('estorno', v_mov.amount_eur, v_mov.method, v_mov.holder_id,
          (now() AT TIME ZONE 'Europe/Lisbon')::date, 'Estorno: ' || v_reason, auth.uid(), p_movement_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================================
-- 7. RELATÓRIO: vendas da loja por artigo num período (datas de Lisboa)
--    Conta as compras pagas no período e não reembolsadas. O desconto com Gold
--    é dinheiro que o clube não recebe: a margem é recebido − custo.
--    O custo usa o cost_price ATUAL do artigo (NULL se não houver).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cofre_store_summary(p_from date, p_to date)
RETURNS TABLE(
  product_id uuid,
  product_name text,
  units bigint,
  list_eur numeric,
  gold_discount_eur numeric,
  volume_discount_eur numeric,
  received_eur numeric,
  cost_eur numeric,
  margin_eur numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    COALESCE(p.name, 'Artigo apagado'),
    sum(COALESCE(sp.quantity, 1))::bigint,
    sum(round(sp.price_eur * COALESCE(sp.quantity, 1), 2)),
    sum(COALESCE(sp.discount_eur, 0)),
    sum(COALESCE(sp.volume_discount_eur, 0)),
    sum(COALESCE(sp.amount_due_eur, 0)),
    CASE WHEN p.cost_price IS NULL THEN NULL
         ELSE sum(round(p.cost_price * COALESCE(sp.quantity, 1), 2)) END,
    CASE WHEN p.cost_price IS NULL THEN NULL
         ELSE sum(COALESCE(sp.amount_due_eur, 0)) - sum(round(p.cost_price * COALESCE(sp.quantity, 1), 2)) END
  FROM public.store_purchases sp
  LEFT JOIN public.store_products p ON p.id = sp.product_id
  WHERE sp.status <> 'refunded'
    AND sp.paid_at IS NOT NULL
    AND (sp.paid_at AT TIME ZONE 'Europe/Lisbon')::date BETWEEN p_from AND p_to
  GROUP BY p.id, p.name, p.cost_price
  ORDER BY sum(COALESCE(sp.amount_due_eur, 0)) DESC, COALESCE(p.name, '');
END;
$$;

-- ============================================================================
-- 8. COMPROVATIVOS (bucket privado, só coordenação real lê e escreve)
--    Caminho: <id de quem envia>/<uuid>.<ext>. Não se substituem nem se apagam.
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cofre-comprovativos', 'cofre-comprovativos', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Cofre: coordenação real lê comprovativos" ON storage.objects;
CREATE POLICY "Cofre: coordenação real lê comprovativos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'cofre-comprovativos' AND public.get_my_real_role() = 'coordenador');

DROP POLICY IF EXISTS "Cofre: coordenação real envia comprovativos" ON storage.objects;
CREATE POLICY "Cofre: coordenação real envia comprovativos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cofre-comprovativos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.get_my_real_role() = 'coordenador'
  );

-- ============================================================================
-- 9. UM ARTIGO COM VENDAS PAGAS NÃO SE APAGA
--    (apagar o artigo apagava as compras em cascata, e com elas o rasto do
--    dinheiro). Desativa-se em vez disso.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.store_products_keep_paid_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.store_purchases
    WHERE product_id = OLD.id AND paid_at IS NOT NULL AND COALESCE(amount_due_eur, 0) > 0
  ) THEN
    RAISE EXCEPTION 'Este artigo já teve vendas pagas e fica no histórico. Desativa-o em vez de o apagar.';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.store_products_keep_paid_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_products_keep_paid_history() TO service_role;

DROP TRIGGER IF EXISTS store_products_keep_paid_history ON public.store_products;
CREATE TRIGGER store_products_keep_paid_history
  BEFORE DELETE ON public.store_products
  FOR EACH ROW EXECUTE FUNCTION public.store_products_keep_paid_history();

-- ============================================================================
-- 10. PERMISSÕES DAS FUNÇÕES
-- ============================================================================
REVOKE ALL ON FUNCTION public.mark_purchase_paid(uuid, boolean, public.payment_method, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_purchase_receiver(uuid, uuid, public.payment_method, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.correct_purchase_payment(uuid, uuid, public.payment_method, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.refund_purchase(uuid, public.payment_method) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cofre_register(public.cash_movement_kind, numeric, public.payment_method, text, uuid, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cofre_reverse(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cofre_store_summary(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_purchase_paid(uuid, boolean, public.payment_method, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_purchase_receiver(uuid, uuid, public.payment_method, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.correct_purchase_payment(uuid, uuid, public.payment_method, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_purchase(uuid, public.payment_method) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cofre_register(public.cash_movement_kind, numeric, public.payment_method, text, uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cofre_reverse(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cofre_store_summary(date, date) TO authenticated, service_role;

-- Compra e encomendas dos convidados: abertas (como antes).
GRANT EXECUTE ON FUNCTION public.process_purchase(uuid, numeric, text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_guest_purchases(uuid[]) TO anon, authenticated, service_role;

COMMIT;

-- O PostgREST relê o schema (funções com assinatura nova).
NOTIFY pgrst, 'reload schema';
