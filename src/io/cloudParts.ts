/**
 * MinimalCAD Web
 * io/cloudParts.ts
 *
 * Thin data-access layer over the `parts` table (see
 * supabase/migrations/0003_parts.sql) -- the Parts Library's cloud
 * equivalent of the desktop app's commands/save_library.py/
 * insert_library.py, which store each part as a standalone .jcad file in a
 * filesystem folder. Structurally identical to io/cloudDrawings.ts (same
 * Result-shaped, RLS-scoped, never-throws design) with one difference:
 * `parts` has a per-owner unique name constraint, so create/rename
 * surfaces a friendly "already exists" error instead of the raw Postgres
 * unique-violation message, matching the desktop app's own refusal to
 * silently overwrite an existing part name.
 */

import { getSupabaseClient } from "../lib/supabaseClient";
import { validateDocumentSnapshot } from "./fileFormat";
import type { DocumentSnapshot } from "../core/document";

export interface CloudPartSummary {
  id: string;
  name: string;
}

export interface CloudPart extends CloudPartSummary {
  snapshot: DocumentSnapshot;
}

export type CloudResult<T> = { ok: true; value: T } | { ok: false; error: string };

interface PartRow {
  id: string;
  name: string;
  document: unknown;
}

const UNIQUE_VIOLATION = "23505"; // Postgres SQLSTATE for a unique-constraint conflict

function describeError(error: { code?: string; message: string } | null, name: string): string {
  if (error?.code === UNIQUE_VIOLATION) return `A part named "${name}" already exists`;
  return error?.message ?? "Unknown error";
}

/** Lists the signed-in user's saved parts, alphabetically -- RLS's own
 *  "select own parts" policy is what makes this the current user's parts
 *  and nothing else. */
export async function listParts(): Promise<CloudResult<CloudPartSummary[]>> {
  const { data, error } = await getSupabaseClient().from("parts").select("id, name").order("name");

  if (error) return { ok: false, error: describeError(error, "") };
  const rows = (data ?? []) as Pick<PartRow, "id" | "name">[];
  return { ok: true, value: rows.map((r) => ({ id: r.id, name: r.name })) };
}

/** Fetches one part's full document -- validated the same way a local
 *  .jcad file's contents are (see io/cloudDrawings.ts's identical
 *  reasoning for `drawings`). */
export async function fetchPart(id: string): Promise<CloudResult<CloudPart>> {
  const { data, error } = await getSupabaseClient().from("parts").select("id, name, document").eq("id", id).single();

  if (error) return { ok: false, error: describeError(error, "") };
  const row = data as PartRow;

  const parsed = validateDocumentSnapshot(row.document);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  return { ok: true, value: { id: row.id, name: row.name, snapshot: parsed.snapshot } };
}

/** Creates a new named part -- refuses (rather than silently overwriting)
 *  if `name` is already taken by this user's own library, matching the
 *  desktop app's commands/save_library.py. */
export async function createPart(name: string, snapshot: DocumentSnapshot): Promise<CloudResult<CloudPartSummary>> {
  const { data, error } = await getSupabaseClient()
    .from("parts")
    .insert({ name, document: snapshot })
    .select("id, name")
    .single();

  if (error) return { ok: false, error: describeError(error, name) };
  const row = data as Pick<PartRow, "id" | "name">;
  return { ok: true, value: { id: row.id, name: row.name } };
}

export async function renamePart(id: string, name: string): Promise<CloudResult<void>> {
  const { error } = await getSupabaseClient().from("parts").update({ name }).eq("id", id);
  if (error) return { ok: false, error: describeError(error, name) };
  return { ok: true, value: undefined };
}

export async function deletePart(id: string): Promise<CloudResult<void>> {
  const { error } = await getSupabaseClient().from("parts").delete().eq("id", id);
  if (error) return { ok: false, error: describeError(error, "") };
  return { ok: true, value: undefined };
}
