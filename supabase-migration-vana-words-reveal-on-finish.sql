-- VanaWords: revelar todas as cores no fim do jogo
--
-- O RPC público escondia a equipa das palavras não reveladas (team = NULL).
-- No estado 'finished' já não há segredo a proteger, por isso passamos a
-- devolver a cor real de TODAS as palavras quando a sessão terminou.
-- NÃO mexemos em is_revealed, para os contadores (X/5) continuarem corretos.

CREATE OR REPLACE FUNCTION public.get_vanawords_public(p_session_id uuid)
RETURNS TABLE (
  id          uuid,
  session_id  uuid,
  word        text,
  team        text,
  grid_pos    int,
  is_revealed boolean,
  revealed_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    w.id,
    w.session_id,
    w.word,
    CASE
      WHEN w.is_revealed
        OR (SELECT s.status FROM public.vanawords_sessions s WHERE s.id = p_session_id) = 'finished'
      THEN w.team
      ELSE NULL
    END AS team,
    w.grid_pos,
    w.is_revealed,
    w.revealed_at
  FROM public.vanawords_words w
  WHERE w.session_id = p_session_id
  ORDER BY w.grid_pos;
$$;

GRANT EXECUTE ON FUNCTION public.get_vanawords_public(uuid) TO authenticated;
