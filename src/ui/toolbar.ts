/**
 * MinimalCAD Web
 * ui/toolbar.ts
 *
 * Icon-only toolbar (ui/toolIcons.ts's procedural glyphs, ported from the
 * desktop app's ui/tool_icons.py), grouped Draw / Modify / Dimension in the
 * same order as the desktop's ui/toolbar.py, followed by non-command
 * utility actions (Undo/Redo/Zoom/Save/Open/DXF). A button's accessible
 * name and hover tooltip carry the text label + shortcut that used to be
 * the button's own visible text.
 */

import { COMMAND_REGISTRY } from "../commands/registry";
import type { Engine } from "../engine/engine";
import {
  saveDocumentToFile,
  pickAndReadDocumentFile,
  exportDxfToFile,
  pickAndReadDxfFile,
  promptFilename,
} from "../io/saveLoad";
import { parseEntities, placeBeside } from "../core/document";
import { showToast } from "./toast";
import { initCloudUi } from "./cloudPanel";
import { drawIcon } from "./toolIcons";

const DISPLAY_NAMES: Record<string, string> = {
  line: "Line",
  circle: "Circle",
  arc: "Arc",
  ellipse: "Ellipse",
  rectangle: "Rectangle",
  move: "Move",
  copy: "Copy",
  rotate: "Rotate",
  polararray: "Polar Array",
  scale: "Scale",
  mirror: "Mirror",
  trim: "Trim",
  offset: "Offset",
  fillet: "Fillet",
  chamfer: "Chamfer",
  join: "Join",
  explode: "Explode",
  text: "Text",
  linear: "Linear Dim",
  aligned: "Aligned Dim",
  angular: "Angular Dim",
  diameter: "Diameter Dim",
  radius: "Radius Dim",
  leader: "Leader",
  insertlib: "Insert from Library",
  savelib: "Save to Library",
  constrain: "Constrain Distance",
  pdfexport: "Export PDF",
};

// Matches the desktop app's ui/toolbar.py section order (Draw / Modify /
// Dimension / File & Library) -- restricted to commands this web port
// actually has; entries the desktop has but this port doesn't yet (table,
// linetype) are simply absent until their features land, not stubbed.
const COMMAND_GROUPS: readonly (readonly string[])[] = [
  ["line", "arc", "rectangle", "circle", "ellipse", "text"],
  [
    "move",
    "copy",
    "rotate",
    "polararray",
    "trim",
    "offset",
    "mirror",
    "fillet",
    "chamfer",
    "join",
    "explode",
    "scale",
    "constrain",
  ],
  ["linear", "aligned", "angular", "diameter", "radius", "leader"],
  ["pdfexport", "insertlib", "savelib"],
];

function displayName(name: string): string {
  return DISPLAY_NAMES[name] ?? name[0]!.toUpperCase() + name.slice(1);
}

/**
 * `getActiveEngine` is called fresh inside every handler below (never
 * captured as one fixed Engine) so every button always acts on whichever
 * tab (engine/session.ts) is currently active -- switching tabs needs no
 * toolbar rebuild of its own, unlike the per-tab tab strip (ui/tabBar.ts).
 */
