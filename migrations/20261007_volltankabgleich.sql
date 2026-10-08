begin;
alter table public.tankvorgaenge
  add column if not exists lokale_kennung text,
  add column if not exists vollgetankt boolean not null default false,
  add column if not exists zielbestand_liter numeric,
  add column if not exists notizen text not null default '';
alter table public.fahrten
  add column if not exists ist_korrektur boolean not null default false,
  add column if not exists korrektur_tank_kennung text,
  add column if not exists korrektur_liter numeric;
commit;
