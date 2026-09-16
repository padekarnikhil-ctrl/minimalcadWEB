import { describe, expect, it } from "vitest";
import { exportPdf } from "./pdf";
import { Document } from "../core/document";
import { Line } from "../entities/line";
import { Circle } from "../entities/circle";
import { Arc } from "../entities/arc";
import { Ellipse } from "../entities/ellipse";
import { Text } from "../entities/text";

function bytesToLatin1(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

describe("exportPdf", () => {
  it("returns null for an empty document with no explicit window", () => {
    expect(exportPdf(new Document(), null)).toBeNull();
  });

  it("still exports a (blank) page for an empty document when a window is given explicitly", () => {
    const result = exportPdf(new Document(), [0, 0, 100, 100]);
    expect(result).not.toBeNull();
    expect(result!.warning).toBeNull();
  });

  it("produces a well-formed single-page PDF file for a simple drawing", () => {
    const doc = new Document();
    doc.addEntity(new Line({ x: 0, y: 0 }, { x: 100, y: 50 }));
    doc.addEntity(new Circle({ x: 50, y: 50 }, 20));
    doc.addEntity(new Arc({ x: 20, y: 20 }, 10, 0, Math.PI));
    doc.addEntity(new Ellipse({ x: 70, y: 30 }, 15, 8, Math.PI / 6));
    doc.addEntity(new Text({ x: 10, y: 90 }, "Hello", 5, 15));

    const result = exportPdf(doc, null);
    expect(result).not.toBeNull();
    const text = bytesToLatin1(result!.bytes);

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("endobj");
    expect(text).toContain("stream\n");
    expect(text).toContain("endstream");
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("/Type /Page");
    expect(text).toContain("/MediaBox [0 0");
    expect(text).toContain("/BaseFont /Helvetica");
    expect(text).toContain("xref");
    expect(text).toContain("trailer");
    expect(text.trim().endsWith("%%EOF")).toBe(true);

    // Some geometry/text actually made it into the content stream.
    expect(text).toContain(" m\n"); // moveto
    expect(text).toContain("\nS\n"); // stroke
    expect(text).toContain("(Hello) Tj");
  });

  it("every xref offset points at the start of its own numbered object", () => {
    const doc = new Document();
    doc.addEntity(new Line({ x: 0, y: 0 }, { x: 10, y: 10 }));
    const { bytes } = exportPdf(doc, null)!;
    const text = bytesToLatin1(bytes);

    const xrefStart = text.indexOf("\nxref\n") + 1;
    const xrefBody = text.slice(xrefStart, text.indexOf("trailer"));
    // Lines are: "xref", "0 <count>", the free-entry "0000000000 65535 f ",
    // then one real offset line per object -- drop the first three.
    const offsetLines = xrefBody.trim().split("\n").slice(3);

    offsetLines.forEach((line, i) => {
      const offset = Number(line.slice(0, 10));
      const objectNumber = i + 1;
      expect(text.slice(offset, offset + `${objectNumber} 0 obj`.length)).toBe(`${objectNumber} 0 obj`);
    });
  });

  it("warns when a 1:1 export overflows a single A4 page, but still returns bytes", () => {
    const doc = new Document();
    doc.addEntity(new Line({ x: 0, y: 0 }, { x: 5000, y: 5000 }));
    const result = exportPdf(doc, null, "1:1")!;
    expect(result.warning).not.toBeNull();
    expect(result.bytes.length).toBeGreaterThan(0);
  });

  it("fit mode never warns, regardless of drawing size", () => {
    const doc = new Document();
    doc.addEntity(new Line({ x: 0, y: 0 }, { x: 5000, y: 5000 }));
    const result = exportPdf(doc, null, "fit")!;
    expect(result.warning).toBeNull();
  });
});
