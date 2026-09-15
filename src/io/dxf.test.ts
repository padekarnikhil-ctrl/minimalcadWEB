import { describe, expect, it } from "vitest";
import { exportDxf, importDxf } from "./dxf";
import { Document } from "../core/document";
import { Line } from "../entities/line";
import { Circle } from "../entities/circle";
import { Arc } from "../entities/arc";
import { Ellipse } from "../entities/ellipse";
import { Text } from "../entities/text";
import { Polyline } from "../entities/polyline";
import { Dimension } from "../entities/dimension";

function toBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

describe("exportDxf", () => {
  it("writes a well-formed AC1009 header/footer", () => {
    const dxf = exportDxf(new Document());
    expect(dxf).toContain("$ACADVER");
    expect(dxf).toContain("AC1009");
    expect(dxf.trim().endsWith("0\nEOF")).toBe(true);
  });

  it("round-trips a Line through export+import (Y-flip is self-inverse)", () => {
    const doc = new Document();
    doc.addEntity(new Line({ x: 0, y: 0 }, { x: 10, y: 5 }));
    const dxf = exportDxf(doc);
    expect(dxf).toContain("LINE");

    const result = importDxf(toBuffer(dxf));
    expect(result).not.toBeNull();
    expect(result!.entities).toHaveLength(1);
    const line = result!.entities[0] as Line;
    expect(line.startPoint.x).toBeCloseTo(0);
    expect(line.startPoint.y).toBeCloseTo(0);
    expect(line.endPoint.x).toBeCloseTo(10);
    expect(line.endPoint.y).toBeCloseTo(5);
  });

  it("round-trips a Circle and an Arc", () => {
    const doc = new Document();
    doc.addEntity(new Circle({ x: 3, y: 4 }, 7));
    doc.addEntity(new Arc({ x: 0, y: 0 }, 5, 0, Math.PI / 2));
    const dxf = exportDxf(doc);

    const result = importDxf(toBuffer(dxf))!;
    expect(result.entities).toHaveLength(2);
    const circle = result.entities.find((e) => e instanceof Circle) as Circle;
    expect(circle.center.x).toBeCloseTo(3);
    expect(circle.center.y).toBeCloseTo(4);
    expect(circle.radius).toBeCloseTo(7);

    const arc = result.entities.find((e) => e instanceof Arc) as Arc;
    expect(arc.radius).toBeCloseTo(5);
    expect(arc.startAngle).toBeCloseTo(0);
    expect(arc.endAngle).toBeCloseTo(Math.PI / 2);
  });

  it("round-trips Text including rotation", () => {
    const doc = new Document();
    doc.addEntity(new Text({ x: 1, y: 2 }, "Hello", 3.5, 45));
    const dxf = exportDxf(doc);
    expect(dxf).toContain("TEXT");
    expect(dxf).toContain("Hello");

    const result = importDxf(toBuffer(dxf))!;
    const text = result.entities[0] as Text;
    expect(text.text).toBe("Hello");
    expect(text.position.x).toBeCloseTo(1);
    expect(text.position.y).toBeCloseTo(2);
    expect(text.rotation).toBeCloseTo(45);
  });

  it("round-trips an open Polyline with a bulge (arc segment) as a legacy POLYLINE", () => {
    const doc = new Document();
    doc.addEntity(
      new Polyline(
        [
          { point: { x: 0, y: 0 }, bulge: 1.0 },
          { point: { x: 10, y: 0 }, bulge: 0 },
          { point: { x: 10, y: 10 }, bulge: 0 },
        ],
        false,
      ),
    );
    const dxf = exportDxf(doc);
    expect(dxf).toContain("POLYLINE");
    expect(dxf).toContain("VERTEX");

    const result = importDxf(toBuffer(dxf))!;
    expect(result.entities).toHaveLength(1);
    const poly = result.entities[0] as Polyline;
    expect(poly.closed).toBe(false);
    expect(poly.vertices).toHaveLength(3);
    expect(poly.vertices[0]!.bulge).toBeCloseTo(1.0);
  });

  it("merges a closed loop of 4 Lines (a rectangle) into a single closed POLYLINE", () => {
    const doc = new Document();
    doc.addEntity(new Line({ x: 0, y: 0 }, { x: 10, y: 0 }));
    doc.addEntity(new Line({ x: 10, y: 0 }, { x: 10, y: 10 }));
    doc.addEntity(new Line({ x: 10, y: 10 }, { x: 0, y: 10 }));
    doc.addEntity(new Line({ x: 0, y: 10 }, { x: 0, y: 0 }));

    const dxf = exportDxf(doc);
    // Exactly one merged contour, not 4 separate LINE entities.
    expect((dxf.match(/\bLINE\b/g) ?? []).length).toBe(0);
    expect((dxf.match(/\bPOLYLINE\b/g) ?? []).length).toBe(1);
    expect((dxf.match(/\bVERTEX\b/g) ?? []).length).toBe(4);

    const result = importDxf(toBuffer(dxf))!;
    expect(result.entities).toHaveLength(1);
    const poly = result.entities[0] as Polyline;
    expect(poly.closed).toBe(true);
    expect(poly.vertices).toHaveLength(4);
  });

  it("leaves an open (non-closed) chain of Lines as separate LINE entities", () => {
    const doc = new Document();
    doc.addEntity(new Line({ x: 0, y: 0 }, { x: 10, y: 0 }));
    doc.addEntity(new Line({ x: 10, y: 0 }, { x: 10, y: 10 }));

    const dxf = exportDxf(doc);
    expect((dxf.match(/\bLINE\b/g) ?? []).length).toBe(2);
    expect(dxf).not.toContain("POLYLINE");
  });

  it("explodes a Dimension into Line/Text primitives (no native DXF DIMENSION entity)", () => {
    const doc = new Document();
    doc.addEntity(
      new Dimension("linear", {
        p1: { x: 0, y: 0 },
        p2: { x: 50, y: 0 },
        text_position: { x: 25, y: 20 },
      }),
    );
    const dxf = exportDxf(doc);
    expect(dxf).not.toContain("DIMENSION");
    expect(dxf).toContain("LINE");
    expect(dxf).toContain("TEXT");
    expect(dxf).toContain("50.00");
  });

  it("preserves dxf_layer and dxf_color as group 8/62 codes", () => {
    const doc = new Document();
    doc.addEntity(new Line({ x: 0, y: 0 }, { x: 1, y: 1 }, { dxfLayer: "Cutlines", dxfColor: 3 }));
    const dxf = exportDxf(doc);
    expect(dxf).toContain("Cutlines");

    const result = importDxf(toBuffer(dxf))!;
    const line = result.entities[0] as Line;
    expect(line.dxfLayer).toBe("Cutlines");
    expect(line.dxfColor).toBe(3);
  });
});

