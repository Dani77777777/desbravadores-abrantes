-- ============================================
-- LOJA — CANCELAR A PRÓPRIA ENCOMENDA + APAGAR REGISTOS
-- Desbravadores Abrantes
-- ============================================
-- Correr DEPOIS de supabase-migration-store-quantity.sql.
--
-- 1. Quem comprou pode cancelar a sua encomenda enquanto não houver dinheiro
--    envolvido (por pagar, ou paga só com Gold e ainda não entregue):
--    - membros: pela conta (auth.uid());
--    - convidados: com o cancel_token que recebem na compra (guardado no
--      dispositivo).
--    O cancelamento devolve o Gold do desconto, repõe o stock e APAGA o
--    registo (um engano não fica no histórico).
-- 2. O coordenador pode apagar registos já cancelados/reembolsados.
-- ============================================

-- 1. COMPRAS: segredo para o convidado poder cancelar/consultar
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS cancel_token uuid DEFAULT gen_random_uuid();

-- 2. COMPRA (RPC) — igual à versão da quantidade, mas devolve o cancel_token
--    aos convidados.
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
  v_cancel_token uuid;
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
  RETURNING id, cancel_token INTO v_purchase_id, v_cancel_token;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    -- Só o convidado precisa do token (o membro cancela pela conta).
    'cancel_token', CASE WHEN v_user_id IS NULL THEN v_cancel_token END,
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

-- 3. CANCELAR A PRÓPRIA ENCOMENDA (membro pela conta, convidado pelo token)
CREATE OR REPLACE FUNCTION public.cancel_my_purchase(
  p_purchase_id uuid,
  p_cancel_token uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase record;
  v_product record;
BEGIN
  SELECT * INTO v_purchase FROM public.store_purchases WHERE id = p_purchase_id FOR UPDATE;

  -- Não encontrada ou sem permissão: a mesma mensagem (não revela se existe).
  IF NOT FOUND OR NOT COALESCE(
    (v_purchase.user_id IS NOT NULL AND v_purchase.user_id = auth.uid())
    OR (p_cancel_token IS NOT NULL AND v_purchase.cancel_token = p_cancel_token),
    false
  ) THEN
    RAISE EXCEPTION 'Encomenda não encontrada.';
  END IF;

  IF v_purchase.status <> 'pending' THEN
    RAISE EXCEPTION 'Esta encomenda já foi entregue ou cancelada. Fala com a direção.';
  END IF;
  -- Com dinheiro já entregue, o cancelamento passa pela direção (tem de devolver em mãos).
  IF v_purchase.paid_at IS NOT NULL AND COALESCE(v_purchase.amount_due_eur, 0) > 0 THEN
    RAISE EXCEPTION 'Esta encomenda já foi paga. Fala com a direção para a cancelar.';
  END IF;

  SELECT name, type, is_preorder INTO v_product
  FROM public.store_products WHERE id = v_purchase.product_id;

  -- 1. Devolver o Gold do desconto
  IF v_purchase.gold_spent > 0 AND v_purchase.user_id IS NOT NULL THEN
    INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
    VALUES (v_purchase.user_id, v_purchase.user_id, 0, v_purchase.gold_spent,
            'Encomenda cancelada: ' || COALESCE(v_product.name, 'artigo'));
  END IF;

  -- 2. Repor o stock (físico com stock; por encomenda não tem)
  IF v_product.type = 'physical' AND NOT COALESCE(v_product.is_preorder, false) THEN
    UPDATE public.store_products SET stock = stock + COALESCE(v_purchase.quantity, 1)
    WHERE id = v_purchase.product_id;
  END IF;
  -- Nota: tal como no reembolso, a chave digital reservada não volta ao stock.

  -- 3. Um engano não fica no histórico
  DELETE FROM public.store_purchases WHERE id = p_purchase_id;

  RETURN jsonb_build_object('success', true, 'gold_returned', COALESCE(v_purchase.gold_spent, 0));

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_my_purchase(uuid, uuid) TO anon, authenticated;

-- 4. PEDIDOS DO CONVIDADO — os que o dispositivo conhece (pelos tokens)
CREATE OR REPLACE FUNCTION public.get_guest_purchases(p_tokens uuid[])
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
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
    'product_name', p.name,
    'product_type', p.type,
    'is_preorder', p.is_preorder
  ) ORDER BY sp.created_at DESC), '[]'::jsonb)
  FROM public.store_purchases sp
  LEFT JOIN public.store_products p ON p.id = sp.product_id
  WHERE sp.user_id IS NULL
    AND sp.cancel_token = ANY(COALESCE(p_tokens[1:20], '{}'));
$$;

GRANT EXECUTE ON FUNCTION public.get_guest_purchases(uuid[]) TO anon, authenticated;

-- 5. APAGAR REGISTO (coordenador) — só compras já canceladas/reembolsadas,
--    para limpar enganos do histórico. O Gold já foi devolvido no reembolso.
CREATE OR REPLACE FUNCTION public.delete_purchase_record(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status public.purchase_status;
BEGIN
  IF public.get_my_role() <> 'coordenador' THEN
    RAISE EXCEPTION 'Apenas coordenadores podem apagar registos.';
  END IF;

  SELECT status INTO v_status FROM public.store_purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;
  IF v_status <> 'refunded' THEN
    RAISE EXCEPTION 'Só se podem apagar compras canceladas ou reembolsadas.';
  END IF;

  DELETE FROM public.store_purchases WHERE id = p_purchase_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_purchase_record(uuid) TO authenticated;
