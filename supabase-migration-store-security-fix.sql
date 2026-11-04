-- ============================================
-- LOJA — CORREÇÕES DE SEGURANÇA
-- Desbravadores Abrantes
-- ============================================
-- Correr DEPOIS de supabase-migration-store-volume-discount.sql (ou do
-- supabase-schema-completo.sql). Idempotente: corre-se inteira no SQL Editor,
-- e pode voltar a correr-se.
-- Pedido em docs/Loja-correcoes.md.
--
-- 1. Verificações de permissão à prova de NULL. Sem sessão, get_my_role() e
--    get_my_real_role() devolvem NULL, e "NULL <> 'coordenador'" (ou NOT IN,
--    ou IF NOT (...)) NÃO dispara o RAISE: a função corria até ao fim.
--    Regra: nunca <> nem NOT IN numa verificação de permissão; usar
--    IS DISTINCT FROM ou COALESCE(..., '') NOT IN (...).
--    Corrigido na Loja e no resto do schema (ajudantes, investidura, reverter
--    pontos de eventos, RSVP por um membro, inquéritos, cargos).
-- 2. A chave digital só é atribuída quando a compra fica paga
--    (process_purchase paga toda com Gold, ou mark_purchase_paid). As chaves
--    dadas a encomendas por pagar voltam ao stock.
-- 3. A Loja é só da coordenação REAL (get_my_real_role): os ajudantes com
--    papel de coordenador deixam de mexer em pagamentos, preços e chaves.
-- 4. Sem UPDATE direto em store_purchases: tudo passa pelas funções.
-- 5. Compras que chegaram a ser pagas não se apagam (ficam no histórico).
-- 6. Limite de encomendas por pagar (3 por membro; teto global para
--    convidados) e caducidade das encomendas físicas por pagar (não reservas).
-- 7. Mensagens: "Paga X € a um coordenador do clube".
-- 8. cost_price deixa de ser legível pelo anon/authenticated. A página da Loja
--    calcula os preços no servidor; a gestão lê o custo por
--    get_store_product_costs() (só coordenação real).
-- ============================================

BEGIN;

-- ============================================================================
-- 0. DEFINIÇÕES NOVAS DA LOJA
-- ============================================================================
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS unpaid_expiry_days integer NOT NULL DEFAULT 14
    CHECK (unpaid_expiry_days BETWEEN 1 AND 365);
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS max_guest_unpaid_orders integer NOT NULL DEFAULT 10
    CHECK (max_guest_unpaid_orders BETWEEN 0 AND 1000);

-- ============================================================================
-- 1. COMPRA (RPC)
--    Igual à versão do desconto por quantidade, com:
--    - limite de encomendas por pagar (membros: 3; convidados: teto global);
--    - digital por pagar: não fica com chave (só se verifica que há stock);
--    - mensagens "a um coordenador do clube".
-- ============================================================================
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
  RETURNING id, cancel_token INTO v_purchase_id, v_cancel_token;

  v_due_text := to_char(v_amount_due, 'FM999990.00') || ' €';

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
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

-- ============================================================================
-- 2. CONFIRMAR PAGAMENTO — só coordenação real; atribui a chave digital aqui.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_purchase_paid(p_purchase_id uuid, p_deliver boolean DEFAULT false)
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
      digital_key_delivered = COALESCE(digital_key_delivered, v_key_value),
      -- digital pago = entregue (a chave fica disponível); físico só se p_deliver
      status = CASE WHEN p_deliver OR v_type = 'digital' THEN 'delivered'::public.purchase_status ELSE status END,
      delivered_at = CASE WHEN p_deliver OR v_type = 'digital' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
      updated_at = now()
  WHERE id = p_purchase_id;
END;
$$;

