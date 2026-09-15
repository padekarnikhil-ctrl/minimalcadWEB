/**
 * MinimalCAD Web
 * geometry/fit.ts
 *
 * Ported from commands/arc.py's module-level geometry helpers. Pure
 * geometry, decoupled from the Arc entity class -- returns a plain fit
 * result; commands/arc.ts wraps it into a real Arc.
 */

import type { Point } from "../core/types";

const TWO_PI = 2.0 * Math.PI;

export interface ArcFit {
  center: Point;
  radius: number;
  startAngle: number;
  endAngle: number;
}

/** Circumcircle through 3 points -- the arc through all three, ordered so the
 *  sweep from startAngle to endAngle actually passes through p3. Returns
 *  null if the points are collinear (no finite circumcircle). */
export function circumcircleThrough3Points(p1: Point, p2: Point, p3: Point): ArcFit | null {
  const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
  if (Math.abs(d) < 1e-9) return null; // collinear

  const aSq = p1.x * p1.x + p1.y * p1.y;
  const bSq = p2.x * p2.x + p2.y * p2.y;
  const cSq = p3.x * p3.x + p3.y * p3.y;

  const ux = (aSq * (p2.y - p3.y) + bSq * (p3.y - p1.y) + cSq * (p1.y - p2.y)) / d;
  const uy = (aSq * (p3.x - p2.x) + bSq * (p1.x - p3.x) + cSq * (p2.x - p1.x)) / d;
  const center: Point = { x: ux, y: uy };

  const radius = Math.hypot(p1.x - ux, p1.y - uy);
  if (radius < 1e-9) return null;

  const angle1 = Math.atan2(p1.y - uy, p1.x - ux);
  const angle2 = Math.atan2(p2.y - uy, p2.x - ux);
  const angle3 = Math.atan2(p3.y - uy, p3.x - ux);

  const sweepToP2 = ((angle2 - angle1) % TWO_PI + TWO_PI) % TWO_PI;
  const sweepToP3 = ((angle3 - angle1) % TWO_PI + TWO_PI) % TWO_PI;

  return sweepToP3 <= sweepToP2
    ? { center, radius, startAngle: angle1, endAngle: angle2 }
    : { center, radius, startAngle: angle2, endAngle: angle1 };
}

/** The minor arc of the given radius through p1 and p2, bulging away from
 *  `sideHint` (the two circle-center candidates lie symmetric about the
 *  chord p1-p2; whichever is on the opposite side from sideHint is chosen,
 *  since a minor arc bulges away from its own center). Returns null if the
 *  radius is too small to span the chord, or the points coincide. */
export function circleOfRadiusThrough2Points(
  p1: Point,
  p2: Point,
  radius: number,
  sideHint: Point,
): ArcFit | null {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-9 || radius < chord / 2) return null;

  const ux = dx / chord;
  const uy = dy / chord;
  const nx = -uy;
  const ny = ux;
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const h = Math.sqrt(Math.max(0, radius * radius - (chord / 2) * (chord / 2)));

  const candidateA: Point = { x: mx + nx * h, y: my + ny * h };
  const candidateB: Point = { x: mx - nx * h, y: my - ny * h };

  const sideOf = (pt: Point) => ux * (pt.y - p1.y) - uy * (pt.x - p1.x);
  const sameSide = sideOf(sideHint) >= 0 === sideOf(candidateA) >= 0;
  const center = sameSide ? candidateB : candidateA;

  const angle1 = Math.atan2(p1.y - center.y, p1.x - center.x);
  const angle2 = Math.atan2(p2.y - center.y, p2.x - center.x);
  const sweep = ((angle2 - angle1) % TWO_PI + TWO_PI) % TWO_PI;

  return sweep <= Math.PI
    ? { center, radius, startAngle: angle1, endAngle: angle2 }
    : { center, radius, startAngle: angle2, endAngle: angle1 };
}
