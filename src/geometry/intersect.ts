/**
 * MinimalCAD Web
 * geometry/intersect.ts
 *
 * Ported from commands/trim.py's intersection engine -- specifically the
 * ALREADY-FIXED version (gap-tolerance widened to a zoom-aware pick
 * tolerance rather than pure floating-point-noise epsilons), not the
 * original buggy one. Line/Circle/Arc pairs use exact closed-form solves;
 * Ellipse was added afterward (see commands/trim.ts for the Polyline
 * self-intersection scope note, which is still deferred). Line-vs-Ellipse
 * still has an exact closed form (solved in the ellipse's own unit-circle
 * frame), but Circle/Arc-vs-Ellipse and Ellipse-vs-Ellipse are true quartics
 * -- rather than hand-deriving those, `ellipseCurveIntersections()` below
 * samples one curve's parametric angle finely and bisects onto the other
 * curve's zero-valued implicit function, matching this file's existing
 * "gap tolerance" pragmatism (exact where cheap, tolerance-bounded
 * numerically where not) over exact-but-fragile quartic algebra.
 */

import type { Point } from "../core/types";
import { Line } from "../entities/line";
import { Circle } from "../entities/circle";
import { Arc } from "../entities/arc";
import { Ellipse } from "../entities/ellipse";

type CircleLike = Circle | Arc;

const TWO_PI = 2.0 * Math.PI;
const ELLIPSE_SAMPLES = 720; // 0.5 degree resolution -- ample for pick-driven trim

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

/** Transforms a world point into `ellipse`'s local unit-circle frame:
 *  translate to its center, undo its rotation, then divide by (radiusX,
 *  radiusY) -- boundary points map exactly onto the unit circle. */
function toEllipseUnitFrame(pt: Point, ellipse: Ellipse): Point {
  const dx = pt.x - ellipse.center.x;
  const dy = pt.y - ellipse.center.y;
  const cosR = Math.cos(-ellipse.rotation);
  const sinR = Math.sin(-ellipse.rotation);
  const lx = dx * cosR - dy * sinR;
  const ly = dx * sinR + dy * cosR;
  return { x: lx / ellipse.radiusX, y: ly / ellipse.radiusY };
}

function fromEllipseUnitFrame(pt: Point, ellipse: Ellipse): Point {
  const lx = pt.x * ellipse.radiusX;
  const ly = pt.y * ellipse.radiusY;
  const cosR = Math.cos(ellipse.rotation);
  const sinR = Math.sin(ellipse.rotation);
  return {
    x: ellipse.center.x + lx * cosR - ly * sinR,
    y: ellipse.center.y + lx * sinR + ly * cosR,
  };
}

/** Exact closed-form line-vs-ellipse solve: transformed into the ellipse's
 *  own unit-circle frame (a non-uniform scale, but a line stays a line
 *  under it), the problem is exactly lineCirclePoints() against the unit
 *  circle. `gap` is applied in that scaled frame, so it's only an
 *  approximate world-space tolerance -- acceptable for trim's pick-driven
 *  near-touch forgiveness, not for anything precision-sensitive. */
export function lineEllipseIntersections(line: Line, ellipse: Ellipse, gap: number): Point[] {
  if (ellipse.radiusX <= 0 || ellipse.radiusY <= 0) return [];
  const q1 = toEllipseUnitFrame(line.startPoint, ellipse);
  const q2 = toEllipseUnitFrame(line.endPoint, ellipse);
  const avgRadius = (ellipse.radiusX + ellipse.radiusY) / 2;
  const scaledGap = gap / Math.max(avgRadius, 1e-6);

  const pts: Point[] = [];
  for (const q of lineCirclePoints(q1, q2, { x: 0, y: 0 }, 1, scaledGap)) {
    if (!ellipse.isFull() && !inAngularSpan(Math.atan2(q.y, q.x), ellipse.startAngle, ellipse.endAngle)) continue;
    pts.push(fromEllipseUnitFrame(q, ellipse));
  }
  return pts;
}

/**
 * Samples `paramA`'s own parametric angle uniformly over `spanA`, looking
 * for sign changes in `implicitB` (0 exactly on curve B, opposite signs
 * inside vs. outside) between consecutive samples, then bisects each
 * bracket down to a point that's exactly on curve A and, within
 * `ELLIPSE_SAMPLES`' resolution, on curve B too. A full circle/ellipse's own
 * `spanA` is `[start, start + 2*PI]` -- since that end angle is the same
 * physical point as the start, the closing bracket falls out of the
 * uniform sampling for free, with no separate "periodic" case needed.
 */
