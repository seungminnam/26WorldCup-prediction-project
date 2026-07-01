begin;

alter table public.fixtures add column if not exists elapsed_minutes integer;

commit;
