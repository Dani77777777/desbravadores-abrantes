-- ============================================
-- LOJA — VÁRIAS UNIDADES NA MESMA ENCOMENDA
-- Desbravadores Abrantes
-- ============================================
-- Correr DEPOIS de supabase-migration-store-preorders.sql.
--
-- Uma encomenda passa a ter quantidade (1 a 10). O preço é unitário
-- (store_purchases.price_eur); o total = preço × quantidade − desconto.
-- O desconto máximo em Gold aplica-se ao total. Artigos digitais ficam
-- sempre com quantidade 1 (uma chave por compra).
-- ============================================

-- 1. COMPRAS: quantidade
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE public.store_purchases
    ADD CONSTRAINT store_purchases_quantity_check CHECK (quantity BETWEEN 1 AND 10);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. COMPRA (RPC) — nova assinatura com p_quantity; remove a antiga para não
--    haver duas versões ambíguas.
DROP FUNCTION IF EXISTS public.process_purchase(uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.process_purchase(
  p_product_id uuid,
  p_discount_eur numeric DEFAULT 0,
  p_buyer_name text DEFAULT NULL,
  p_quantity integer DEFAULT 1
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
  v_qty integer := COALESCE(p_quantity, 1);
  v_total numeric;
BEGIN
  -- 1. Produto
  SELECT id, name, price_eur, max_discount_percent, type, stock, min_level,
         is_preorder, preorder_deadline
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

    v_max_discount := round(v_total * v_product.max_discount_percent / 100.0, 2);
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
  v_amount_due := round(v_total - v_discount, 2);
  v_paid := v_amount_due <= 0;
  -- Digital já pago fica entregue de imediato; tudo o resto aguarda pagamento/entrega.
  v_status := CASE WHEN v_paid AND v_product.type = 'digital'
                   THEN 'delivered'::public.purchase_status
                   ELSE 'pending'::public.purchase_status END;

  INSERT INTO public.store_purchases (
    user_id, buyer_name, product_id, status, digital_key_delivered,
    price_eur, discount_eur, amount_due_eur, gold_spent, gold_rate,
    paid_at, delivered_at, quantity
  )
  VALUES (
    v_user_id, v_buyer_name, p_product_id, v_status, v_key_value,
    v_product.price_eur, v_discount, v_amount_due, v_gold_cost, v_rate,
    CASE WHEN v_paid THEN now() END,
    CASE WHEN v_status = 'delivered' THEN now() END,
    v_qty
  )
  RETURNING id INTO v_purchase_id;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'amount_due_eur', v_amount_due,
    'discount_eur', v_discount,
    'gold_spent', v_gold_cost,
    'paid', v_paid,
    'quantity', v_qty,
    'preorder', v_product.is_preorder,
    'digital_key', CASE WHEN v_paid THEN v_key_value END,
    'message', CASE
      WHEN v_product.is_preorder AND NOT v_paid
        THEN 'Reserva registada! Paga ' || to_char(v_amount_due, 'FM999990.00') || ' € em dinheiro ao teu dirigente. Levantas o artigo quando chegar.'
      WHEN v_product.is_preorder
        THEN 'Reserva paga com Gold! Levantas o artigo quando chegar.'
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

GRANT EXECUTE ON FUNCTION public.process_purchase(uuid, numeric, text, integer) TO anon, authenticated;

-- 3. REEMBOLSO — repõe todas as unidades (artigos por encomenda não têm stock).
CREATE OR REPLACE FUNCTION public.refund_purchase(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase record;
  v_product_name text;
  v_type public.product_type;
  v_is_preorder boolean;
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

  SELECT name, type, is_preorder INTO v_product_name, v_type, v_is_preorder
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

  -- 3. Devolver stock (todas as unidades) se for físico com stock (não por encomenda)
  IF v_type = 'physical' AND NOT COALESCE(v_is_preorder, false) THEN
    UPDATE public.store_products SET stock = stock + COALESCE(v_purchase.quantity, 1) WHERE id = v_purchase.product_id;
  END IF;

  -- Nota: não "des-usamos" chaves digitais porque podem já ter sido vistas.
END;
$$;
