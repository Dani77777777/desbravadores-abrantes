-- ============================================
-- GOLD STORE SETUP - Desbravadores Abrantes
-- ============================================

-- 0. TYPOS
DO $$ BEGIN
  CREATE TYPE public.product_type AS ENUM ('physical', 'digital');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.purchase_status AS ENUM ('pending', 'delivered', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. TABLES
CREATE TABLE IF NOT EXISTS public.store_products (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL,
  description text,
  price integer NOT NULL CHECK (price >= 0),
  type public.product_type NOT NULL,
  stock integer NOT NULL DEFAULT 0,
  image_url text,
  restrictions jsonb DEFAULT '[]'::jsonb, -- Array of section names
  is_active boolean DEFAULT true,
  min_level integer DEFAULT 0 CHECK (min_level >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.digital_keys (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  product_id uuid REFERENCES public.store_products(id) ON DELETE CASCADE NOT NULL,
  key_value text NOT NULL,
  is_used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.store_purchases (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES public.store_products(id) ON DELETE CASCADE NOT NULL,
  status public.purchase_status NOT NULL DEFAULT 'pending',
  digital_key_delivered text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. RLS POLICIES

ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active products" ON public.store_products;
DROP POLICY IF EXISTS "Coordinators manage products" ON public.store_products;

CREATE POLICY "Public can view active products" ON public.store_products
  FOR SELECT USING (is_active = true OR public.get_my_role() = 'coordenador');

CREATE POLICY "Coordinators manage products" ON public.store_products
  FOR ALL USING (public.get_my_role() = 'coordenador');

ALTER TABLE public.digital_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Only coordinators can manage keys" ON public.digital_keys;

CREATE POLICY "Only coordinators can manage keys" ON public.digital_keys
  FOR ALL USING (public.get_my_role() = 'coordenador');

ALTER TABLE public.store_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own purchases" ON public.store_purchases;
DROP POLICY IF EXISTS "Coordinators can view all purchases" ON public.store_purchases;
DROP POLICY IF EXISTS "Coordinators can update purchases" ON public.store_purchases;

CREATE POLICY "Users can view own purchases" ON public.store_purchases
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Coordinators can view all purchases" ON public.store_purchases
  FOR SELECT USING (public.get_my_role() = 'coordenador');

CREATE POLICY "Coordinators can update purchases" ON public.store_purchases
  FOR UPDATE USING (public.get_my_role() = 'coordenador');

-- 3. PURCHASE LOGIC (RPC)

CREATE OR REPLACE FUNCTION public.process_purchase(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_price integer;
  v_product_name text;
  v_product_type public.product_type;
  v_stock integer;
  v_user_gold integer;
  v_user_xp integer;
  v_min_level integer;
  v_key_id uuid;
  v_key_value text;
  v_purchase_id uuid;
BEGIN
  -- 1. Checks
  SELECT name, price, type, stock, min_level INTO v_product_name, v_price, v_product_type, v_stock, v_min_level
  FROM public.store_products WHERE id = p_product_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado ou inativo.';
  END IF;

  SELECT current_gold, total_xp INTO v_user_gold, v_user_xp FROM public.profiles WHERE id = v_user_id;

  IF v_min_level > 1 AND (floor(v_user_xp / 1000) + 1) < v_min_level THEN
    RAISE EXCEPTION 'Nível insuficiente. Precisas de Nível %!', v_min_level;
  END IF;
  
  IF v_user_gold < v_price THEN
    RAISE EXCEPTION 'Saldo insuficiente. Tens % 🪙 e o produto custa % 🪙.', v_user_gold, v_price;
  END IF;

  -- 2. Availability
  IF v_product_type = 'physical' THEN
    IF v_stock <= 0 THEN
      RAISE EXCEPTION 'Produto esgotado.';
    END IF;
    
    -- Update stock
    UPDATE public.store_products SET stock = stock - 1 WHERE id = p_product_id;
    
  ELSIF v_product_type = 'digital' THEN
    SELECT id, key_value INTO v_key_id, v_key_value
    FROM public.digital_keys
    WHERE product_id = p_product_id AND is_used = false
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_key_id IS NULL THEN
      RAISE EXCEPTION 'Não existem chaves digitais disponíveis para este produto.';
    END IF;

    -- Mark key as used
    UPDATE public.digital_keys SET is_used = true WHERE id = v_key_id;
  END IF;

  -- 3. Accounting & Logging
  -- The trigger on points_log will update profiles automatically
  INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
  VALUES (v_user_id, v_user_id, 0, -v_price, 'Compra na Loja: ' || v_product_name);

  -- 4. Record Purchase
  INSERT INTO public.store_purchases (user_id, product_id, status, digital_key_delivered)
  VALUES (v_user_id, p_product_id, 
    CASE WHEN v_product_type = 'digital' THEN 'delivered'::public.purchase_status ELSE 'pending'::public.purchase_status END,
    v_key_value)
  RETURNING id INTO v_purchase_id;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'digital_key', v_key_value,
    'message', CASE WHEN v_product_type = 'digital' THEN 'Compra concluída!' ELSE 'Compra registada! Levanta com o teu coordenador.' END
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 4. REFUND LOGIC (RPC)

CREATE OR REPLACE FUNCTION public.refund_purchase(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_product_id uuid;
  v_price integer;
  v_product_name text;
  v_status public.purchase_status;
  v_type public.product_type;
BEGIN
  -- Check if user is coordinator
  IF public.get_my_role() <> 'coordenador' THEN
    RAISE EXCEPTION 'Apenas coordenadores podem realizar reembolsos.';
  END IF;

  -- Get purchase details
  SELECT user_id, product_id, status INTO v_user_id, v_product_id, v_status
  FROM public.store_purchases WHERE id = p_purchase_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;

  IF v_status = 'refunded' THEN
    RAISE EXCEPTION 'Esta compra já foi reembolsada.';
  END IF;

  -- Get product details
  SELECT name, price, type INTO v_product_name, v_price, v_type
  FROM public.store_products WHERE id = v_product_id;

  -- 1. Refund Gold
  INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
  VALUES (v_user_id, auth.uid(), 0, v_price, 'Reembolso de compra: ' || v_product_name);

  -- 2. Update Purchase Status
  UPDATE public.store_purchases SET status = 'refunded' WHERE id = p_purchase_id;

  -- 3. Return stock if physical
  IF v_type = 'physical' THEN
    UPDATE public.store_products SET stock = stock + 1 WHERE id = v_product_id;
  END IF;

  -- Note: We don't "un-use" digital keys because they might have been seen by the user already.
END;
$$;
