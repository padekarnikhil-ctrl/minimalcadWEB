/**
 * MinimalCAD Web
 * geometry/filletGeometry.ts
 *
 * Ported from commands/fillet.py's Line-Arc/Arc-Arc offset-curve-
 * intersection helpers -- the general technique: the fillet arc's center is
 * equidistant (radius) from both curves, so it's found by offsetting each
 * curve by the radius (a parallel line, or a concentric circle grown/shrunk
 * depending on which side of the original curve the fillet should sit) and
 * intersecting the two offset curves. Tangent points are then the
 * perpendicular/radial foot back onto each ORIGINAL (un-offset) curve.
 */

import type { Point } from "../core/types";
import { Arc } from "../entities/arc";

const TWO_PI = 2.0 * Math.PI;

function normalizeAngle(angle: number): number {
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

/** Unclamped parametric t of pt's projection onto infinite line p0->p1. */
export function lineParam(p0: Point, p1: Point, pt: Point): number {
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  return ((pt.x - p0.x) * dx + (pt.y - p0.y) * dy) / lenSq;
}

export function footOnLine(p0: Point, p1: Point, pt: Point): { point: Point; t: number } {
  const t = lineParam(p0, p1, pt);
  return { point: { x: p0.x + t * (p1.x - p0.x), y: p0.y + t * (p1.y - p0.y) }, t };
}

/** The line p0-p1 offset perpendicular by `r`, toward whichever side `sideHint` is on. */
export function offsetLineToward(
  p0: Point,
  p1: Point,
  r: number,
  sideHint: Point,
): { point: Point; direction: Point } | null {
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  const u = { x: dx / len, y: dy / len };
  const n = { x: -u.y, y: u.x };
  const sign = n.x * (sideHint.x - p0.x) + n.y * (sideHint.y - p0.y) >= 0 ? 1 : -1;
  return { point: { x: p0.x + n.x * r * sign, y: p0.y + n.y * r * sign }, direction: u };
}

/** The arc's radius offset by `r`: grown if `sideHint` is outside the arc,
 *  shrunk if inside -- same "grow outward/shrink inward" convention as Offset. */
export function offsetArcRadius(arc: Arc, r: number, sideHint: Point): number {
  const dist = Math.hypot(sideHint.x - arc.center.x, sideHint.y - arc.center.y);
  return dist >= arc.radius ? arc.radius + r : arc.radius - r;
}

/** Up to two points where the infinite line (p0, direction unit vector)
 *  crosses the circle (center, radius). */
export function lineCircleIntersectPoints(p0: Point, direction: Point, center: Point, radius: number): Point[] {
  const fx = p0.x - center.x, fy = p0.y - center.y;
  const a = direction.x * direction.x + direction.y * direction.y;
  if (a === 0) return [];
  const b = 2 * (fx * direction.x + fy * direction.y);
  const c = fx * fx + fy * fy - radius * radius;
  const det = b * b - 4 * a * c;
  if (det < 0) return [];
  const sqrtDet = Math.sqrt(det);
  return [(-b - sqrtDet) / (2 * a), (-b + sqrtDet) / (2 * a)].map((t) => ({
    x: p0.x + t * direction.x,
    y: p0.y + t * direction.y,
  }));
}

/** Classic two-circle intersection (0, 1, or 2 points). */
export function circleCircleIntersectPoints(c1: Point, r1: number, c2: Point, r2: number): Point[] {
  const d = Math.hypot(c2.x - c1.x, c2.y - c1.y);
  if (d === 0 || d > r1 + r2 || d < Math.abs(r1 - r2)) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSq = r1 * r1 - a * a;
  if (hSq < 0) return [];
  const h = Math.sqrt(hSq);
  const ux = (c2.x - c1.x) / d, uy = (c2.y - c1.y) / d;
  const mx = c1.x + a * ux, my = c1.y + a * uy;
  if (h === 0) return [{ x: mx, y: my }];
  return [
    { x: mx - h * uy, y: my + h * ux },
    { x: mx + h * uy, y: my - h * ux },
  ];
}

export function arcTotalSweep(arc: Arc): number {
  const s = normalizeAngle(arc.endAngle - arc.startAngle);
  return s === 0 ? TWO_PI : s;
}

/** How far around from the arc's own start, in [0, 2*pi). */
export function arcRelOffset(arc: Arc, angle: number): number {
  return normalizeAngle(angle - arc.startAngle);
}

/** Splits `arc` at `tangentAngle` into two candidate sub-arcs and returns
 *  [startAngle, endAngle] of whichever one actually contains `clickPos`. */
export function keptArcSpan(arc: Arc, tangentAngle: number, clickPos: Point): [number, number] {
  const clickAngle = Math.atan2(clickPos.y - arc.center.y, clickPos.x - arc.center.x);
  const clickOffset = arcRelOffset(arc, clickAngle);
  const tangentOffset = arcRelOffset(arc, tangentAngle);
  return clickOffset < tangentOffset ? [arc.startAngle, tangentAngle] : [tangentAngle, arc.endAngle];
}

/** The fillet connector arc between two tangent points on a shared center,
 *  always the minor arc (<=180deg) between them. */
export function filletArcBetween(centerPt: Point, t1: Point, t2: Point, radius: number, lineType?: "solid" | "dashed"): Arc {
  let startAngle = Math.atan2(t1.y - centerPt.y, t1.x - centerPt.x);
  let endAngle = Math.atan2(t2.y - centerPt.y, t2.x - centerPt.x);
  const sweep = normalizeAngle(endAngle - startAngle);
  if (sweep > Math.PI) [startAngle, endAngle] = [endAngle, startAngle];
  return new Arc(centerPt, radius, startAngle, endAngle, { lineType });
}
