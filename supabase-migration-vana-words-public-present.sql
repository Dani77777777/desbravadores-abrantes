-- ============================================================
-- VanaWords — projetor (/present) acessível sem login
-- ============================================================
-- A página do projetor foi desenhada como pública (o middleware já a
-- deixa passar sem sessão), mas as políticas RLS eram só TO authenticated,
-- por isso um dispositivo sem login via 404 e não recebia realtime.
--
-- Esta migração dá acesso de LEITURA anónima a:
--   - vanawords_sessions  (estado do jogo, código, marcador)
--   - vanawords_players   (nomes/avatares para mostrar no ecrã grande)
--   - vanawords_guesses   (votos em curso)
--   - RPC get_vanawords_public (palavras SEM as cores por revelar)
--
-- NOTA: isto expõe nomes dos jogadores e estado das sessões a quem tiver
-- o URL/anon key. As cores das palavras continuam protegidas (o RPC só
-- devolve team depois do reveal ou no fim do jogo). Se preferires manter
-- o projetor atrás de login, NÃO corras esta migração.

CREATE POLICY "vw_sessions_read_anon" ON public.vanawords_sessions
  FOR SELECT TO anon USING (true);

CREATE POLICY "vw_players_read_anon" ON public.vanawords_players
  FOR SELECT TO anon USING (true);

CREATE POLICY "vw_guesses_read_anon" ON public.vanawords_guesses
  FOR SELECT TO anon USING (true);

GRANT EXECUTE ON FUNCTION public.get_vanawords_public(uuid) TO anon;
