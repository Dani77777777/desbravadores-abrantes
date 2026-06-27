-- ============================================
-- VANAQUEST — Estado de decisão dos prémios (convidados) + expulsar jogadores
-- Run after supabase-setup-vana-quest.sql
-- ============================================

-- Marca quando um convidado decide NÃO dar os prémios a ninguém.
-- Um convidado está "decidido" quando: rewards_recipient_id IS NOT NULL OR rewards_skipped = true
ALTER TABLE public.vana_quest_participants
  ADD COLUMN IF NOT EXISTS rewards_skipped boolean NOT NULL DEFAULT false;

-- Para que os eventos realtime de DELETE (expulsar jogador) tragam a linha completa
-- (incluindo session_id), e assim os clientes possam filtrar/reagir correctamente.
ALTER TABLE public.vana_quest_participants REPLICA IDENTITY FULL;

-- Permitir DELETE de participantes a admins (o host expulsa convidados a fazer lixo).
-- As server actions já validam o role + usam service role, mas esta policy mantém a
-- coerência caso se apague directamente.
DROP POLICY IF EXISTS "vana_quest_participants_delete" ON public.vana_quest_participants;
CREATE POLICY "vana_quest_participants_delete" ON public.vana_quest_participants
  FOR DELETE USING (get_my_role() IN ('coordenador', 'dirigente'));
