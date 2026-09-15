import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Document } from "./document";
import { Line } from "../entities/line";
import { parseDocumentJson } from "../io/fileFormat";

const fixturePath = fileURLToPath(
  new URL("../../test-fixtures/desktop-export-sample.jcad", import.meta.url),
);
const fixtureText = readFileSync(fixturePath, "utf-8");

describe("Document", () => {
  it("addEntity/removeEntity/getBounds round-trip", () => {
    const doc = new Document();
    const a = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    const b = new Line({ x: 0, y: 0 }, { x: 0, y: 5 });
    doc.addEntity(a);
    doc.addEntity(b);
    expect(doc.getBounds()).toEqual([0, 0, 10, 5]);

    doc.removeEntity(a);
    expect(doc.getEntities()).toEqual([b]);
  });

  it("removeEntity purges constraints referencing the removed entity's id", () => {
    const doc = new Document();
    const a = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    doc.addEntity(a);
    doc.constraints = [{ driven_entity_id: a.id, ref_entity_id: "other" }];
    doc.removeEntity(a);
    expect(doc.constraints).toEqual([]);
  });

  it("toDict()/restoreFromDict() round-trips a Document with a real Line", () => {
    const doc = new Document();
    doc.addEntity(new Line({ x: 1, y: 2 }, { x: 3, y: 4 }));
    const snapshot = doc.toDict();

    const doc2 = new Document();
    doc2.restoreFromDict(snapshot);
    expect(doc2.toDict()).toEqual(snapshot);
  });

  describe("loading a real desktop-app-exported file", () => {
    it("parses the JSON shape via parseDocumentJson", () => {
      const result = parseDocumentJson(fixtureText);
      expect(result.ok).toBe(true);
    });

    it("recovers every entity type currently registered, skips the rest", () => {
      const parsed = parseDocumentJson(fixtureText);
      if (!parsed.ok) throw new Error(parsed.error);

      const doc = new Document();
      const parseResult = doc.restoreFromDict(parsed.snapshot);

      // line, circle, arc, polyline, ellipse are all registered
      // (entities/registry.ts) -- nothing in this fixture is unsupported.
      expect(parseResult.entities).toHaveLength(6);
      expect(parseResult.skippedCount).toBe(0);
    });

    it("re-serializes recovered entities field-for-field identical to the source JSON", () => {
      const parsed = parseDocumentJson(fixtureText);
      if (!parsed.ok) throw new Error(parsed.error);

      const doc = new Document();
      doc.restoreFromDict(parsed.snapshot);

      const recognizedTypes = new Set(["line", "circle", "arc", "polyline", "ellipse"]);
      const sourceRecognized = parsed.snapshot.entities.filter((e) =>
        recognizedTypes.has(e.type as string),
      );
      expect(doc.entities).toHaveLength(sourceRecognized.length);

      for (const entity of doc.entities) {
        const source = sourceRecognized.find((s) => s.id === entity.id);
        expect(source).toBeDefined();
        expect(entity.serialize()).toEqual(source);
      }
    });

    it("carries the constraints array through untouched (opaque passthrough)", () => {
      const parsed = parseDocumentJson(fixtureText);
      if (!parsed.ok) throw new Error(parsed.error);

      const doc = new Document();
      doc.restoreFromDict(parsed.snapshot);
      expect(doc.constraints).toEqual(parsed.snapshot.constraints);
      expect(doc.constraints).toHaveLength(1);
    });
  });
});
