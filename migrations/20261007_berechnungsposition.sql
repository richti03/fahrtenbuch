begin;

alter table public.fahrten
  add column if not exists berechnungs_position integer;

alter table public.tankvorgaenge
  add column if not exists berechnungs_position integer;

commit;
