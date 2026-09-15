-- MinimalCAD Web
-- supabase/migrations/0003_parts.sql
--
-- Cloud storage for the Parts Library, mirroring supabase/migrations/
-- 0001_drawings.sql's `drawings` table exactly (same document jsonb shape,
-- same RLS/grant pattern) -- the one difference is a per-owner unique name,
-- matching the desktop app's commands/save_library.py refusing to
-- overwrite an existing part name rather than silently replacing it.
--
-- Desktop parity note: commands/insert_library.py/save_library.py store
-- each part as a standalone .jcad file in a filesystem folder (no
-- database, no ownership concept -- a single desktop install's library is
-- global to whoever uses that machine). This app has no filesystem and
-- multiple accounts, so parts are owned per-user cloud rows instead,
-- reusing the same Document JSON shape a part file would have held.

create table public.parts (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null,
  document       jsonb not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, name)
);

create index parts_owner_name_idx on public.parts (owner_id, name);

alter table public.parts enable row level security;

create policy "select own parts" on public.parts
  for select
  using (owner_id = auth.uid());

create policy "insert own parts" on public.parts
  for insert
  with check (owner_id = auth.uid());

create policy "update own parts" on public.parts
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "delete own parts" on public.parts
  for delete
  using (owner_id = auth.uid());

-- Same table-level grant requirement 0002_drawings_grants.sql already
-- documented for `drawings` -- RLS alone doesn't let `authenticated` touch
-- this table at all without it.
grant select, insert, update, delete on public.parts to authenticated;

-- Reuses the same trigger function 0001_drawings.sql already defined.
create trigger parts_set_updated_at
before update on public.parts
for each row
execute function public.set_updated_at();
