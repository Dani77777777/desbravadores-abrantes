-- Migration: add an optional explanation note to each VanaQuest question.
-- Shown to the presenter on the results screen, explaining why the correct
-- answer is correct (and the others wrong). Nullable — questions without a
-- note simply don't show one.

ALTER TABLE public.vana_quest_questions
  ADD COLUMN IF NOT EXISTS explanation text;
