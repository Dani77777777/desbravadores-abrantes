-- ============================================================
-- VanaWords — Banco de Palavras dinâmico
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vanawords_word_bank (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  word       text        NOT NULL,
  created_by uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vanawords_word_bank_word_unique UNIQUE (word)
);

ALTER TABLE public.vanawords_word_bank ENABLE ROW LEVEL SECURITY;

-- Qualquer utilizador autenticado pode ler (necessário para gerar grelhas)
CREATE POLICY "vw_word_bank_read" ON public.vanawords_word_bank
  FOR SELECT TO authenticated USING (true);

-- Apenas coordenadores e dirigentes podem gerir as palavras
-- (validado no server action; esta policy é safety net)
CREATE POLICY "vw_word_bank_insert" ON public.vanawords_word_bank
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('coordenador', 'dirigente')
    )
  );

CREATE POLICY "vw_word_bank_delete" ON public.vanawords_word_bank
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('coordenador', 'dirigente')
    )
  );
