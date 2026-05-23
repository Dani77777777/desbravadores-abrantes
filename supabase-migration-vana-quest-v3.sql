-- Migration v3: avatar denormalizado no participante
-- Permite mostrar fotos sem fazer join cada vez (e funciona com realtime)

ALTER TABLE public.vana_quest_participants
  ADD COLUMN IF NOT EXISTS avatar_url text;
