/**
 * MinimalCAD Web
 * ui/toolbar.ts
 *
 * Plain <button>-per-command toolbar, text-glyph icons (no generated icon
 * art -- that's Phase H polish per the plan), one button per registered
 * drawing/edit command plus non-command utility actions (Save/Open/Undo/
 * Redo/Zoom Extents).
 */

import { COMMAND_REGISTRY } from "../commands/registry";
import type { Engine } from "../engine/engine";
import { saveDocumentToFile, pickAndReadDocumentFile } from "../io/saveLoad";
import { showToast } from "./toast";

const DISPLAY_NAMES: Record<string, string> = {
  line: "Line",
  circle: "Circle",
  arc: "Arc",
  rectangle: "Rectangle",
  move: "Move",
  copy: "Copy",
  rotate: "Rotate",
  scale: "Scale",
  mirror: "Mirror",
  trim: "Trim",
  offset: "Offset",
  fillet: "Fillet",
  chamfer: "Chamfer",
  text: "Text",
};

function displayName(name: string): string {
  return DISPLAY_NAMES[name] ?? name[0]!.toUpperCase() + name.slice(1);
}

export function buildToolbar(root: HTMLElement, engine: Engine, requestRedraw: () => void): void {
  root.innerHTML = "";

  for (const [name, entry] of Object.entries(COMMAND_REGISTRY)) {
    // Contextual-only commands (grip drags) have no aliases and aren't
    // directly invocable -- they only ever start via a grip hit-test.
    if (entry.aliases.length === 0) continue;
    const btn = document.createElement("button");
    const label = displayName(name);
    btn.textContent = label;
    btn.title = `${label} (${entry.aliases[0]!.toUpperCase()})`;
    preventFocusSteal(btn);
    btn.addEventListener("click", () => {
      engine.commandManager.startCommand(name);
      requestRedraw();
    });
    root.appendChild(btn);
  }

  root.appendChild(gap());

  addUtilityButton(root, "Undo", () => engine.undoAction());
  addUtilityButton(root, "Redo", () => engine.redoAction());

  root.appendChild(gap());

  addUtilityButton(root, "Zoom Extents", () => engine.zoomExtents());

  root.appendChild(gap());

  addUtilityButton(root, "Save", () => saveDocumentToFile(engine.document));
  addUtilityButton(root, "Open", () => {
    void pickAndReadDocumentFile().then((result) => {
      if (result === null) return;
      if (!result.ok) {
        showToast(`Could not open file: ${result.error}`);
        return;
      }
      const parseResult = engine.document.restoreFromDict(result.snapshot);
      engine.undo.clear();
      engine.zoomExtents();
      if (parseResult.skippedCount > 0) {
        showToast(`${parseResult.skippedCount} unsupported entity type(s) were skipped.`);
      }
    });
  });
}

function addUtilityButton(root: HTMLElement, label: string, onClick: () => void): void {
  const btn = document.createElement("button");
  btn.textContent = label;
  preventFocusSteal(btn);
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
