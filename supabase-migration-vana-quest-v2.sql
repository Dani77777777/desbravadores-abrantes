-- Migration: adicionar novos estados intermédios ao VanaQuest
-- Corre depois do supabase-setup-vana-quest.sql

ALTER TABLE public.vana_quest_sessions DROP CONSTRAINT IF EXISTS vana_quest_sessions_status_check;
ALTER TABLE public.vana_quest_sessions ADD CONSTRAINT vana_quest_sessions_status_check
  CHECK (status IN (
    'waiting',
    'question_intro',
    'question_active',
    'question_results',
    'question_leaderboard',
    'finished'
  ));
