/**
 * MinimalCAD Web
 * entities/style.ts
 *
 * Shared drawing constants/helpers, ported 1:1 from entities/style.py.
 */

import type { Point } from "../core/types";

export const COLOR_NORMAL = "#ffffff";
export const COLOR_SELECTED = "#1e90ff";
export const COLOR_GRIP = "#007fff";
export const GRIP_SIZE = 6.0; // target on-screen pixel size

export type LineType = "solid" | "dashed";

/** The line_type/dxf_layer/dxf_color/id constructor options every entity type shares. */
export interface EntityStyleOptions {
  lineType?: LineType;
  dxfLayer?: string;
  dxfColor?: number | null;
  id?: string;
}

/**
 * Standard 2D rotation about (cx, cy). World space is Y-down, so a
 * *positive* angleRad here reads as CLOCKWISE on screen -- this is
 * intentional (matches the desktop app's own convention), not a bug to fix.
 * Other math (dynamic-input angle parsing, Mirror's arc winding-swap) relies
 * on this exact convention staying consistent everywhere.
 */
export function rotatePoint(pt: Point, cx: number, cy: number, angleRad: number): Point {
  const dx = pt.x - cx;
  const dy = pt.y - cy;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  return {
    x: cx + dx * cosA - dy * sinA,
    y: cy + dx * sinA + dy * cosA,
  };
}

/**
 * Grip square's on-screen pixel size. Trivial in this port (just the
 * constant itself) since every entity draws in pre-transformed screen space
 * already -- unlike the Python source's grip_screen_size(painter), which had
 * to read the painter's active transform matrix and divide GRIP_SIZE by its
 * scale factor to compensate for the world-space transform being active at
 * draw time.
 */
export function gripScreenSize(): number {
  return GRIP_SIZE;
}

/** Draws a screen-space square grip centered on `screenPt`. */
export function drawGrip(ctx: CanvasRenderingContext2D, screenPt: Point): void {
  const size = gripScreenSize();
  ctx.strokeStyle = COLOR_SELECTED;
  ctx.lineWidth = 1;
  ctx.fillStyle = COLOR_GRIP;
  const half = size / 2;
  ctx.fillRect(screenPt.x - half, screenPt.y - half, size, size);
  ctx.strokeRect(screenPt.x - half, screenPt.y - half, size, size);
}
