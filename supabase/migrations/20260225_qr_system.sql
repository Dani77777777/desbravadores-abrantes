-- ============================================
-- QR SYSTEM SETUP
-- ============================================

-- 1. Tabelas
CREATE TABLE IF NOT EXISTS public.qr_codes (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    code text UNIQUE NOT NULL,
    title text NOT NULL,
    content text,
    xp_reward integer NOT NULL DEFAULT 0,
    gold_reward integer NOT NULL DEFAULT 0,
    auto_claim boolean NOT NULL DEFAULT true,
    max_uses_global integer, -- NULL significa ilimitado
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.qr_scans (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    qr_code_id uuid REFERENCES public.qr_codes(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    points_awarded boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(qr_code_id, user_id) -- Cada user só pode usar 1 vez cada código
);

-- 2. Ativar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.qr_scans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.qr_codes;

-- 3. RLS
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_scans ENABLE ROW LEVEL SECURITY;

-- QR_CODES: Qualquer autenticado pode ver os dados básicos para resgate, mas não editar
CREATE POLICY "Authenticated users can view QR codes" ON public.qr_codes
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Coordinators can manage QR codes" ON public.qr_codes
    FOR ALL TO authenticated USING (
        public.get_my_role() = 'coordenador'
    );

-- QR_SCANS: Utilizadores vêm os seus resgates, admins vêm todos
CREATE POLICY "Users can view own scans" ON public.qr_scans
    FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Coordinators can view all scans" ON public.qr_scans
    FOR SELECT TO authenticated USING (
        public.get_my_role() = 'coordenador'
    );

-- Permitir inserir scan se for o próprio
CREATE POLICY "Users can insert own scans" ON public.qr_scans
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- 4. Comentários
COMMENT ON TABLE public.qr_codes IS 'Stores dynamic QR codes / short codes for reward attribution.';
COMMENT ON TABLE public.qr_scans IS 'Tracks which users have redeemed which codes.';
