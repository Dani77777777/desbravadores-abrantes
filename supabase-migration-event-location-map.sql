-- ============================================
-- MIGRAÇÃO: Localização dos eventos no mapa
-- ============================================
-- O texto do local (events.location) continua igual. Agora pode ter também o ponto
-- exato no mapa — escolhido ao criar/editar o evento, procurando o local pelo nome
-- ou tocando no mapa. Os membros veem o mapa no detalhe do evento, com botões para
-- abrir no Google Maps / Waze.
--
-- Corre este ficheiro no SQL Editor do Supabase. É idempotente.
-- ============================================

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location_lat double precision;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location_lng double precision;

-- Os dois ou nenhum, e dentro dos limites do planeta
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_location_coords_check;
ALTER TABLE public.events ADD CONSTRAINT events_location_coords_check CHECK (
  (location_lat IS NULL AND location_lng IS NULL)
  OR (location_lat BETWEEN -90 AND 90 AND location_lng BETWEEN -180 AND 180)
);
