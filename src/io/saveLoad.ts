/**
 * MinimalCAD Web
 * io/saveLoad.ts
 *
 * Browser download-a-file / upload-a-file primitives -- there's no
 * filesystem access without installing anything, so Save is a Blob +
 * <a download> click, and Load is a hidden <input type="file">. Not using
 * the File System Access API's showSaveFilePicker (true overwrite-in-place)
 * since it's Chromium-only; the <a download> approach works everywhere and
 * satisfies "no install, just open it in a browser".
 *
 * File extension is .jcad, matching the desktop app's file_io/jcad.py
 * exactly (plain UTF-8 JSON under a CAD-specific extension, not .json) --
 * this is what makes a drawing saved here openable by the desktop app and
 * vice versa.
 */

import type { Document } from "../core/document";
import { parseDocumentJson, serializeDocument } from "./fileFormat";
import type { ParseJsonResult } from "./fileFormat";
import { exportDxf, importDxf } from "./dxf";
import type { ImportDxfResult } from "./dxf";

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

function downloadBlob(content: string, mimeType: string, filename: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  // Revoke on the next tick -- revoking synchronously can abort the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function saveDocumentToFile(doc: Document, filename = `minimalcad-${timestamp()}.jcad`): void {
  downloadBlob(serializeDocument(doc), "application/json", filename);
}

/** Exports `doc` to a plain-text DXF file (matching the desktop app's
 *  file_io/dxf.py output exactly) -- see io/dxf.ts for the format itself. */
export function exportDxfToFile(doc: Document, filename = `minimalcad-${timestamp()}.dxf`): void {
  downloadBlob(exportDxf(doc), "application/dxf", filename);
}

/** Opens the browser's file picker, reads the chosen file as JSON, and resolves
 *  with the parse result -- or null if the user cancelled the picker. */
export function pickAndReadDocumentFile(): Promise<ParseJsonResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    // .jcad is the desktop app's own extension (plain JSON underneath) --
    // .json accepted too since it's the same content, just in case a file
    // got renamed/exported that way.
    input.accept = ".jcad,.json,application/json";

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file === undefined) {
        resolve(null);
        return;
      }
      file
        .text()
        .then((text) => resolve(parseDocumentJson(text)))
        .catch(() => resolve({ ok: false, error: "Could not read file" }));
    });

    // If the user cancels the native dialog, no 'change' fires -- resolve(null) via
    // a one-shot focus-return heuristic would be unreliable, so this simply leaves
    // the promise pending until a file is chosen; callers show no spinner, so an
    // abandoned picker just quietly does nothing, matching normal file-input UX.
    input.click();
  });
}

/** Opens the browser's file picker, reads the chosen file as raw bytes (not
 *  text -- see io/dxf.ts's readDxfText for why: legacy DXF files aren't
 *  always UTF-8), and resolves with the parsed entities/warnings, or null if
 *  the user cancelled the picker or the file couldn't be parsed at all. */
export function pickAndReadDxfFile(): Promise<ImportDxfResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".dxf";

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file === undefined) {
        resolve(null);
        return;
      }
      file
        .arrayBuffer()
        .then((buffer) => resolve(importDxf(buffer)))
        .catch(() => resolve(null));
    });

    input.click();
  });
}
