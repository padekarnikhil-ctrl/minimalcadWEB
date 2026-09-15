/**
 * MinimalCAD Web
 * engine/engine.ts
 *
 * Owns document/undo/viewport/commandBar and the small set of shared
 * methods every command needs (snap, ortho, pick tolerance, undo/redo,
 * zoom extents) -- the single object commands receive at construction.
 * Deliberately holds no DOM references of its own (redraw requests go
 * through an injected callback) so command state machines can be driven and
 * asserted on directly in tests without any canvas/DOM present.
 *
 * `snap()` resolves real osnaps (engine/snap.ts) within a zoom-aware pick
 * tolerance -- commands don't need to know it was a Phase C no-op stub
 * before Phase E wired the real search in here.
 */

import type { Point } from "../core/types";
import { Document } from "../core/document";
import { Undo } from "../core/undo";
import { Selection } from "../core/selection";
import { Viewport } from "./viewport";
import { findSnap } from "./snap";
import type { CommandBar } from "../ui/commandBar";
import { CommandManager } from "../commands/manager";

export interface SnapResult {
  point: Point;
  snapType: string | null;
}

export class Engine {
  readonly document = new Document();
  readonly undo = new Undo();
  readonly selection = new Selection();
  readonly viewport: Viewport;
  readonly commandBar: CommandBar;
  readonly commandManager: CommandManager;

  orthoEnabled = false;

  /** The last-resolved osnap point/type, updated as a side effect of every
   *  snap() call (mirrors the desktop app's own active_snap_point/
   *  active_snap_type) -- ui/canvasView.ts reads these to draw the yellow
   *  marker glyph. */
  activeSnapPoint: Point | null = null;
  activeSnapType: string | null = null;

  constructor(
    viewport: Viewport,
    commandBar: CommandBar,
    private requestRedrawCallback: () => void,
  ) {
    this.viewport = viewport;
    this.commandBar = commandBar;
    this.commandManager = new CommandManager(this);
  }

  requestRedraw(): void {
    this.requestRedrawCallback();
  }

  pickTolerance(screenPx?: number): number {
    return this.viewport.pickTolerance(screenPx);
  }

  /** Resolves the highest-priority osnap within pickTolerance()'s zoom-aware
   *  radius, or falls through to the raw click point untouched.
   *  `referencePoint` (the previous point picked in the active command, e.g.
   *  a line's start point) enables the direction-dependent Perpendicular/
   *  Tangent osnaps. */
  snap(worldPos: Point, referencePoint: Point | null = null): SnapResult {
    const match = findSnap(worldPos, this.document.getEntities(), this.pickTolerance(10.0), referencePoint);
    this.activeSnapPoint = match?.point ?? null;
    this.activeSnapType = match?.snapType ?? null;
    this.commandBar.setSnap(this.activeSnapType);
    return match ?? { point: worldPos, snapType: null };
  }

  /** Clears the yellow snap marker and the command bar's snap-type label --
   *  call whenever a command ends/cancels so stale feedback doesn't linger. */
  clearSnapFeedback(): void {
    this.activeSnapPoint = null;
    this.activeSnapType = null;
    this.commandBar.setSnap(null);
  }

  /** Axis-constrains `point` onto whichever of horizontal/vertical through
   *  `origin` the raw direction leans closer to. Only meaningful when Ortho
   *  is on and the caller already found no snap for this point. */
  applyOrtho(origin: Point, point: Point): Point {
    if (!this.orthoEnabled) return point;
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    return Math.abs(dx) >= Math.abs(dy) ? { x: point.x, y: origin.y } : { x: origin.x, y: point.y };
  }

  toggleOrtho(): void {
    this.orthoEnabled = !this.orthoEnabled;
    this.commandBar.setOrtho(this.orthoEnabled);
  }

  cancelCommand(): void {
    this.commandManager.cancel();
    this.clearSnapFeedback();
  }

  undoAction(): void {
    if (this.commandManager.currentCommand !== null) return;
    const snapshot = this.undo.undo(this.document.toDict());
    if (snapshot === null) return;
    this.document.restoreFromDict(snapshot);
    this.requestRedraw();
  }

  redoAction(): void {
    if (this.commandManager.currentCommand !== null) return;
    const snapshot = this.undo.redo(this.document.toDict());
    if (snapshot === null) return;
    this.document.restoreFromDict(snapshot);
    this.requestRedraw();
  }

  zoomExtents(): void {
    this.viewport.zoomExtents(this.document.entities.length > 0 ? this.document.getBounds() : null);
    this.requestRedraw();
  }

  deleteSelected(): void {
    const selected = this.selection.getEntities();
    if (selected.length === 0) return;

    this.undo.push(this.document.toDict());
    for (const entity of selected) {
      this.document.removeEntity(entity);
    }
    this.selection.clear();
    this.requestRedraw();
  }
}
