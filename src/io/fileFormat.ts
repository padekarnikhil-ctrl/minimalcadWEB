/**
 * MinimalCAD Web
 * io/fileFormat.ts
 *
 * JSON (de)serialization matching the desktop app's .jcad format exactly --
 * ported from file_io/jcad.py's save()/load():
 *   json.dump({**document.to_dict(), "version": CURRENT_VERSION}, f, indent=2)
 * i.e. a FLAT shape (not a nested {"document": {...}} envelope):
 *   { "entities": [...], "constraints": [...], "version": 1 }
 * "version" is written but never read back by either app (forward-looking
 * only, per the Python source) -- this port matches that: always stamp it
 * on save, never branch on it when loading.
 */

import type { Document, DocumentSnapshot } from "../core/document";

/** Matches file_io/jcad.py's CURRENT_VERSION. */
const CURRENT_VERSION = 1;

export function serializeDocument(doc: Document): string {
  const data = { ...doc.toDict(), version: CURRENT_VERSION };
  return JSON.stringify(data, null, 2);
}

export type ParseJsonResult =
  | { ok: true; snapshot: DocumentSnapshot }
  | { ok: false; error: string };

/** Validates and normalizes raw JSON text into a DocumentSnapshot shape,
 *  without touching any live Document -- callers apply it via
 *  Document.restoreFromDict(). Never throws. */
export function parseDocumentJson(text: string): ParseJsonResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Not a MinimalCAD document (expected a JSON object)" };
  }

  const obj = raw as Record<string, unknown>;
  const entities = Array.isArray(obj.entities) ? (obj.entities as Record<string, unknown>[]) : [];
  const constraints = Array.isArray(obj.constraints) ? obj.constraints : [];

  return { ok: true, snapshot: { entities, constraints } };
}
