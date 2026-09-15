import { describe, expect, it } from "vitest";
import { parseDocumentJson, serializeDocument } from "./fileFormat";
import { Document } from "../core/document";
import { Line } from "../entities/line";

describe("parseDocumentJson", () => {
  it("returns an error (not a throw) for malformed JSON", () => {
    const result = parseDocumentJson("{not valid json");
    expect(result.ok).toBe(false);
  });

  it("returns an error for valid JSON that isn't a document object", () => {
    expect(parseDocumentJson("[1,2,3]").ok).toBe(false);
    expect(parseDocumentJson('"just a string"').ok).toBe(false);
    expect(parseDocumentJson("null").ok).toBe(false);
  });

  it("defaults missing entities/constraints arrays to empty rather than erroring", () => {
    const result = parseDocumentJson("{}");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.entities).toEqual([]);
      expect(result.snapshot.constraints).toEqual([]);
    }
  });
});

describe("serializeDocument", () => {
  it("produces JSON that parseDocumentJson accepts back", () => {
    const doc = new Document();
    doc.addEntity(new Line({ x: 0, y: 0 }, { x: 1, y: 1 }));
    const json = serializeDocument(doc);
    const result = parseDocumentJson(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.entities).toHaveLength(1);
    }
  });

  it("matches the desktop app's exact .jcad shape: flat {entities, constraints, version}", () => {
    const doc = new Document();
    doc.addEntity(new Line({ x: 0, y: 0 }, { x: 1, y: 1 }));
    const parsed = JSON.parse(serializeDocument(doc));

    // Flat, not a nested {"document": {...}} envelope -- matches
    // file_io/jcad.py's save(): json.dump({**document.to_dict(), "version": 1}, ...)
    expect(Object.keys(parsed)).toEqual(["entities", "constraints", "version"]);
    expect(parsed.version).toBe(1);
  });

  it("is pretty-printed with 2-space indent, matching json.dump(..., indent=2)", () => {
    const doc = new Document();
    const json = serializeDocument(doc);
    expect(json).toContain("\n  \"entities\"");
  });
});
