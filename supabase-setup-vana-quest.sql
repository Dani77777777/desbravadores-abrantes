-- ============================================
-- VANAQUEST TABLES
-- Run after supabase-setup.sql
-- ============================================

-- Quiz collections (each VanaQuest is a set of questions like a Kahoot deck)
CREATE TABLE IF NOT EXISTS public.vana_quests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Questions for each VanaQuest
CREATE TABLE IF NOT EXISTS public.vana_quest_questions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  vana_quest_id uuid REFERENCES public.vana_quests(id) ON DELETE CASCADE NOT NULL,
  question_text text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL,
  option_d text NOT NULL,
  correct_option text NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
  explanation text,
  time_seconds integer NOT NULL DEFAULT 20,
  points_multiplier integer NOT NULL DEFAULT 1 CHECK (points_multiplier IN (1, 2, 3)),
  question_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Active and past game sessions
CREATE TABLE IF NOT EXISTS public.vana_quest_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  vana_quest_id uuid REFERENCES public.vana_quests(id) ON DELETE CASCADE NOT NULL,
  host_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  pin text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'question_active', 'question_results', 'finished')),
  current_question_index integer NOT NULL DEFAULT -1,
  question_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

-- Session participants (registered users and guests)
CREATE TABLE IF NOT EXISTS public.vana_quest_participants (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES public.vana_quest_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  guest_name text,
  is_guest boolean NOT NULL DEFAULT false,
  display_name text NOT NULL,
  total_points numeric(10,3) NOT NULL DEFAULT 0,
  correct_answers integer NOT NULL DEFAULT 0,
  current_streak integer NOT NULL DEFAULT 0,
  max_streak integer NOT NULL DEFAULT 0,
  rewards_recipient_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now()
);

-- Individual question answers
CREATE TABLE IF NOT EXISTS public.vana_quest_answers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES public.vana_quest_sessions(id) ON DELETE CASCADE NOT NULL,
  participant_id uuid REFERENCES public.vana_quest_participants(id) ON DELETE CASCADE NOT NULL,
  question_id uuid REFERENCES public.vana_quest_questions(id) ON DELETE CASCADE NOT NULL,
  chosen_option text CHECK (chosen_option IN ('A', 'B', 'C', 'D')),
  elapsed_ms integer NOT NULL,
  is_correct boolean NOT NULL,
  speed_points numeric(10,3) NOT NULL DEFAULT 0,
  streak_bonus numeric(10,3) NOT NULL DEFAULT 0,
  final_points numeric(10,3) NOT NULL DEFAULT 0,
  streak_at_answer integer NOT NULL DEFAULT 0,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id, question_id)
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.vana_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vana_quest_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vana_quest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vana_quest_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vana_quest_answers ENABLE ROW LEVEL SECURITY;

-- VanaQuests: public read, admin write
CREATE POLICY "vana_quests_select" ON public.vana_quests FOR SELECT USING (true);
CREATE POLICY "vana_quests_insert" ON public.vana_quests FOR INSERT WITH CHECK (get_my_role() IN ('coordenador', 'dirigente'));
CREATE POLICY "vana_quests_update" ON public.vana_quests FOR UPDATE USING (get_my_role() IN ('coordenador', 'dirigente'));
CREATE POLICY "vana_quests_delete" ON public.vana_quests FOR DELETE USING (get_my_role() IN ('coordenador', 'dirigente'));

-- Questions: public read, admin write
CREATE POLICY "vana_quest_questions_select" ON public.vana_quest_questions FOR SELECT USING (true);
CREATE POLICY "vana_quest_questions_insert" ON public.vana_quest_questions FOR INSERT WITH CHECK (get_my_role() IN ('coordenador', 'dirigente'));
CREATE POLICY "vana_quest_questions_update" ON public.vana_quest_questions FOR UPDATE USING (get_my_role() IN ('coordenador', 'dirigente'));
CREATE POLICY "vana_quest_questions_delete" ON public.vana_quest_questions FOR DELETE USING (get_my_role() IN ('coordenador', 'dirigente'));

-- Sessions: public read, admin write
CREATE POLICY "vana_quest_sessions_select" ON public.vana_quest_sessions FOR SELECT USING (true);
CREATE POLICY "vana_quest_sessions_insert" ON public.vana_quest_sessions FOR INSERT WITH CHECK (get_my_role() IN ('coordenador', 'dirigente'));
CREATE POLICY "vana_quest_sessions_update" ON public.vana_quest_sessions FOR UPDATE USING (get_my_role() IN ('coordenador', 'dirigente'));
CREATE POLICY "vana_quest_sessions_delete" ON public.vana_quest_sessions FOR DELETE USING (get_my_role() IN ('coordenador', 'dirigente'));

-- Participants: public read/insert (guests need anon insert via service role actions)
CREATE POLICY "vana_quest_participants_select" ON public.vana_quest_participants FOR SELECT USING (true);
CREATE POLICY "vana_quest_participants_insert" ON public.vana_quest_participants FOR INSERT WITH CHECK (true);
CREATE POLICY "vana_quest_participants_update" ON public.vana_quest_participants FOR UPDATE USING (true);

-- Answers: public read/insert (all via server actions)
CREATE POLICY "vana_quest_answers_select" ON public.vana_quest_answers FOR SELECT USING (true);
CREATE POLICY "vana_quest_answers_insert" ON public.vana_quest_answers FOR INSERT WITH CHECK (true);

-- ============================================
-- REALTIME PUBLICATIONS
-- ============================================

-- Enable realtime on game tables so clients can subscribe to changes
ALTER PUBLICATION supabase_realtime ADD TABLE public.vana_quest_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vana_quest_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vana_quest_answers;