export function buildToolbar(root: HTMLElement, getActiveEngine: () => Engine, requestRedraw: () => void): void {
  root.innerHTML = "";

  for (const group of COMMAND_GROUPS) {
    for (const name of group) {
      const entry = COMMAND_REGISTRY[name];
      if (entry === undefined || entry.aliases.length === 0) continue;
      const label = displayName(name);
      const btn = createIconButton(name, `${label} (${entry.aliases[0]!.toUpperCase()})`);
      btn.addEventListener("click", () => {
        getActiveEngine().commandManager.startCommand(name);
        requestRedraw();
      });
      root.appendChild(btn);
    }
    root.appendChild(gap());
  }

  addUtilityButton(root, "undo", "Undo", () => getActiveEngine().undoAction());
  addUtilityButton(root, "redo", "Redo", () => getActiveEngine().redoAction());

  root.appendChild(gap());

  addUtilityButton(root, "zoomextents", "Zoom Extents", () => getActiveEngine().zoomExtents());

  root.appendChild(gap());

  addUtilityButton(root, "save", "Save", () => {
    const filename = promptFilename("Save Drawing", "jcad");
    if (filename === null) return;
    saveDocumentToFile(getActiveEngine().document, filename);
  });
  addUtilityButton(root, "open", "Open", () => {
    void pickAndReadDocumentFile().then((result) => {
      if (result === null) return;
      if (!result.ok) {
        showToast(`Could not open file: ${result.error}`);
        return;
      }
      const engine = getActiveEngine();
      const parseResult = engine.document.restoreFromDict(result.snapshot);
      engine.undo.clear();
      engine.zoomExtents();
      engine.clearCloudDrawing();
      if (parseResult.skippedCount > 0) {
        showToast(`${parseResult.skippedCount} unsupported entity type(s) were skipped.`);
      }
    });
  });

  addUtilityButton(root, "insertdrawing", "Insert Drawing (merge a .jcad file into this canvas)", () => {
    void pickAndReadDocumentFile().then((result) => {
      if (result === null) return;
      if (!result.ok) {
        showToast(`Could not import drawing: ${result.error}`);
        return;
      }
      const { entities: incoming, skippedCount } = parseEntities(result.snapshot.entities);
      if (incoming.length === 0) return;

      const engine = getActiveEngine();

      // Unlike Open/Import DXF (which replace the document), this merges
      // into whatever's already on screen -- offset clear of the existing
      // content's bounds so it doesn't land on top of it, matching the
      // desktop app's own Ctrl+A overlay-import (document.py's
      // placeBeside()). Deliberately does NOT call engine.clearCloudDrawing():
      // the current drawing's identity hasn't changed, it just has more in it.
      if (engine.document.getEntities().length > 0) {
        placeBeside(engine.document.getBounds(), incoming);
      }

      engine.undo.push(engine.document.toDict());
      for (const entity of incoming) engine.document.addEntity(entity);
      engine.selection.clear();
      engine.zoomExtents();
      if (skippedCount > 0) {
        showToast(`${skippedCount} unsupported entity type(s) were skipped.`);
      }
    });
  });

  root.appendChild(gap());

  addUtilityButton(root, "exportdxf", "Export DXF", () => {
    const filename = promptFilename("Export DXF", "dxf");
    if (filename === null) return;
    exportDxfToFile(getActiveEngine().document, filename);
  });
  addUtilityButton(root, "importdxf", "Import DXF", () => {
    void pickAndReadDxfFile().then((result) => {
      if (result === null) {
        showToast("Could not open file: not a valid DXF file");
        return;
      }
      const engine = getActiveEngine();
      // Matches Open's full-replace semantics (and the desktop app's own
      // import_dxf(), which repopulates document.entities in place) rather
      // than merging into whatever's currently on screen.
      engine.document.clear();
      for (const entity of result.entities) engine.document.addEntity(entity);
      engine.undo.clear();
      engine.zoomExtents();
      engine.clearCloudDrawing();
      requestRedraw();
      if (result.warnings.length > 0) {
        showToast(result.warnings.join(" — "), 8000);
      }
    });
  });

  initCloudUi(root, getActiveEngine, requestRedraw);
}

/** Builds an icon-only <button> (ui/toolIcons.ts glyph inside, no visible
 *  text) -- `title` doubles as both the hover tooltip and (via aria-label)
 *  the accessible name, matching the desktop toolbar's own icon-only
 *  buttons-with-tooltip convention. */
function createIconButton(iconName: string, title: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "icon-btn";
  btn.title = title;
  btn.setAttribute("aria-label", title);
  const canvas = document.createElement("canvas");
  drawIcon(iconName, canvas);
  btn.appendChild(canvas);
  preventFocusSteal(btn);
  return btn;
}

function addUtilityButton(root: HTMLElement, iconName: string, title: string, onClick: () => void): void {
  const btn = createIconButton(iconName, title);
  btn.addEventListener("click", onClick);
  root.appendChild(btn);
}

/**
 * A <button> reclaims keyboard focus once its click handler finishes
 * (the browser's own "focus the activated control" step runs AFTER click
 * dispatch, overriding anything a handler focused first) -- silently
 * stealing focus back from the command bar's input field that
 * command.start() just focused, so subsequent typing goes nowhere. Calling
 * preventDefault() on the button's own mousedown (not click) suppresses
 * that default focus-grab while leaving the click event itself untouched.
 * Same failure mode ui/canvasView.ts already has to reassert past for
 * canvas clicks -- this is the toolbar's equivalent fix.
 */
function preventFocusSteal(btn: HTMLButtonElement): void {
  btn.addEventListener("mousedown", (e) => e.preventDefault());
}

function gap(): HTMLElement {
  const el = document.createElement("div");
  el.className = "toolbar-gap";
  return el;
}