describe("importDxf", () => {
  it("returns null for an unreadable/empty file", () => {
    expect(importDxf(toBuffer(""))).toBeNull();
  });

  it("imports LWPOLYLINE as a Polyline, including bulge", () => {
    const dxf = [
      "0", "SECTION", "2", "ENTITIES",
      "0", "LWPOLYLINE", "8", "0", "70", "1",
      "10", "0.0", "20", "0.0",
      "10", "10.0", "20", "0.0", "42", "0.5",
      "10", "10.0", "20", "10.0",
      "0", "ENDSEC", "0", "EOF",
    ].join("\n");

    const result = importDxf(toBuffer(dxf))!;
    expect(result.entities).toHaveLength(1);
    const poly = result.entities[0] as Polyline;
    expect(poly.closed).toBe(true);
    expect(poly.vertices).toHaveLength(3);
  });

  it("splits MTEXT into one TEXT entity per line and strips formatting codes", () => {
    const dxf = [
      "0", "SECTION", "2", "ENTITIES",
      "0", "MTEXT", "8", "0", "10", "0.0", "20", "0.0", "40", "3.5",
      "1", "\\fArial|b0;Line one\\PLine two",
      "0", "ENDSEC", "0", "EOF",
    ].join("\n");

    const result = importDxf(toBuffer(dxf))!;
    expect(result.entities).toHaveLength(2);
    expect((result.entities[0] as Text).text).toBe("Line one");
    expect((result.entities[1] as Text).text).toBe("Line two");
    expect(result.warnings.some((w) => w.includes("formatting codes stripped"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("split into 2 separate TEXT"))).toBe(true);
  });

  it("approximates a true-color (group 420) entity to the nearest ACI palette color, with a warning", () => {
    const dxf = [
      "0", "SECTION", "2", "ENTITIES",
      "0", "LINE", "8", "0", "420", String((255 << 16) | 0 | 0),
      "10", "0.0", "20", "0.0", "11", "1.0", "21", "1.0",
      "0", "ENDSEC", "0", "EOF",
    ].join("\n");

    const result = importDxf(toBuffer(dxf))!;
    const line = result.entities[0] as Line;
    expect(line.dxfColor).toBe(1); // pure red -> ACI 1
    expect(result.warnings.some((w) => w.includes("true (24-bit) color"))).toBe(true);
  });

  it("collapses a named linetype other than Continuous into this app's dashed style, with a warning", () => {
    const dxf = [
      "0", "SECTION", "2", "ENTITIES",
      "0", "LINE", "8", "0", "6", "DASHDOT",
      "10", "0.0", "20", "0.0", "11", "1.0", "21", "1.0",
      "0", "ENDSEC", "0", "EOF",
    ].join("\n");

    const result = importDxf(toBuffer(dxf))!;
    const line = result.entities[0] as Line;
    expect(line.lineType).toBe("dashed");
    expect(result.warnings.some((w) => w.includes("named linetype pattern"))).toBe(true);
  });

  it("imports a circular ELLIPSE (ratio ~= 1) as a Circle", () => {
    const dxf = [
      "0", "SECTION", "2", "ENTITIES",
      "0", "ELLIPSE", "8", "0",
      "10", "0.0", "20", "0.0", "11", "5.0", "21", "0.0", "40", "1.0",
      "0", "ENDSEC", "0", "EOF",
    ].join("\n");

    const result = importDxf(toBuffer(dxf))!;
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]).toBeInstanceOf(Circle);
    expect((result.entities[0] as Circle).radius).toBeCloseTo(5);
  });

  it("imports a genuinely elliptical ELLIPSE as a native Ellipse, losslessly", () => {
    const dxf = [
      "0", "SECTION", "2", "ENTITIES",
      "0", "ELLIPSE", "8", "0",
      "10", "0.0", "20", "0.0", "11", "5.0", "21", "0.0", "40", "0.5",
      "0", "ENDSEC", "0", "EOF",
    ].join("\n");

    const result = importDxf(toBuffer(dxf))!;
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]).toBeInstanceOf(Ellipse);
    const ellipse = result.entities[0] as Ellipse;
    expect(ellipse.radiusX).toBeCloseTo(5);
    expect(ellipse.radiusY).toBeCloseTo(2.5);
    expect(result.warnings).toHaveLength(0);
  });

  it("round-trips an elliptical arc Ellipse through export+import (approximated as a sampled POLYLINE, since AC1009 has no true ELLIPSE entity)", () => {
    const doc = new Document();
    doc.addEntity(new Ellipse({ x: 2, y: 3 }, 10, 4, 0, 0, Math.PI));
    const dxf = exportDxf(doc);
    expect(dxf).not.toContain("ELLIPSE");
    expect(dxf).toContain("POLYLINE");

    const result = importDxf(toBuffer(dxf))!;
    expect(result.entities).toHaveLength(1);
    const poly = result.entities[0] as Polyline;
    expect(poly.closed).toBe(false);
    expect(poly.vertices.length).toBeGreaterThan(10);
  });

  it("counts unsupported entity types (e.g. HATCH) into one summary warning instead of skipping silently", () => {
    const dxf = [
      "0", "SECTION", "2", "ENTITIES",
      "0", "HATCH", "8", "0", "70", "1",
      "0", "HATCH", "8", "0", "70", "1",
      "0", "LINE", "8", "0", "10", "0.0", "20", "0.0", "11", "1.0", "21", "1.0",
      "0", "ENDSEC", "0", "EOF",
    ].join("\n");

    const result = importDxf(toBuffer(dxf))!;
    expect(result.entities).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes("2 unsupported HATCH entities skipped"))).toBe(true);
  });

  it("approximates a SPLINE with a usable knot vector as a sampled polyline of Line segments", () => {
    const dxf = [
      "0", "SECTION", "2", "ENTITIES",
      "0", "SPLINE", "8", "0", "70", "0", "71", "3",
      "40", "0", "40", "0", "40", "0", "40", "0",
      "40", "1", "40", "1", "40", "1", "40", "1",
      "10", "0.0", "20", "0.0",
      "10", "5.0", "20", "10.0",
      "10", "10.0", "20", "0.0",
      "10", "15.0", "20", "10.0",
      "0", "ENDSEC", "0", "EOF",
    ].join("\n");

    const result = importDxf(toBuffer(dxf))!;
    expect(result.entities.length).toBeGreaterThan(1);
    expect(result.entities.every((e) => e instanceof Line)).toBe(true);
    expect(result.warnings.some((w) => w.includes("SPLINE") && w.includes("NURBS"))).toBe(true);
  });

  it("tries windows-1252 decoding when the file isn't valid UTF-8", () => {
    // 0xE9 alone is invalid UTF-8, but decodes as "e with acute" (é) under
    // windows-1252/latin-1 -- a stand-in for a legacy AutoCAD TEXT string.
    const header = "0\nSECTION\n2\nENTITIES\n0\nTEXT\n8\n0\n10\n0.0\n20\n0.0\n40\n3.5\n1\n";
    const footer = "\n0\nENDSEC\n0\nEOF\n";
    const headerBytes = new TextEncoder().encode(header);
    const footerBytes = new TextEncoder().encode(footer);
    const buffer = new Uint8Array(headerBytes.length + 1 + footerBytes.length);
    buffer.set(headerBytes, 0);
    buffer.set([0xe9], headerBytes.length);
    buffer.set(footerBytes, headerBytes.length + 1);

    const result = importDxf(buffer.buffer);
    expect(result).not.toBeNull();
    expect(result!.entities).toHaveLength(1);
    expect((result!.entities[0] as Text).text).toBe("é");
  });
});
