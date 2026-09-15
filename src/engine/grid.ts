/**
 * MinimalCAD Web
 * engine/grid.ts
 *
 * Adaptive 1-2-5 stepped grid spacing targeting ~10 on-screen pixels between
 * lines at any zoom level (matches graphics/canvas.py's
 * _adaptive_grid_size/_draw_infinite_grid in the Python source), plus the
 * actual line-position computation the renderer draws.
 */

import type { Bounds } from "../core/types";
import type { Viewport } from "./viewport";

const TARGET_SCREEN_PX = 10.0;
const STEP_MULTIPLIERS = [1.0, 2.0, 5.0, 10.0];

export function adaptiveGridSize(zoom: number): number {
  const raw = TARGET_SCREEN_PX / Math.max(zoom, 1e-6);
  const power = Math.floor(Math.log10(raw));
  const base = 10 ** power;
  for (const mult of STEP_MULTIPLIERS) {
    const step = base * mult;
    if (step >= raw) return step;
  }
  return base * 10.0;
}

export interface GridLines {
  gridSize: number;
  /** World-space X positions of vertical lines, and whether each is the Y axis (x===0). */
  verticals: { x: number; isAxis: boolean }[];
  /** World-space Y positions of horizontal lines, and whether each is the X axis (y===0). */
  horizontals: { y: number; isAxis: boolean }[];
}

const AXIS_EPSILON = 0.001;

export function computeGridLines(viewport: Viewport): GridLines {
  const [minX, minY, maxX, maxY]: Bounds = viewport.visibleWorldRect();
  const gridSize = adaptiveGridSize(viewport.zoom);

  const startX = Math.floor(minX / gridSize) * gridSize;
  const endX = Math.ceil(maxX / gridSize) * gridSize;
  const startY = Math.floor(minY / gridSize) * gridSize;
  const endY = Math.ceil(maxY / gridSize) * gridSize;

  const verticals: { x: number; isAxis: boolean }[] = [];
  for (let x = startX; x <= endX; x += gridSize) {
    verticals.push({ x, isAxis: Math.abs(x) < AXIS_EPSILON });
  }

  const horizontals: { y: number; isAxis: boolean }[] = [];
  for (let y = startY; y <= endY; y += gridSize) {
    horizontals.push({ y, isAxis: Math.abs(y) < AXIS_EPSILON });
  }

  return { gridSize, verticals, horizontals };
}
