-- ============================================
-- LOJA V2 — PREÇOS EM EUROS + GOLD COMO DESCONTO DINÂMICO
-- Desbravadores Abrantes
-- ============================================
-- O que muda:
--   • Os artigos passam a ter preço FIXO em € (definido pela direção).
--   • O Gold deixa de ser moeda de pagamento e passa a DESCONTO:
--     cada artigo tem uma % máxima de desconto; a taxa Gold→€ é dinâmica
--     (mais Gold em circulação no clube => desconto mais caro em Gold).
--   • Qualquer pessoa pode comprar (convidados indicam o nome; não têm Gold).
--   • Pagamento em dinheiro: a encomenda regista "pago" e "entregue"
--     em passos separados (ou os dois de uma vez).
-- ============================================

-- 1. PRODUTOS: preço em € + desconto máximo em %
ALTER TABLE public.store_products ADD COLUMN IF NOT EXISTS price_eur numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.store_products ADD COLUMN IF NOT EXISTS max_discount_percent integer NOT NULL DEFAULT 0;
-- O preço antigo em Gold deixa de ser usado; garantir que inserts novos não falham.
ALTER TABLE public.store_products ALTER COLUMN price SET DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.store_products
    ADD CONSTRAINT store_products_price_eur_check CHECK (price_eur >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.store_products
    ADD CONSTRAINT store_products_max_discount_check CHECK (max_discount_percent BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. COMPRAS: convidados + contabilidade em € + estado de pagamento
ALTER TABLE public.store_purchases ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS buyer_name text;
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS price_eur numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS discount_eur numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS amount_due_eur numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS gold_spent integer NOT NULL DEFAULT 0;
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS gold_rate numeric;
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.store_purchases
    ADD CONSTRAINT store_purchases_buyer_check CHECK (user_id IS NOT NULL OR buyer_name IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Compras antigas eram pagas integralmente em Gold no momento da compra.
UPDATE public.store_purchases sp
SET gold_spent = p.price
FROM public.store_products p
WHERE sp.product_id = p.id AND sp.gold_spent = 0 AND sp.price_eur = 0;

UPDATE public.store_purchases SET paid_at = COALESCE(paid_at, created_at) WHERE status <> 'refunded';
UPDATE public.store_purchases SET delivered_at = COALESCE(delivered_at, updated_at) WHERE status = 'delivered';

-- 3. DEFINIÇÕES DA ECONOMIA (singleton)
CREATE TABLE IF NOT EXISTS public.store_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  base_gold_per_euro numeric NOT NULL DEFAULT 100 CHECK (base_gold_per_euro > 0),
  reference_total_gold numeric NOT NULL DEFAULT 10000 CHECK (reference_total_gold > 0),
  min_rate_multiplier numeric NOT NULL DEFAULT 0.5 CHECK (min_rate_multiplier > 0),
  max_rate_multiplier numeric NOT NULL DEFAULT 3 CHECK (max_rate_multiplier >= 1),
  updated_at timestamptz DEFAULT now()
);

-- A referência arranca no Gold total atual: no dia da migração 1€ = base_gold_per_euro.
INSERT INTO public.store_settings (id, reference_total_gold)
SELECT true, GREATEST(1000, COALESCE((SELECT SUM(current_gold) FROM public.profiles), 0))
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Coordinators manage store settings" ON public.store_settings;

CREATE POLICY "Anyone can read store settings" ON public.store_settings
  FOR SELECT USING (true);

CREATE POLICY "Coordinators manage store settings" ON public.store_settings
  FOR ALL USING (public.get_my_role() = 'coordenador');

-- 4. TAXA DINÂMICA GOLD -> EURO
-- gold_per_euro = base * clamp(gold_total / gold_referência, min, max)
-- Mais Gold em circulação => cada € de desconto custa mais Gold.
CREATE OR REPLACE FUNCTION public.get_gold_rate_info()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_base numeric := 100;
  v_ref numeric := 10000;
  v_min numeric := 0.5;
  v_max numeric := 3;
  v_total numeric := 0;
  v_mult numeric;
  v_rate integer;
BEGIN
  SELECT base_gold_per_euro, reference_total_gold, min_rate_multiplier, max_rate_multiplier
  INTO v_base, v_ref, v_min, v_max
  FROM public.store_settings WHERE id = true;

  IF NOT FOUND THEN
    v_base := 100; v_ref := 10000; v_min := 0.5; v_max := 3;
  END IF;

  SELECT COALESCE(SUM(current_gold), 0) INTO v_total FROM public.profiles;

  v_mult := LEAST(v_max, GREATEST(v_min, v_total / NULLIF(v_ref, 0)));
  v_rate := GREATEST(1, CEIL(v_base * COALESCE(v_mult, 1)))::integer;

  RETURN jsonb_build_object(
    'gold_per_euro', v_rate,
    'total_gold', v_total,
    'base_gold_per_euro', v_base,
    'reference_total_gold', v_ref,
    'multiplier', round(COALESCE(v_mult, 1), 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_gold_rate_info() TO anon, authenticated;

-- 5. STOCK DE CHAVES DIGITAIS (visível sem expor as chaves)
-- Nota: a política de digital_keys é só-coordenador, por isso membros normais
-- viam sempre 0 chaves na loja. Esta view (owner = postgres, ignora RLS)
-- expõe apenas a contagem disponível.
CREATE OR REPLACE VIEW public.digital_key_stock AS
SELECT product_id, COUNT(*) FILTER (WHERE is_used = false)::integer AS available
FROM public.digital_keys
GROUP BY product_id;

GRANT SELECT ON public.digital_key_stock TO anon, authenticated;

-- 6. COMPRA (RPC) — substitui a versão só-Gold
DROP FUNCTION IF EXISTS public.process_purchase(uuid);

CREATE OR REPLACE FUNCTION public.process_purchase(
  p_product_id uuid,
  p_discount_eur numeric DEFAULT 0,
  p_buyer_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
  v_buyer_name text := NULLIF(trim(COALESCE(p_buyer_name, '')), '');
BEGIN
  -- 1. Produto
  SELECT id, name, price_eur, max_discount_percent, type, stock, min_level
  INTO v_product
  FROM public.store_products
  WHERE id = p_product_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado ou inativo.';
  END IF;

  -- 2. Comprador
  IF v_user_id IS NULL THEN
    -- Convidado: precisa de nome, não tem Gold, não desbloqueia níveis.
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

    v_max_discount := round(v_product.price_eur * v_product.max_discount_percent / 100.0, 2);
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

  -- 4. Disponibilidade
  IF v_product.type = 'physical' THEN
    IF v_product.stock <= 0 THEN
      RAISE EXCEPTION 'Produto esgotado.';
    END IF;
    UPDATE public.store_products SET stock = stock - 1 WHERE id = p_product_id;

  ELSIF v_product.type = 'digital' THEN
    SELECT id, key_value INTO v_key_id, v_key_value
    FROM public.digital_keys
    WHERE product_id = p_product_id AND is_used = false
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_key_id IS NULL THEN
      RAISE EXCEPTION 'Não existem chaves digitais disponíveis para este produto.';
    END IF;

    UPDATE public.digital_keys SET is_used = true WHERE id = v_key_id;
  END IF;

  -- 5. Débito do Gold do desconto
  IF v_gold_cost > 0 THEN
    INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
    VALUES (v_user_id, v_user_id, 0, -v_gold_cost, 'Desconto na Loja: ' || v_product.name);
  END IF;

  -- 6. Registo da compra
  v_amount_due := round(v_product.price_eur - v_discount, 2);
  v_paid := v_amount_due <= 0;
  -- Digital já pago fica entregue de imediato; tudo o resto aguarda pagamento/entrega.
  v_status := CASE WHEN v_paid AND v_product.type = 'digital'
                   THEN 'delivered'::public.purchase_status
                   ELSE 'pending'::public.purchase_status END;

  INSERT INTO public.store_purchases (
    user_id, buyer_name, product_id, status, digital_key_delivered,
    price_eur, discount_eur, amount_due_eur, gold_spent, gold_rate,
    paid_at, delivered_at
  )
  VALUES (
    v_user_id, v_buyer_name, p_product_id, v_status, v_key_value,
    v_product.price_eur, v_discount, v_amount_due, v_gold_cost, v_rate,
    CASE WHEN v_paid THEN now() END,
    CASE WHEN v_status = 'delivered' THEN now() END
  )
  RETURNING id INTO v_purchase_id;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'amount_due_eur', v_amount_due,
    'discount_eur', v_discount,
    'gold_spent', v_gold_cost,
    'paid', v_paid,
    'digital_key', CASE WHEN v_paid THEN v_key_value END,
    'message', CASE
      WHEN NOT v_paid AND v_product.type = 'digital'
        THEN 'Pedido registado! Paga ' || to_char(v_amount_due, 'FM999990.00') || ' € ao teu dirigente para receberes a chave.'
      WHEN NOT v_paid
        THEN 'Pedido registado! Paga ' || to_char(v_amount_due, 'FM999990.00') || ' € em dinheiro ao teu dirigente para levantar o artigo.'
      WHEN v_product.type = 'digital'
        THEN 'Compra concluída!'
      ELSE 'Pago com Gold! Levanta o artigo com o teu coordenador.'
    END
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_purchase(uuid, numeric, text) TO anon, authenticated;

-- 7. CONFIRMAR PAGAMENTO (e opcionalmente entrega no mesmo passo)
CREATE OR REPLACE FUNCTION public.mark_purchase_paid(p_purchase_id uuid, p_deliver boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase record;
  v_type public.product_type;
BEGIN
  IF public.get_my_role() <> 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão para confirmar pagamentos.';
  END IF;

  SELECT * INTO v_purchase FROM public.store_purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;
  IF v_purchase.status = 'refunded' THEN
    RAISE EXCEPTION 'Esta compra foi reembolsada.';
  END IF;

  SELECT type INTO v_type FROM public.store_products WHERE id = v_purchase.product_id;

  UPDATE public.store_purchases
  SET paid_at = COALESCE(paid_at, now()),
      -- digital pago = entregue (a chave fica disponível); físico só se p_deliver
      status = CASE WHEN p_deliver OR v_type = 'digital' THEN 'delivered'::public.purchase_status ELSE status END,
      delivered_at = CASE WHEN p_deliver OR v_type = 'digital' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
      updated_at = now()
  WHERE id = p_purchase_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_purchase_paid(uuid, boolean) TO authenticated;

-- 8. ENTREGA (só depois de pago)
CREATE OR REPLACE FUNCTION public.mark_purchase_delivered(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase record;
BEGIN
  IF public.get_my_role() <> 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão para confirmar entregas.';
  END IF;

  SELECT * INTO v_purchase FROM public.store_purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;
  IF v_purchase.status = 'refunded' THEN
    RAISE EXCEPTION 'Esta compra foi reembolsada.';
  END IF;
  IF v_purchase.paid_at IS NULL THEN
    RAISE EXCEPTION 'Confirma primeiro o pagamento.';
  END IF;

  UPDATE public.store_purchases
  SET status = 'delivered'::public.purchase_status,
      delivered_at = COALESCE(delivered_at, now()),
      updated_at = now()
  WHERE id = p_purchase_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_purchase_delivered(uuid) TO authenticated;

-- 9. REEMBOLSO / CANCELAMENTO — devolve o Gold do desconto e o stock
CREATE OR REPLACE FUNCTION public.refund_purchase(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase record;
  v_product_name text;
  v_type public.product_type;
BEGIN
  IF public.get_my_role() <> 'coordenador' THEN
    RAISE EXCEPTION 'Apenas coordenadores podem realizar reembolsos.';
  END IF;

  SELECT * INTO v_purchase FROM public.store_purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;
  IF v_purchase.status = 'refunded' THEN
    RAISE EXCEPTION 'Esta compra já foi reembolsada.';
  END IF;

  SELECT name, type INTO v_product_name, v_type
  FROM public.store_products WHERE id = v_purchase.product_id;

  -- 1. Devolver o Gold gasto no desconto (só membros registados)
  IF v_purchase.gold_spent > 0 AND v_purchase.user_id IS NOT NULL THEN
    INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
    VALUES (v_purchase.user_id, auth.uid(), 0, v_purchase.gold_spent, 'Reembolso de compra: ' || v_product_name);
  END IF;

  -- 2. Marcar como reembolsada
  UPDATE public.store_purchases
  SET status = 'refunded', updated_at = now()
  WHERE id = p_purchase_id;

  -- 3. Devolver stock se for físico
  IF v_type = 'physical' THEN
    UPDATE public.store_products SET stock = stock + 1 WHERE id = v_purchase.product_id;
  END IF;

  -- Nota: não "des-usamos" chaves digitais porque podem já ter sido vistas.
END;
$$;
