-- Migration: make event end time optional
-- Events without a defined end (e.g. open-ended activities) are now allowed.
-- The end time becomes nullable; when null, it is simply not shown in the
-- shareable event image.

ALTER TABLE public.events
  ALTER COLUMN end_at DROP NOT NULL;
