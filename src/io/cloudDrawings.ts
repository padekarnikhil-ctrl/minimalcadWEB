/**
 * MinimalCAD Web
 * io/cloudDrawings.ts
 *
 * Thin data-access layer over the `drawings` table (see
 * supabase/migrations/0001_drawings.sql) -- create/list/fetch/rename/delete
 * a cloud drawing, and save the current Document to one. Every call is
 * scoped to the signed-in user purely by Row Level Security (see the
 * migration's policies): this layer never filters by user id itself, it
 * relies entirely on Postgres rejecting/hiding rows that aren't the
 * caller's, matching "never trust the client" -- the same reason
 * `owner_id` isn't set explicitly on insert either (the column's own
 * `default auth.uid()` handles it server-side).
 *
 * Returns a Result-shaped value (never throws) so UI code can show a toast
 * on failure the same way io/saveLoad.ts's local Open already does for a
 * malformed file, rather than needing a try/catch at every call site.
 */

import { getSupabaseClient } from "../lib/supabaseClient";
import { validateDocumentSnapshot } from "./fileFormat";
import type { DocumentSnapshot } from "../core/document";

export interface CloudDrawingSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface CloudDrawing extends CloudDrawingSummary {
  snapshot: DocumentSnapshot;
}

export type CloudResult<T> = { ok: true; value: T } | { ok: false; error: string };

interface DrawingRow {
  id: string;
  name: string;
  document: unknown;
  updated_at: string;
}

function describeError(error: { message: string } | null): string {
  return error?.message ?? "Unknown error";
}

/** Lists the signed-in user's drawings, most recently updated first --
 *  RLS's own "select own drawings" policy is what makes this the current
 *  user's drawings and nothing else. */
export async function listDrawings(): Promise<CloudResult<CloudDrawingSummary[]>> {
  const { data, error } = await getSupabaseClient()
    .from("drawings")
    .select("id, name, updated_at")
    .order("updated_at", { ascending: false });

  if (error) return { ok: false, error: describeError(error) };
  const rows = (data ?? []) as Pick<DrawingRow, "id" | "name" | "updated_at">[];
  return { ok: true, value: rows.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updated_at })) };
}

/** Fetches one drawing's full document -- validated the same way a local
 *  .jcad file's contents are (see fileFormat.ts's validateDocumentSnapshot),
 *  since a jsonb column is opaque storage from Postgres's own perspective
 *  and could in principle hold anything a client wrote to it. */
export async function fetchDrawing(id: string): Promise<CloudResult<CloudDrawing>> {
  const { data, error } = await getSupabaseClient()
    .from("drawings")
    .select("id, name, document, updated_at")
    .eq("id", id)
    .single();

  if (error) return { ok: false, error: describeError(error) };
  const row = data as DrawingRow;

  const parsed = validateDocumentSnapshot(row.document);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  return { ok: true, value: { id: row.id, name: row.name, snapshot: parsed.snapshot, updatedAt: row.updated_at } };
}

/** Creates a new cloud drawing from the current Document, returning its
 *  new id/name/updatedAt -- `owner_id` is left unset so the column's own
 *  `default auth.uid()` fills it in, and `format_version` is left at the
 *  table's default (1), mirroring io/fileFormat.ts's CURRENT_VERSION. */
export async function createDrawing(name: string, snapshot: DocumentSnapshot): Promise<CloudResult<CloudDrawingSummary>> {
  const { data, error } = await getSupabaseClient()
    .from("drawings")
    .insert({ name, document: snapshot })
    .select("id, name, updated_at")
    .single();

  if (error) return { ok: false, error: describeError(error) };
  const row = data as Pick<DrawingRow, "id" | "name" | "updated_at">;
  return { ok: true, value: { id: row.id, name: row.name, updatedAt: row.updated_at } };
}

/** Overwrites an existing drawing's document -- last-write-wins, same
 *  whole-document-replace model as local Open/Save already use (no partial
 *  entity-level diffing either locally or here). */
export async function updateDrawing(id: string, snapshot: DocumentSnapshot): Promise<CloudResult<void>> {
  const { error } = await getSupabaseClient().from("drawings").update({ document: snapshot }).eq("id", id);
  if (error) return { ok: false, error: describeError(error) };
  return { ok: true, value: undefined };
}

export async function renameDrawing(id: string, name: string): Promise<CloudResult<void>> {
  const { error } = await getSupabaseClient().from("drawings").update({ name }).eq("id", id);
  if (error) return { ok: false, error: describeError(error) };
  return { ok: true, value: undefined };
}

export async function deleteDrawing(id: string): Promise<CloudResult<void>> {
  const { error } = await getSupabaseClient().from("drawings").delete().eq("id", id);
  if (error) return { ok: false, error: describeError(error) };
  return { ok: true, value: undefined };
}
