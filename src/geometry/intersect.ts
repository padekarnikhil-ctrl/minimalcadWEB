/**
 * MinimalCAD Web
 * geometry/intersect.ts
 *
 * Ported from commands/trim.py's intersection engine -- specifically the
 * ALREADY-FIXED version (gap-tolerance widened to a zoom-aware pick
 * tolerance rather than pure floating-point-noise epsilons), not the
 * original buggy one. v1 scope: Line, Circle, Arc (no Ellipse, no Polyline
 * self-intersection -- see commands/trim.ts for the Polyline scope note).
 */

import type { Point } from "../core/types";
import { Line } from "../entities/line";
import { Circle } from "../entities/circle";
import { Arc } from "../entities/arc";

type CircleLike = Circle | Arc;

const TWO_PI = 2.0 * Math.PI;

/** Whether `angle` falls within the CCW sweep from `start` to `end` (any real
 *  radian values), with a small epsilon at the boundary so a cutting point
 *  landing exactly on -- or a hair outside, from floating-point noise -- the
 *  span's own endpoint still counts as touching it. */
export function inAngularSpan(angle: number, start: number, end: number, eps = 1e-6): boolean {
  // Python's `%` always yields a non-negative result for a positive divisor;
  // JS's does not (it takes the sign of the dividend) -- both `span` and
  // `rel` need the explicit "+TWO_PI, then %TWO_PI again" normalization to
  // replicate that, or a start>end (wrapping) span computes as negative here.
  const span = (((end - start) % TWO_PI) + TWO_PI) % TWO_PI || TWO_PI;
  const rel = ((angle - start) % TWO_PI + TWO_PI) % TWO_PI;
  return rel <= span + eps || rel >= TWO_PI - eps;
}

function angleOf(pt: Point, center: Point): number {
  return Math.atan2(pt.y - center.y, pt.x - center.x);
}

/** Standard determinant-based infinite-line-vs-infinite-line solve, with a
 *  gap-tolerance-widened epsilon on both segments' own [0,1] parameters (in
 *  world-space distance, converted to each line's own parametric units) so
 *  a real (if visually tiny) gap between two segments the user clearly meant
 *  to meet still registers as a touch -- not just floating-point noise. */
export function lineLineIntersection(l1: Line, l2: Line, gap: number): Point | null {
  const x1 = l1.startPoint.x, y1 = l1.startPoint.y;
  const x2 = l1.endPoint.x, y2 = l1.endPoint.y;
  const x3 = l2.startPoint.x, y3 = l2.startPoint.y;
  const x4 = l2.endPoint.x, y4 = l2.endPoint.y;

  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-12) return null; // parallel (or coincident)

  let t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / d;

  const len1 = Math.hypot(x2 - x1, y2 - y1);
  const len2 = Math.hypot(x4 - x3, y4 - y3);
  const epsT = len1 > 1e-9 ? Math.max(1e-7, gap / len1) : 1e-7;
  const epsU = len2 > 1e-9 ? Math.max(1e-7, gap / len2) : 1e-7;

  if (t >= -epsT && t <= 1 + epsT && u >= -epsU && u <= 1 + epsU) {
    t = Math.max(0, Math.min(1, t));
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  }
  return null;
}

/** Raw quadratic solve: up to two points where segment p1-p2 crosses the
 *  circle (center, radius), NO arc-span filtering -- `gap` widens the
 *  segment's own [0,1] range the same way lineLineIntersection's does. */
