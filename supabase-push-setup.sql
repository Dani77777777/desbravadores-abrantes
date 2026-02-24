-- ============================================
-- 10. WEB PUSH NOTIFICATIONS
-- ============================================

-- Tabela para guardar as subscrições de push dos utilizadores
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- Apenas o próprio utilizador pode ver as suas subscrições
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage own push subscriptions"
ON public.push_subscriptions
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- A Edge Function 'send-push' usa o service_role key, por isso não precisa de política especial para ler.
