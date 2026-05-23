-- Migration v4: adiciona estado 'quest_intro' (intro do quiz antes da 1ª pergunta)

ALTER TABLE public.vana_quest_sessions DROP CONSTRAINT IF EXISTS vana_quest_sessions_status_check;
ALTER TABLE public.vana_quest_sessions ADD CONSTRAINT vana_quest_sessions_status_check
  CHECK (status IN (
    'waiting',
    'quest_intro',
    'question_intro',
    'question_active',
    'question_results',
    'question_leaderboard',
    'finished'
  ));
