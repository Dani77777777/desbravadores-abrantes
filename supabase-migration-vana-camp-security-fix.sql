-- ============================================
-- VANACAMP: correções de segurança (RLS)
--
-- Fecha as formas de um jogador descobrir papéis ou mexer no jogo falando
-- diretamente com a base de dados (fora das server actions):
--
--   1. Eventos: os sinais de vibração dirigidos (ex.: "acordar os Infiltrados")
--      e os "olhos fechados" levavam os ids de quem tem cada papel e chegavam
--      a todos os jogadores pelo Realtime. Passam a chegar só ao Narrador e,
--      na vibração, a quem ela se destina.
--   2. Jogadores: um Infiltrado vivo (e qualquer jogador já em casa) conseguia
--      ler a coluna `role` de toda a gente. Agora cada um lê a sua linha, o
--      Narrador lê todas e os Infiltrados veem apenas os outros Infiltrados.
--   3. Entrar/sair: só no lobby, e nunca já como Diretor.
--   4. Ações da noite, votos e mensagens: só pelas server actions (service
--      role). Antes, qualquer jogador vivo podia inserir, por exemplo, um voto
--      de Infiltrado sem o ser.
--   5. A vista pública dos jogadores deixa de estar aberta a visitantes sem
--      sessão (o jogo é só para membros).
--
-- Pode correr-se mais de uma vez.
-- ============================================

-- ---------- 1. eventos ----------
DROP POLICY IF EXISTS "vanacamp_events_select" ON public.vanacamp_events;
CREATE POLICY "vanacamp_events_select" ON public.vanacamp_events
  FOR SELECT TO authenticated
  USING (
    public.vanacamp_is_host(session_id)
    OR (
      event_type <> 'eyes_closed'
      AND EXISTS (
        SELECT 1 FROM public.vanacamp_players p
        WHERE p.session_id = vanacamp_events.session_id
          AND p.user_id = auth.uid()
          AND (
            vanacamp_events.event_type <> 'vibrate'
            -- sem lista de destinatários = vibração para todos
            OR jsonb_typeof(vanacamp_events.payload -> 'target_player_ids') IS DISTINCT FROM 'array'
            OR (vanacamp_events.payload -> 'target_player_ids') ? (p.id)::text
          )
      )
    )
  );

-- ---------- 2. jogadores (leitura) ----------
DROP POLICY IF EXISTS "vanacamp_players_select_self_or_host" ON public.vanacamp_players;
CREATE POLICY "vanacamp_players_select_self_or_host" ON public.vanacamp_players
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.vanacamp_is_host(session_id)
    OR (role = 'infiltrator' AND public.vanacamp_is_infiltrator(session_id))
  );

-- ---------- 3. jogadores (entrar / sair) ----------
DROP POLICY IF EXISTS "vanacamp_players_insert_self" ON public.vanacamp_players;
CREATE POLICY "vanacamp_players_insert_self" ON public.vanacamp_players
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role IS NULL
    AND is_mayor = false
    AND is_alive = true
    AND is_bot = false
    AND EXISTS (
      SELECT 1 FROM public.vanacamp_sessions s
      WHERE s.id = vanacamp_players.session_id AND s.status = 'lobby'
    )
  );

DROP POLICY IF EXISTS "vanacamp_players_delete_self_or_host" ON public.vanacamp_players;
CREATE POLICY "vanacamp_players_delete_self_or_host" ON public.vanacamp_players
  FOR DELETE TO authenticated
  USING (
    (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.vanacamp_sessions s
        WHERE s.id = vanacamp_players.session_id AND s.status = 'lobby'
      )
    )
    OR public.vanacamp_is_host(session_id)
    OR public.get_my_role() = 'coordenador'
  );

-- ---------- 4. escritas só pelas server actions ----------
DROP POLICY IF EXISTS "vanacamp_night_actions_insert_own" ON public.vanacamp_night_actions;
DROP POLICY IF EXISTS "vanacamp_votes_insert_own" ON public.vanacamp_votes;
DROP POLICY IF EXISTS "vanacamp_messages_insert_own" ON public.vanacamp_messages;

-- ---------- 5. vista pública só para membros ----------
REVOKE ALL ON public.vanacamp_players_public FROM anon;
