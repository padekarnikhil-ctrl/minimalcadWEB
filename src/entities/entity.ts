/**
 * MinimalCAD Web
 * entities/entity.ts
 *
 * Shared per-entity interface every concrete entity type implements --
 * mirrors the Python source's entity duck-type (entities/line.py etc.)
 * exactly, with one deliberate deviation: draw()/drawSelected() take a
 * `Viewport` explicitly. Python's QPainter has the world->screen transform
 * already baked into its own transform stack by the time an entity's draw()
 * runs; this port pre-transforms every point to screen space in JS instead
 * (see engine/viewport.ts's doc comment for why), so entities need the
 * viewport passed in to do that conversion themselves.
 */

import type { Bounds, Point } from "../core/types";
import type { Viewport } from "../engine/viewport";

// Re-exported so entity implementation files can `import type { Entity, Viewport } from
// "./entity"` in one line -- Viewport itself is still owned by engine/viewport.ts.
export type { Viewport };

export interface Entity {
  /** Stable identity, or undefined for entity types that don't carry one (e.g. Polyline). */
  readonly id?: string;

  draw(ctx: CanvasRenderingContext2D, viewport: Viewport, preview?: boolean): void;
  drawSelected(ctx: CanvasRenderingContext2D, viewport: Viewport): void;
  move(dx: number, dy: number): void;
  rotate(cx: number, cy: number, angleRad: number): void;
  copy(): Entity;
  getBounds(): Bounds;
  hitTest(pt: Point, tolerance?: number): boolean;
  serialize(): Record<string, unknown>;
}
