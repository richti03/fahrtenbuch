begin;
alter table public.fahrten
  add column if not exists fehlbestand_ausgleichen boolean not null default false;
commit;