-- ============================================================================
-- 3. CONFIRMAR ENTREGA — só coordenação real.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_purchase_delivered(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purchase record;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão para confirmar entregas.';
  END IF;

  SELECT * INTO v_purchase FROM public.store_purchases WHERE id = p_purchase_id FOR UPDATE;
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

-- ============================================================================
-- 4. REEMBOLSO / CANCELAMENTO PELA COORDENAÇÃO — só coordenação real.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.refund_purchase(p_purchase_id uuid)
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
  -- (Uma encomenda digital por pagar já não tem chave.)
END;
$$;

-- ============================================================================
-- 5. APAGAR REGISTO — só coordenação real, e só compras que nunca foram pagas.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_purchase_record(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status public.purchase_status;
  v_paid_at timestamptz;
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Apenas coordenadores podem apagar registos.';
  END IF;

  SELECT status, paid_at INTO v_status, v_paid_at
  FROM public.store_purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;
  IF v_status <> 'refunded' THEN
    RAISE EXCEPTION 'Só se podem apagar compras canceladas ou reembolsadas.';
  END IF;
  IF v_paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta compra teve dinheiro envolvido e fica no histórico.';
  END IF;

  DELETE FROM public.store_purchases WHERE id = p_purchase_id;
END;
$$;

-- ============================================================================
-- 6. CANCELAR A PRÓPRIA ENCOMENDA — igual, mas devolve ao stock uma chave
--    que uma encomenda antiga por pagar ainda tenha.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cancel_my_purchase(p_purchase_id uuid, p_cancel_token uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    RAISE EXCEPTION 'Esta encomenda já foi entregue ou cancelada. Fala com a coordenação.';
  END IF;
  -- Com dinheiro já entregue, o cancelamento passa pela coordenação (tem de devolver em mãos).
  IF v_purchase.paid_at IS NOT NULL AND COALESCE(v_purchase.amount_due_eur, 0) > 0 THEN
    RAISE EXCEPTION 'Esta encomenda já foi paga. Fala com a coordenação para a cancelar.';
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

  -- 3. Digital por pagar com chave (encomendas de antes desta correção): a chave volta.
  IF v_purchase.paid_at IS NULL AND v_purchase.digital_key_delivered IS NOT NULL THEN
    UPDATE public.digital_keys SET is_used = false
    WHERE product_id = v_purchase.product_id AND key_value = v_purchase.digital_key_delivered;
  END IF;

  -- 4. Um engano não fica no histórico
  DELETE FROM public.store_purchases WHERE id = p_purchase_id;

  RETURN jsonb_build_object('success', true, 'gold_returned', COALESCE(v_purchase.gold_spent, 0));

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================================
-- 7. CADUCIDADE DAS ENCOMENDAS FÍSICAS POR PAGAR (não reservas)
--    Ao fim de store_settings.unpaid_expiry_days dias: devolve o Gold, repõe o
--    stock e apaga o registo (a mesma lógica de cancel_my_purchase).
--    Só o servidor a chama: pg_cron (se existir) e a página da Loja / o /admin
--    com a service role (lib/store-maintenance.ts).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.expire_unpaid_store_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_days integer;
  v_count integer := 0;
  r record;
BEGIN
  SELECT COALESCE((SELECT unpaid_expiry_days FROM public.store_settings WHERE id = true), 14)
    INTO v_days;

  FOR r IN
    SELECT sp.id, sp.user_id, sp.product_id, sp.quantity, sp.gold_spent, p.name
    FROM public.store_purchases sp
    JOIN public.store_products p ON p.id = sp.product_id
    WHERE sp.status = 'pending'
      AND sp.paid_at IS NULL
      AND p.type = 'physical'
      AND NOT COALESCE(p.is_preorder, false)
      AND sp.created_at < now() - make_interval(days => v_days)
    FOR UPDATE OF sp SKIP LOCKED
  LOOP
    IF r.gold_spent > 0 AND r.user_id IS NOT NULL THEN
      INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
      VALUES (r.user_id, r.user_id, 0, r.gold_spent, 'Encomenda caducada (não foi paga): ' || COALESCE(r.name, 'artigo'));
    END IF;

    UPDATE public.store_products SET stock = stock + COALESCE(r.quantity, 1)
    WHERE id = r.product_id;

    DELETE FROM public.store_purchases WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ============================================================================
-- 8. PREÇO DE CUSTO PARA A GESTÃO — só coordenação real.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_store_product_costs()
RETURNS TABLE(product_id uuid, cost_price numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.get_my_real_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;

  RETURN QUERY SELECT p.id, p.cost_price FROM public.store_products p;
END;
$$;

-- ============================================================================
-- 9. FORA DA LOJA: as mesmas verificações à prova de NULL
--    (corpos iguais aos atuais; só muda a linha da verificação)
-- ============================================================================

-- finalize_survey
CREATE OR REPLACE FUNCTION public.finalize_survey(p_survey_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  r record;
  s_question text;
  s_deadline timestamptz;
  s_definitive boolean;
  s_finalized timestamptz;
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'Apenas coordenadores podem finalizar inquéritos';
  END IF;

  SELECT question, deadline, is_definitive, finalized_at
    INTO s_question, s_deadline, s_definitive, s_finalized
    FROM public.surveys WHERE id = p_survey_id;

  IF s_question IS NULL THEN
    RAISE EXCEPTION 'Inquérito não encontrado';
  END IF;
  IF s_definitive THEN
    RAISE EXCEPTION 'Este inquérito é definitivo — os pontos foram atribuídos no acto do voto';
  END IF;
  IF s_finalized IS NOT NULL THEN
    RAISE EXCEPTION 'Este inquérito já foi finalizado';
  END IF;
  IF s_deadline > now() THEN
    RAISE EXCEPTION 'O inquérito ainda não terminou';
  END IF;

  FOR r IN
    SELECT resp.user_id, opt.xp_reward, opt.gold_reward
      FROM public.survey_responses resp
      JOIN public.survey_options opt ON opt.id = resp.option_id
      WHERE resp.survey_id = p_survey_id
        AND (opt.xp_reward > 0 OR opt.gold_reward > 0)
  LOOP
    INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
    VALUES (r.user_id, auth.uid(), r.xp_reward, r.gold_reward, 'Resposta a inquérito: ' || s_question);
  END LOOP;

  UPDATE public.surveys SET finalized_at = now() WHERE id = p_survey_id;
END;
$$;

-- list_club_members_for_assignment
CREATE OR REPLACE FUNCTION public.list_club_members_for_assignment() RETURNS TABLE(id uuid, full_name text, avatar_url text, section public.app_section, role public.app_role, helper_role public.app_role, helper_section public.app_section)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN
  IF COALESCE(public.get_my_real_role(), '') NOT IN ('coordenador', 'dirigente') THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;

  RETURN QUERY
    SELECT p.id, p.full_name, p.avatar_url, p.section, p.role, p.helper_role, p.helper_section
    FROM public.profiles p
    WHERE p.role = 'desbravador'
    ORDER BY p.full_name;
END;
$$;

-- assign_helper
CREATE OR REPLACE FUNCTION public.assign_helper(p_target_id uuid, p_helper_role text DEFAULT NULL::text, p_helper_section text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_real_role text := public.get_my_real_role();
  v_my_section text;
  v_target_role text;
  v_target_helper_role text;
  v_target_helper_section text;
  v_new_role public.app_role;
  v_new_section public.app_section;
BEGIN
  IF COALESCE(v_real_role, '') NOT IN ('coordenador', 'dirigente') THEN
    RAISE EXCEPTION 'Sem permissão para nomear ajudantes.';
  END IF;

  SELECT role::text, helper_role::text, helper_section::text
    INTO v_target_role, v_target_helper_role, v_target_helper_section
    FROM public.profiles WHERE id = p_target_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Membro não encontrado.';
  END IF;

  IF v_real_role = 'dirigente' THEN
    SELECT COALESCE(leadership_section, section)::text INTO v_my_section
    FROM public.profiles WHERE id = auth.uid();
  END IF;

  IF p_helper_role IS NULL THEN
    -- Remoção: o dirigente só pode remover ajudantes do seu próprio âmbito.
    IF v_real_role = 'dirigente'
       AND NOT (v_target_helper_role = 'dirigente' AND v_target_helper_section = v_my_section) THEN
      RAISE EXCEPTION 'Só podes remover ajudantes da tua secção.';
    END IF;
    v_new_role := NULL;
    v_new_section := NULL;
  ELSE
    -- Só membros (desbravadores) podem ser ajudantes
    IF v_target_role <> 'desbravador' THEN
      RAISE EXCEPTION 'Apenas membros podem ser nomeados ajudantes.';
    END IF;

    IF v_real_role = 'coordenador' THEN
      IF p_helper_role = 'coordenador' THEN
        v_new_role := 'coordenador';
        v_new_section := NULL;
      ELSIF p_helper_role = 'dirigente' THEN
        IF p_helper_section IS NULL THEN
          RAISE EXCEPTION 'É necessária uma secção para um ajudante de dirigente.';
        END IF;
        v_new_role := 'dirigente';
        v_new_section := p_helper_section::public.app_section;
      ELSE
        RAISE EXCEPTION 'Âmbito de ajudante inválido.';
      END IF;
    ELSE
      -- dirigente real: âmbito fixo na sua secção; não pode "roubar" ajudante de outro âmbito.
      IF v_target_helper_role IS NOT NULL
         AND NOT (v_target_helper_role = 'dirigente' AND v_target_helper_section = v_my_section) THEN
        RAISE EXCEPTION 'Este membro já é ajudante de outro âmbito.';
      END IF;
      v_new_role := 'dirigente';
      v_new_section := v_my_section::public.app_section;
    END IF;
  END IF;

  -- Ativa o bypass do trigger e aplica a alteração
  PERFORM set_config('app.allow_role_change', 'on', true);
  UPDATE public.profiles
    SET helper_role = v_new_role,
        helper_section = v_new_section,
        updated_at = now()
    WHERE id = p_target_id;
END;
$$;

-- protect_role_columns
CREATE OR REPLACE FUNCTION public.protect_role_columns() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF (
        NEW.role               IS DISTINCT FROM OLD.role
     OR NEW.leadership_section IS DISTINCT FROM OLD.leadership_section
     OR NEW.helper_role        IS DISTINCT FROM OLD.helper_role
     OR NEW.helper_section     IS DISTINCT FROM OLD.helper_section
  )
  AND COALESCE(current_setting('app.allow_role_change', true), '') <> 'on'
  AND auth.uid() IS NOT NULL
  AND public.get_my_real_role() IS DISTINCT FROM 'coordenador'
  THEN
    RAISE EXCEPTION 'Sem permissão para alterar cargos.';
  END IF;
  RETURN NEW;
END;
$$;

-- revert_event_points
CREATE OR REPLACE FUNCTION public.revert_event_points(p_event_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_role text := public.get_my_role();
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado.';
  END IF;

  -- Apenas coordenador, ou dirigente da secção-alvo do evento (mesma regra da gestão de eventos)
  IF NOT COALESCE(
    v_role = 'coordenador'
    OR (v_role = 'dirigente' AND v_event.target_section = public.get_my_leadership_section()),
    false
  ) THEN
    RAISE EXCEPTION 'Sem permissão para reverter este evento.';
  END IF;

  -- 1. Remover os pontos atribuídos por este evento.
  --    O gatilho on_points_log_change recalcula automaticamente os totais dos perfis.
  DELETE FROM public.points_log WHERE event_id = p_event_id;

  -- 2. Marcar presenças como não atribuídas (mantém o estado presente/atrasado/faltou para correção)
  UPDATE public.event_attendance
  SET points_awarded = false, awarded_at = NULL, updated_at = now()
  WHERE event_id = p_event_id;

  -- 3. Reabrir o evento
  UPDATE public.events
  SET is_finished = false, updated_at = now()
  WHERE id = p_event_id;
END;
$$;

-- set_member_invested
CREATE OR REPLACE FUNCTION public.set_member_invested(p_member_id uuid, p_invested boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_section text;
BEGIN
  SELECT section::text INTO v_section FROM public.profiles WHERE id = p_member_id;
  IF v_section IS NULL THEN
    RAISE EXCEPTION 'Membro não encontrado.';
  END IF;

  IF NOT COALESCE(
    public.get_my_role() = 'coordenador'
    OR (public.get_my_role() = 'dirigente' AND v_section = public.get_my_leadership_section()),
    false
  ) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a investidura deste membro.';
  END IF;

  UPDATE public.profiles SET is_invested = p_invested WHERE id = p_member_id;
END;
$$;

-- set_event_rsvp_for_member
CREATE OR REPLACE FUNCTION public.set_event_rsvp_for_member(p_event_id uuid, p_user_id uuid, p_going boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_role text := public.get_my_role();
  v_member_section text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entra outra vez.';
  END IF;

  IF COALESCE(v_role, '') NOT IN ('coordenador', 'dirigente') THEN
    RAISE EXCEPTION 'Sem permissão para responder por um membro.';
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado.';
  END IF;

  IF NOT v_event.rsvp_enabled THEN
    RAISE EXCEPTION 'Este evento não pede confirmação de presença.';
  END IF;

  IF v_event.is_finished THEN
    RAISE EXCEPTION 'Este evento já foi finalizado.';
  END IF;

  SELECT section::text INTO v_member_section FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membro não encontrado.';
  END IF;

  -- O membro tem de fazer parte do público-alvo do evento.
  IF v_event.target_section IS NOT NULL
     AND v_member_section IS DISTINCT FROM v_event.target_section::text THEN
    RAISE EXCEPTION 'Este membro não faz parte do público deste evento.';
  END IF;

  -- O dirigente (incluindo ajudante de dirigente) fica limitado à sua classe.
  IF v_role = 'dirigente'
     AND v_member_section IS DISTINCT FROM public.get_my_leadership_section() THEN
    RAISE EXCEPTION 'Só podes responder por membros da tua secção.';
  END IF;

  -- Não substitui o que o próprio membro já respondeu.
  PERFORM 1
  FROM public.event_rsvps
  WHERE event_id = p_event_id AND user_id = p_user_id;
  IF FOUND THEN
    RAISE EXCEPTION 'Este membro já respondeu.';
  END IF;

  INSERT INTO public.event_rsvps (event_id, user_id, going)
  VALUES (p_event_id, p_user_id, p_going);
END;
$$;


-- ============================================================================
-- 10. POLÍTICAS DA LOJA: coordenação REAL, e sem UPDATE direto às compras
-- ============================================================================
-- Todas as mudanças em compras passam pelas funções SECURITY DEFINER.
DROP POLICY IF EXISTS "Coordinators can update purchases" ON public.store_purchases;

DROP POLICY IF EXISTS "Coordinators can view all purchases" ON public.store_purchases;
CREATE POLICY "Coordinators can view all purchases" ON public.store_purchases
  FOR SELECT USING (public.get_my_real_role() = 'coordenador');

DROP POLICY IF EXISTS "Coordinators manage products" ON public.store_products;
CREATE POLICY "Coordinators manage products" ON public.store_products
  USING (public.get_my_real_role() = 'coordenador');

DROP POLICY IF EXISTS "Public can view active products" ON public.store_products;
CREATE POLICY "Public can view active products" ON public.store_products
  FOR SELECT USING (is_active = true OR public.get_my_real_role() = 'coordenador');

DROP POLICY IF EXISTS "Coordinators manage store settings" ON public.store_settings;
CREATE POLICY "Coordinators manage store settings" ON public.store_settings
  USING (public.get_my_real_role() = 'coordenador');

DROP POLICY IF EXISTS "Only coordinators can manage keys" ON public.digital_keys;
CREATE POLICY "Only coordinators can manage keys" ON public.digital_keys
  USING (public.get_my_real_role() = 'coordenador');

-- Imagens dos produtos (storage, pasta products/): também só coordenação real.
DROP POLICY IF EXISTS "Coordinators can upload product images" ON storage.objects;
CREATE POLICY "Coordinators can upload product images" ON storage.objects
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (((bucket_id = 'imagens'::text) AND ((storage.foldername(name))[1] = 'products'::text) AND (public.get_my_real_role() = 'coordenador'::text)));
DROP POLICY IF EXISTS "Coordinators can update product images" ON storage.objects;
CREATE POLICY "Coordinators can update product images" ON storage.objects
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (((bucket_id = 'imagens'::text) AND ((storage.foldername(name))[1] = 'products'::text) AND (public.get_my_real_role() = 'coordenador'::text)));
DROP POLICY IF EXISTS "Coordinators can delete product images" ON storage.objects;
CREATE POLICY "Coordinators can delete product images" ON storage.objects
  AS PERMISSIVE FOR DELETE
  TO authenticated
  USING (((bucket_id = 'imagens'::text) AND ((storage.foldername(name))[1] = 'products'::text) AND (public.get_my_real_role() = 'coordenador'::text)));

-- ============================================================================
-- 11. PERMISSÕES DAS FUNÇÕES
-- ============================================================================
-- O EXECUTE vem também do PUBLIC (por omissão), por isso tira-se aos dois.
-- Coordenação da Loja: só com sessão (a função confirma a coordenação real).
REVOKE ALL ON FUNCTION public.mark_purchase_paid(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_purchase_delivered(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.refund_purchase(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_purchase_record(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_store_product_costs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_purchase_paid(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_purchase_delivered(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_purchase(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_purchase_record(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_store_product_costs() TO authenticated, service_role;

-- Caducidade: só o servidor (service role / pg_cron).
REVOKE ALL ON FUNCTION public.expire_unpaid_store_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_store_orders() TO service_role;

-- Compra e cancelamento continuam abertos a convidados.
GRANT EXECUTE ON FUNCTION public.process_purchase(uuid, numeric, text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_my_purchase(uuid, uuid) TO anon, authenticated, service_role;

-- Funções de gestão fora da Loja: nunca precisam de correr sem sessão.
REVOKE ALL ON FUNCTION public.finalize_survey(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_club_members_for_assignment() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_helper(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revert_event_points(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_member_invested(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_event_rsvp_for_member(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_survey(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_club_members_for_assignment() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_helper(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revert_event_points(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_member_invested(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_event_rsvp_for_member(uuid, uuid, boolean) TO authenticated, service_role;

-- Auditoria de pontos: tratam "sem sessão" como SQL Editor (auth.uid() IS NULL),
-- mas pela API o anon também não tem sessão. Ficam só para quem tem sessão.
REVOKE ALL ON FUNCTION public.audit_fix_totals() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.audit_points_mismatches() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_fix_totals() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.audit_points_mismatches() TO authenticated, service_role;

-- ============================================================================
-- 12. cost_price ESCONDIDO DO BROWSER
-- ============================================================================
-- Tira-se o SELECT da tabela e dá-se coluna a coluna, menos cost_price.
-- ATENÇÃO: colunas que se criem depois NÃO ficam visíveis ao anon/authenticated;
-- se a Loja passar a precisar de uma, volta a correr este bloco.
-- INSERT/UPDATE/DELETE continuam iguais (a gestão grava o custo).
REVOKE SELECT ON public.store_products FROM anon, authenticated;
DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'store_products' AND column_name <> 'cost_price';
  EXECUTE format('GRANT SELECT (%s) ON public.store_products TO anon, authenticated', v_cols);
END $$;

-- ============================================================================
-- 13. LIMPEZA: chaves dadas a encomendas digitais POR PAGAR voltam ao stock
-- ============================================================================
WITH legacy AS (
  SELECT sp.id, sp.product_id, sp.digital_key_delivered AS key_value
  FROM public.store_purchases sp
  JOIN public.store_products p ON p.id = sp.product_id
  WHERE p.type = 'digital'
    AND sp.status = 'pending'
    AND sp.paid_at IS NULL
    AND sp.digital_key_delivered IS NOT NULL
),
freed AS (
  UPDATE public.digital_keys k
  SET is_used = false
  FROM legacy l
  WHERE k.product_id = l.product_id AND k.key_value = l.key_value
  RETURNING k.id
)
UPDATE public.store_purchases sp
SET digital_key_delivered = NULL, updated_at = now()
FROM legacy l
WHERE sp.id = l.id;

-- ============================================================================
-- 14. pg_cron (se existir no projeto): caducidade todos os dias às 03:17 UTC.
--     Sem pg_cron, a Loja e o /admin chamam a função ao abrir.
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'store-expire-unpaid-orders';
    PERFORM cron.schedule('store-expire-unpaid-orders', '17 3 * * *', 'SELECT public.expire_unpaid_store_orders();');
  END IF;
END $$;

COMMIT;
