/**
 * MinimalCAD Web
 * engine/clipboard.ts
 *
 * In-app copy/paste: lets a selection made in one tab (engine/session.ts)
 * be pasted into another. Plain module-level state -- not the browser's
 * real system clipboard, and not persisted across a page reload -- same
 * singleton-module pattern as io/autosave.ts's cachedRowId. This works
 * across tabs with no plumbing through main.ts's tab-session bookkeeping at
 * all: ui/canvasView.ts's keyboard handler always calls these with
 * whichever Engine is currently active (it's repointed on every tab switch
 * -- see CanvasView.setActiveSession()), and the clipboard itself doesn't
 * care which tab wrote or reads it.
 */

import type { Engine } from "./engine";
import { parseEntities, placeBeside, originAlign } from "../core/document";
import { showToast } from "../ui/toast";

let clipboard: Record<string, unknown>[] = [];

function plural(count: number): string {
  return count === 1 ? "entity" : "entities";
}

/** Serializes `engine`'s current selection into the shared clipboard,
 *  overwriting whatever was copied before -- a no-op (with a toast) if
 *  nothing is selected. */
export function copySelection(engine: Engine): void {
  const selected = engine.selection.getEntities();
  if (selected.length === 0) {
    showToast("Nothing selected to copy.");
    return;
  }
  clipboard = selected.map((e) => e.serialize());
  showToast(`Copied ${selected.length} ${plural(selected.length)}.`);
}

/**
 * Pastes the shared clipboard into `engine`'s document -- same
 * placeBeside()/originAlign() placement as Insert Drawing (ui/toolbar.ts)
 * and Insert from Library (commands/insertLib.ts), so pasted content never
 * lands stacked exactly on top of whatever's already in the target tab.
 * A no-op (with a toast) if nothing has been copied yet.
 */
export function pasteClipboard(engine: Engine): void {
  if (clipboard.length === 0) {
    showToast("Nothing to paste -- copy something first.");
    return;
  }

  const { entities: incoming, skippedCount } = parseEntities(clipboard);
  if (incoming.length === 0) return;

  if (engine.document.getEntities().length > 0) {
    placeBeside(engine.document.getBounds(), incoming);
  } else {
    originAlign(incoming);
  }

  engine.undo.push(engine.document.toDict());
  engine.selection.clear();
  for (const entity of incoming) {
    engine.document.addEntity(entity);
    engine.selection.select(entity);
  }
  engine.zoomExtents();
  engine.requestRedraw();

  const skippedNote = skippedCount > 0 ? ` (${skippedCount} unsupported ${plural(skippedCount)} skipped)` : "";
  showToast(`Pasted ${incoming.length} ${plural(incoming.length)}.${skippedNote}`);
}
