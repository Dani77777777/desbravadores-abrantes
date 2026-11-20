-- ============================================
-- VanaQuest: TEMAS (normal, natal, ...)
-- Corre no SQL Editor do Supabase. Pode correr-se mais do que uma vez.
--
-- Cada VanaQuest passa a ter um tema, escolhido ao criar/editar.
-- As quests que já existem ficam em 'normal' (valor por omissão).
--
-- A lista dos temas válidos vive no código (components/vana-quest/themes/index.ts),
-- que valida o valor antes de gravar e trata qualquer tema desconhecido como 'normal'.
-- Aqui só se garante o formato do identificador, para que um tema novo
-- (ex.: 'pascoa', 'verao', 'acampamento') não precise de outra migração.
--
-- RLS: as políticas de vana_quests dependem só do cargo (get_my_role()) e não de
-- colunas, e os GRANT ALL da tabela já cobrem colunas novas — nada a mudar.
-- ============================================

ALTER TABLE public.vana_quests
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'normal';

ALTER TABLE public.vana_quests
  DROP CONSTRAINT IF EXISTS vana_quests_theme_check;

ALTER TABLE public.vana_quests
  ADD CONSTRAINT vana_quests_theme_check CHECK (theme ~ '^[a-z0-9-]{1,30}$');

-- Confirmação: quantas quests há por tema
SELECT theme, count(*) AS quests FROM public.vana_quests GROUP BY theme ORDER BY theme;
