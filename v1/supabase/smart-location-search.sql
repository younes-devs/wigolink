-- Recherche geographique intelligente (Maroc v1).
-- Idempotent: ce fichier peut etre execute plusieurs fois dans Supabase SQL Editor.
create extension if not exists pg_trgm;

create index if not exists wigolink_trips_from_location_idx
  on public.wigolink_trips ((data->>'fromLocationId'))
  where data ? 'fromLocationId';

create index if not exists wigolink_trips_to_location_idx
  on public.wigolink_trips ((data->>'toLocationId'))
  where data ? 'toLocationId';

create index if not exists wigolink_trips_from_trgm_idx
  on public.wigolink_trips using gin ((data->>'from') gin_trgm_ops);

create index if not exists wigolink_trips_to_trgm_idx
  on public.wigolink_trips using gin ((data->>'to') gin_trgm_ops);
