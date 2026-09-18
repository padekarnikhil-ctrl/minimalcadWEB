/**
 * MinimalCAD Web
 * ui/dynamicInputOverlay.ts
 *
 * Shared canvas-preview helpers for AutoCAD-style "dynamic input" drawing
 * feedback -- the dashed alignment/polar-tracking ray a command's own
 * draw() extends past the live cursor point, in the same direction as the
 * solid ghost segment already being drawn from origin to that point. The
 * floating distance/angle readout itself lives in ui/commandBar.ts
 * (setTooltipPosition()/renderTooltip()); this module only owns the
 * canvas-drawn ray.
 */

import type { Point } from "../core/types";
import type { Viewport } from "../entities/entity";

const RAY_SCREEN_LENGTH = 600; // px, comfortably past any realistic viewport
const AXIS_SCREEN_LENGTH = 50; // px, each side of the origin

/**
 * Draws a short dashed horizontal line through `origin`, in screen space --
 * the visual "0 degrees" reference the live angle readout is measured
 * against (positive = below the axis on screen, since world space is
 * Y-down and angle is plain atan2(dy, dx); see line.ts's mouseMove()).
 */
export function drawAngleReferenceAxis(ctx: CanvasRenderingContext2D, viewport: Viewport, origin: Point): void {
  const p0 = viewport.worldToScreen(origin);
  ctx.save();
  ctx.strokeStyle = "#666666";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(p0.x - AXIS_SCREEN_LENGTH, p0.y);
  ctx.lineTo(p0.x + AXIS_SCREEN_LENGTH, p0.y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws a dashed ray from `currentPoint` continuing in the `origin ->
 * currentPoint` direction, in screen space (so its length reads consistently
 * regardless of zoom). No-op if the two points coincide (no direction to
 * extend along).
 */
export function drawPolarTrackingRay(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  origin: Point,
  currentPoint: Point,
): void {
  const p0 = viewport.worldToScreen(origin);
  const p1 = viewport.worldToScreen(currentPoint);
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;

  const ux = dx / len;
  const uy = dy / len;

  ctx.save();
  ctx.strokeStyle = "#888888";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p1.x + ux * RAY_SCREEN_LENGTH, p1.y + uy * RAY_SCREEN_LENGTH);
  ctx.stroke();
  ctx.restore();
}