export function lineCirclePoints(p1: Point, p2: Point, center: Point, radius: number, gap = 0): Point[] {
  const pts: Point[] = [];
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const a = dx * dx + dy * dy;
  if (a === 0) return pts;

  const b = 2 * (dx * (p1.x - center.x) + dy * (p1.y - center.y));
  const c = (p1.x - center.x) ** 2 + (p1.y - center.y) ** 2 - radius * radius;
  let det = b * b - 4 * a * c;

  // A truly tangent line has det===0 in exact math; floating-point error
  // routinely lands it a hair below zero -- clamp it back to the tangent case.
  if (det < 0 && det > -1e-6 * a * a) det = 0;

  if (det >= 0) {
    const segLen = Math.sqrt(a);
    const epsT = segLen > 1e-9 ? Math.max(1e-9, gap / segLen) : 0;
    const sqrtDet = Math.sqrt(det);
    for (const t0 of [(-b - sqrtDet) / (2 * a), (-b + sqrtDet) / (2 * a)]) {
      if (t0 >= -epsT && t0 <= 1 + epsT) {
        const t = Math.max(0, Math.min(1, t0));
        pts.push({ x: p1.x + t * dx, y: p1.y + t * dy });
      }
    }
  }
  return pts;
}

export function lineCircleIntersections(line: Line, circle: CircleLike, gap: number): Point[] {
  const angularEps = gap / Math.max(circle.radius, 1e-6);
  const pts: Point[] = [];
  for (const pt of lineCirclePoints(line.startPoint, line.endPoint, circle.center, circle.radius, gap)) {
    if (circle instanceof Arc && !inAngularSpan(angleOf(pt, circle.center), circle.startAngle, circle.endAngle, angularEps)) continue;
    pts.push(pt);
  }
  return pts;
}

export function circleCircleIntersections(c1: CircleLike, c2: CircleLike, gap: number): Point[] {
  const pts: Point[] = [];
  const d = Math.hypot(c2.center.x - c1.center.x, c2.center.y - c1.center.y);
  const rSum = c1.radius + c2.radius;
  const rDiff = Math.abs(c1.radius - c2.radius);

  const eps = Math.max(1e-6 * Math.max(rSum, 1.0), gap);
  if (d > rSum + eps || d < rDiff - eps || d < eps) return pts;

  const a = (c1.radius ** 2 - c2.radius ** 2 + d ** 2) / (2 * d);
  const h = Math.sqrt(Math.max(0, c1.radius ** 2 - a ** 2));

  const x0 = c1.center.x + (a * (c2.center.x - c1.center.x)) / d;
  const y0 = c1.center.y + (a * (c2.center.y - c1.center.y)) / d;
  const rx = -(c2.center.y - c1.center.y) * (h / d);
  const ry = (c2.center.x - c1.center.x) * (h / d);

  const candidates: Point[] = [{ x: x0 + rx, y: y0 + ry }];
  if (h > 0) candidates.push({ x: x0 - rx, y: y0 - ry });

  for (const pt of candidates) {
    if (c1 instanceof Arc && !inAngularSpan(angleOf(pt, c1.center), c1.startAngle, c1.endAngle, eps / Math.max(c1.radius, 1e-6))) continue;
    if (c2 instanceof Arc && !inAngularSpan(angleOf(pt, c2.center), c2.startAngle, c2.endAngle, eps / Math.max(c2.radius, 1e-6))) continue;
    pts.push(pt);
  }
  return pts;
}

/** Dispatches by entity type pair (Line/Circle/Arc only -- no Ellipse, no
 *  Polyline self-intersection in v1). `gap` should be the caller's
 *  zoom-aware pick tolerance. */
export function findIntersections(e1: Line | CircleLike, e2: Line | CircleLike, gap: number): Point[] {
  if (e1 instanceof Line && e2 instanceof Line) {
    const pt = lineLineIntersection(e1, e2, gap);
    return pt !== null ? [pt] : [];
  }
  if (e1 instanceof Line && (e2 instanceof Circle || e2 instanceof Arc)) {
    return lineCircleIntersections(e1, e2, gap);
  }
  if ((e1 instanceof Circle || e1 instanceof Arc) && e2 instanceof Line) {
    return lineCircleIntersections(e2, e1, gap);
  }
  if ((e1 instanceof Circle || e1 instanceof Arc) && (e2 instanceof Circle || e2 instanceof Arc)) {
    return circleCircleIntersections(e1, e2, gap);
  }
  return [];
}