function sampleAndBisect(paramA: (t: number) => Point, spanA: [number, number], implicitB: (pt: Point) => number): Point[] {
  const [t0, t1] = spanA;
  const n = ELLIPSE_SAMPLES;

  const results: Point[] = [];
  let prevT = t0;
  let prevF = implicitB(paramA(t0));
  for (let i = 1; i <= n; i++) {
    const curT = t0 + ((t1 - t0) * i) / n;
    const curF = implicitB(paramA(curT));

    if (prevF === 0) {
      results.push(paramA(prevT));
    } else if ((prevF < 0) !== (curF < 0)) {
      let lo = prevT;
      let hi = curT;
      let flo = prevF;
      for (let iter = 0; iter < 40; iter++) {
        const mid = (lo + hi) / 2;
        const fm = implicitB(paramA(mid));
        if (fm === 0 || hi - lo < 1e-12) {
          lo = mid;
          break;
        }
        if ((fm < 0) === (flo < 0)) {
          lo = mid;
          flo = fm;
        } else {
          hi = mid;
        }
      }
      results.push(paramA((lo + hi) / 2));
    }

    prevT = curT;
    prevF = curF;
  }
  return results;
}

/** Curve-vs-ellipse crossings for a Circle/Arc paired with an Ellipse --
 *  see this file's header comment for why this is numeric rather than a
 *  hand-derived quartic. Samples the circle/arc (simpler parametrization)
 *  and roots the ellipse's implicitValue(); the resulting points are then
 *  filtered against the ellipse's OWN angular span too, since sampling the
 *  circle knows nothing about it. */
export function circleEllipseIntersections(circle: CircleLike, ellipse: Ellipse, gap: number): Point[] {
  if (ellipse.radiusX <= 0 || ellipse.radiusY <= 0 || circle.radius <= 0) return [];
  const isArc = circle instanceof Arc;
  const span: [number, number] = isArc
    ? [circle.startAngle, circle.startAngle + (((circle.endAngle - circle.startAngle) % TWO_PI) + TWO_PI) % TWO_PI || TWO_PI]
    : [0, TWO_PI];

  const paramA = (t: number): Point => ({
    x: circle.center.x + circle.radius * Math.cos(t),
    y: circle.center.y + circle.radius * Math.sin(t),
  });

  const angularEps = gap / Math.max(circle.radius, 1e-6);
  const raw = sampleAndBisect(paramA, span, (pt) => ellipse.implicitValue(pt));

  const pts: Point[] = [];
  for (const pt of raw) {
    if (!ellipse.isFull() && !inAngularSpan(ellipse.paramAngleOf(pt), ellipse.startAngle, ellipse.endAngle, angularEps)) continue;
    pts.push(pt);
  }
  return pts;
}

/** Ellipse-vs-ellipse crossings -- samples e1's own angular span, roots
 *  e2's implicitValue(), then filters against e2's own span too. */
export function ellipseEllipseIntersections(e1: Ellipse, e2: Ellipse, gap: number): Point[] {
  if (e1.radiusX <= 0 || e1.radiusY <= 0 || e2.radiusX <= 0 || e2.radiusY <= 0) return [];
  const sweep1 = (((e1.endAngle - e1.startAngle) % TWO_PI) + TWO_PI) % TWO_PI || TWO_PI;
  const span: [number, number] = e1.isFull() ? [0, TWO_PI] : [e1.startAngle, e1.startAngle + sweep1];

  const avgRadius2 = (e2.radiusX + e2.radiusY) / 2;
  const angularEps = gap / Math.max(avgRadius2, 1e-6);
  const raw = sampleAndBisect((t) => e1.pointAt(t), span, (pt) => e2.implicitValue(pt));

  const pts: Point[] = [];
  for (const pt of raw) {
    if (!e2.isFull() && !inAngularSpan(e2.paramAngleOf(pt), e2.startAngle, e2.endAngle, angularEps)) continue;
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

/** Dispatches by entity type pair (Line/Circle/Arc/Ellipse; no Polyline
 *  self-intersection -- see commands/trim.ts's own scope note). `gap` should
 *  be the caller's zoom-aware pick tolerance. */
export function findIntersections(
  e1: Line | CircleLike | Ellipse,
  e2: Line | CircleLike | Ellipse,
  gap: number,
): Point[] {
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
  if (e1 instanceof Line && e2 instanceof Ellipse) {
    return lineEllipseIntersections(e1, e2, gap);
  }
  if (e1 instanceof Ellipse && e2 instanceof Line) {
    return lineEllipseIntersections(e2, e1, gap);
  }
  if ((e1 instanceof Circle || e1 instanceof Arc) && e2 instanceof Ellipse) {
    return circleEllipseIntersections(e1, e2, gap);
  }
  if (e1 instanceof Ellipse && (e2 instanceof Circle || e2 instanceof Arc)) {
    return circleEllipseIntersections(e2, e1, gap);
  }
  if (e1 instanceof Ellipse && e2 instanceof Ellipse) {
    return ellipseEllipseIntersections(e1, e2, gap);
  }
  return [];
}
