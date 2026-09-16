/**
 * MinimalCAD Web
 * io/autosave.ts
 *
 * One reserved "Autosave" slot per signed-in account, stored as an ordinary
 * row in the `drawings` table (see
 * supabase/migrations/0004_drawings_autosave.sql) flagged is_autosave=true.
 * Silently overwritten periodically and on tab-hide by
 * ui/autosaveController.ts; loadAutosave() is what backs the "Restore your
 * last session?" prompt shown once at startup.
 *
 * Deliberately not built on io/cloudDrawings.ts's createDrawing/
 * updateDrawing: this needs its own find-or-create flow scoped to "the one
 * is_autosave row for this owner" rather than operating on a caller-supplied
 * drawing id.
 */

import { getSupabaseClient } from "../lib/supabaseClient";
import { validateDocumentSnapshot } from "./fileFormat";
import type { DocumentSnapshot } from "../core/document";

export type CloudResult<T> = { ok: true; value: T } | { ok: false; error: string };

const AUTOSAVE_NAME = "Autosave";

function describeError(error: { message: string } | null): string {
  return error?.message ?? "Unknown error";
}

// Cached for the tab's session once known, so a 30s-interval autosave isn't
// re-querying "which row is mine" on every tick -- see this module's own
// header comment for why a DB-level upsert isn't used instead. Reset by
// resetAutosaveSession() on sign-out so a different account signing in on
// the same tab can't reuse a stale id.
let cachedRowId: string | null = null;

/** Fetches the signed-in user's autosave slot, if one exists yet -- resolves
 *  `{ ok: true, value: null }` (not an error) when there simply isn't one,
 *  e.g. an account that has never autosaved. RLS's own "select own drawings"
 *  policy (0001_drawings.sql) is what makes this the current user's row and
 *  nothing else. */
export async function loadAutosave(): Promise<CloudResult<{ snapshot: DocumentSnapshot; updatedAt: string } | null>> {
  const { data, error } = await getSupabaseClient()
    .from("drawings")
    .select("id, document, updated_at")
    .eq("is_autosave", true)
    .maybeSingle();

  if (error) return { ok: false, error: describeError(error) };
  if (data === null) return { ok: true, value: null };

  const row = data as { id: string; document: unknown; updated_at: string };
  cachedRowId = row.id;

  const parsed = validateDocumentSnapshot(row.document);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return { ok: true, value: { snapshot: parsed.snapshot, updatedAt: row.updated_at } };
}

/** Overwrites the autosave slot with the current document, creating it on
 *  first use. Best-effort by design: a failed autosave doesn't interrupt or
 *  alert the user mid-work (their real Save/Save to Cloud is unaffected
 *  either way) -- callers generally fire-and-forget this. */
export async function writeAutosave(snapshot: DocumentSnapshot): Promise<CloudResult<void>> {
  const client = getSupabaseClient();

  if (cachedRowId !== null) {
    const { data, error } = await client
      .from("drawings")
      .update({ document: snapshot })
      .eq("id", cachedRowId)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: describeError(error) };
    if (data !== null) return { ok: true, value: undefined };
    // The cached row is gone (deleted elsewhere) -- fall through and recreate it.
    cachedRowId = null;
  }

  const { data, error } = await client
    .from("drawings")
    .insert({ name: AUTOSAVE_NAME, document: snapshot, is_autosave: true })
    .select("id")
    .single();

  if (error) return { ok: false, error: describeError(error) };
  cachedRowId = (data as { id: string }).id;
  return { ok: true, value: undefined };
}

/** Deletes the autosave slot -- called when the user explicitly discards the
 *  restore prompt, so the same stale content isn't offered again next time. */
export async function clearAutosave(): Promise<CloudResult<void>> {
  if (cachedRowId === null) return { ok: true, value: undefined };
  const { error } = await getSupabaseClient().from("drawings").delete().eq("id", cachedRowId);
  if (error) return { ok: false, error: describeError(error) };
  cachedRowId = null;
  return { ok: true, value: undefined };
}

/** Forgets which row is "mine" -- call on sign-out so a different account
 *  signing in on the same tab starts from a clean lookup instead of
 *  inheriting the previous user's (RLS-rejected) row id. */
export function resetAutosaveSession(): void {
  cachedRowId = null;
}
