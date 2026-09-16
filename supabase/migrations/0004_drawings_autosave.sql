-- MinimalCAD Web
-- supabase/migrations/0004_drawings_autosave.sql
--
-- One reserved "Autosave" slot per account, living in the same `drawings`
-- table (see 0001_drawings.sql) rather than a separate table -- it's just a
-- drawing row like any other, flagged so the UI can tell it apart from
-- something the user explicitly named and saved. io/autosave.ts is the only
-- code that ever sets is_autosave, and it always writes to at most one row
-- per owner: it looks its own row up by id (cached after the first write in
-- a session) rather than relying on a DB-level upsert, since multi-tab
-- support is deferred (see project memory) and a single tab never races
-- itself. The partial unique index below is a server-side backstop, not the
-- primary mechanism -- it guarantees the invariant holds even if that
-- application-level care is ever bypassed.

alter table public.drawings
  add column is_autosave boolean not null default false;

create unique index drawings_one_autosave_per_owner
  on public.drawings (owner_id)
  where is_autosave;
