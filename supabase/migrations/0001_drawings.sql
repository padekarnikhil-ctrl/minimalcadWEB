-- MinimalCAD Web
-- supabase/migrations/0001_drawings.sql
--
-- Cloud storage for drawings: one table, `drawings`, whose `document` column
-- stores exactly the shape core/document.ts's Document.toDict() already
-- produces (`{ entities: [...], constraints: [...] }`) -- the same shape
-- written to a local .jcad file by io/fileFormat.ts's serializeDocument().
-- No other tables: this app has no server-side query need for individual
-- entities, and no user-profile data beyond what auth.users already holds.

-- gen_random_uuid() lives in pgcrypto; Supabase projects normally have it
-- enabled already, but this makes the migration self-contained.
create extension if not exists pgcrypto;

create table public.drawings (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null default 'Untitled',
  -- Matches io/fileFormat.ts's DocumentSnapshot shape exactly (entities +
  -- constraints, no version field inside the blob -- format_version below
  -- is the column analogue of the local file's top-level "version" key).
  document       jsonb not null default '{"entities": [], "constraints": []}'::jsonb,
  format_version integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Fast "list my drawings, most recently edited first" -- the only query
-- pattern the app's "see a list of their drawings" goal needs.
create index drawings_owner_updated_idx on public.drawings (owner_id, updated_at desc);

alter table public.drawings enable row level security;

-- Each policy re-checks owner_id = auth.uid() independently (rather than
-- relying on the insert default alone) so a forged owner_id in a client
-- request is rejected outright, not just defaulted away.
create policy "select own drawings" on public.drawings
  for select
  using (owner_id = auth.uid());

create policy "insert own drawings" on public.drawings
  for insert
  with check (owner_id = auth.uid());

create policy "update own drawings" on public.drawings
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "delete own drawings" on public.drawings
  for delete
  using (owner_id = auth.uid());

-- updated_at is server-maintained, not client-set -- every UPDATE (renames,
-- saves) stamps the true write time regardless of what the client sends.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger drawings_set_updated_at
before update on public.drawings
for each row
execute function public.set_updated_at();
