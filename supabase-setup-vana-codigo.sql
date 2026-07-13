-- ============================================
-- VANACÓDIGO — Desafio diário de decifração
-- (Morse, Semáforo, Cifra de César, Números, Atbash)
-- Correr no SQL Editor do Supabase.
-- ============================================

-- 1. Tabela de sessões (uma por utilizador+modo; o upsert diário substitui a antiga)
CREATE TABLE IF NOT EXISTS public.vana_codigo_sessions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('recruta', 'explorador', 'mestre')),
  code_type text NOT NULL CHECK (code_type IN ('morse', 'semaforo', 'cesar', 'numeros', 'atbash')),
  secret_text text NOT NULL,
  attempts text[] NOT NULL DEFAULT '{}',
  revealed_indices integer[] NOT NULL DEFAULT '{}',
  is_finished boolean NOT NULL DEFAULT false,
  is_won boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mode)
);

CREATE INDEX IF NOT EXISTS idx_vana_codigo_sessions_user ON public.vana_codigo_sessions(user_id);

-- 2. RLS — cada utilizador só vê e altera as suas sessões
ALTER TABLE public.vana_codigo_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vana_codigo_sessions_select" ON public.vana_codigo_sessions;
CREATE POLICY "vana_codigo_sessions_select" ON public.vana_codigo_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "vana_codigo_sessions_insert" ON public.vana_codigo_sessions;
CREATE POLICY "vana_codigo_sessions_insert" ON public.vana_codigo_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "vana_codigo_sessions_update" ON public.vana_codigo_sessions;
CREATE POLICY "vana_codigo_sessions_update" ON public.vana_codigo_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- 3. RPC de recompensas — 1/2/4 XP+Gold por modo, uma vez por dia por modo.
--    O trigger existente em points_log atualiza o perfil automaticamente.
CREATE OR REPLACE FUNCTION public.award_vana_codigo_rewards(p_user_id uuid, p_mode text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_amount integer;
  v_desc text;
  v_mode_label text;
BEGIN
  -- Só o próprio pode reclamar as suas recompensas
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Não autorizado.';
  END IF;

  v_amount := CASE p_mode
    WHEN 'recruta' THEN 1
    WHEN 'explorador' THEN 2
    WHEN 'mestre' THEN 4
    ELSE NULL
  END;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'Modo inválido.';
  END IF;

  v_mode_label := initcap(p_mode);
  v_desc := 'VanaCódigo — Desafio Diário (' || v_mode_label || ')';

  -- A vitória tem de existir na sessão de hoje
  IF NOT EXISTS (
    SELECT 1 FROM public.vana_codigo_sessions
    WHERE user_id = p_user_id
      AND mode = p_mode
      AND is_finished = true
      AND is_won = true
      AND updated_at >= date_trunc('day', now())
  ) THEN
    RETURN jsonb_build_object('awarded', false, 'message', null);
  END IF;

  -- Uma recompensa por modo por dia
  IF EXISTS (
    SELECT 1 FROM public.points_log
    WHERE target_user_id = p_user_id
      AND description = v_desc
      AND created_at >= date_trunc('day', now())
  ) THEN
    RETURN jsonb_build_object(
      'awarded', false,
      'message', 'Já recebeste as recompensas deste modo hoje!'
    );
  END IF;

  INSERT INTO public.points_log (target_user_id, awarded_by_user_id, amount_xp, amount_gold, description)
  VALUES (p_user_id, p_user_id, v_amount, v_amount, v_desc);

  RETURN jsonb_build_object(
    'awarded', true,
    'message', 'Mensagem decifrada! Ganhaste ' || v_amount || ' XP e ' || v_amount || ' Gold 🪙'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_vana_codigo_rewards(uuid, text) TO authenticated;
