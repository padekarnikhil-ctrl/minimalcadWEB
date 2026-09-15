/**
 * MinimalCAD Web
 * io/dxfDegrade.ts
 *
 * Ported from file_io/dxf_degrade.py. Graceful-degradation helpers for
 * io/dxf.ts's importer: converting DXF constructs this app has no direct
 * model for (true color, named linetype patterns, MTEXT, SPLINE) into the
 * closest representation it *does* support, instead of silently dropping
 * them. Geometry and engineering intent are preserved whenever possible; the
 * caller (io/dxf.ts) is responsible for surfacing a warning wherever a
 * resolver here signals that something couldn't be fully retained.
 */

import type { Point } from "../core/types";

// ---------------------------------------------------------------------------
// Color: true-color (group 420, 24-bit RGB) -> nearest ACI palette entry.
//
// This app's own dxfColor field is intentionally ACI-only (a plain number,
// same as group 62) -- adding a full RGB color system would be exactly the
// kind of AutoCAD-style complexity this app avoids, and dxfColor is pure
// round-trip passthrough metadata anyway (never used for rendering). So a
// true-color value is approximated to whichever palette entry is closest,
// rather than dropped.
// ---------------------------------------------------------------------------

/** A representative subset of the 256-entry AutoCAD Color Index (ACI)
 *  palette -- the ~24 colors that cover the vast majority of real-world DXF
 *  usage (the 9 standard/basic colors plus a hue ramp) -- not the full
 *  256-entry table, which is mostly near-duplicate greyscale/pastel shades
 *  rarely used in practice. */
export const ACI_PALETTE: Record<number, [number, number, number]> = {
  1: [255, 0, 0], 2: [255, 255, 0], 3: [0, 255, 0], 4: [0, 255, 255],
  5: [0, 0, 255], 6: [255, 0, 255], 7: [255, 255, 255], 8: [65, 65, 65],
  9: [128, 128, 128],
  10: [255, 0, 0], 20: [255, 63, 0], 30: [255, 127, 0], 40: [255, 191, 0],
  50: [255, 255, 0], 60: [191, 255, 0], 70: [127, 255, 0], 80: [63, 255, 0],
  90: [0, 255, 0], 100: [0, 255, 127], 110: [0, 255, 191], 120: [0, 255, 255],
  130: [0, 191, 255], 140: [0, 127, 255], 150: [0, 63, 255], 160: [0, 0, 255],
  170: [63, 0, 255], 180: [127, 0, 255], 190: [191, 0, 255], 200: [255, 0, 255],
  210: [255, 0, 191], 220: [255, 0, 127], 230: [255, 0, 63], 250: [51, 51, 51],
};

/** Decodes a DXF group-420 packed 24-bit true-color integer into [r, g, b]. */
export function parseTrueColor(value: number): [number, number, number] {
  const packed = Math.trunc(value);
  return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff];
}

/** Nearest ACI_PALETTE entry to `rgb` by simple Euclidean distance in RGB space. */
export function nearestAci(rgb: [number, number, number]): number {
  const [r, g, b] = rgb;
  let bestIndex = 7;
  let bestDist: number | null = null;
  for (const [indexStr, [pr, pg, pb]] of Object.entries(ACI_PALETTE)) {
    const dist = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
    if (bestDist === null || dist < bestDist) {
      bestDist = dist;
      bestIndex = Number(indexStr);
    }
  }
  return bestIndex;
}

export interface ResolvedField<T> {
  value: T;
  degraded: boolean;
}

/**
 * Resolves a parsed record's color fields into {value, degraded}. `degraded`
 * is true when a true-color (group 420) value had to be approximated to the
 * nearest ACI palette entry -- the caller aggregates how many entities this
 * affected into one summary warning rather than one line per entity, since
 * it's routine and homogeneous, not a per-entity anomaly. Group 62 (plain
 * ACI, including the symbolic ByLayer=256/ByBlock=0) is used directly and
 * needs no approximation -- this app already just passes ACI integers
 * through as opaque metadata.
 */
export function resolveColor(rec: Record<number, string>): ResolvedField<number | null> {
  if (420 in rec) {
    return { value: nearestAci(parseTrueColor(Number(rec[420]))), degraded: true };
  }
  if (62 in rec) {
    const n = Number(rec[62]);
    return { value: Number.isNaN(n) ? null : n, degraded: false };
  }
  return { value: null, degraded: false };
}

// ---------------------------------------------------------------------------
// Linetype: named pattern (group 6) -> this app's binary solid/dashed model.
// ---------------------------------------------------------------------------

/** Names that map losslessly onto this app's "solid" -- ByLayer/ByBlock can't
 *  actually be resolved without a layer/block table (which this app doesn't
 *  read), but defaulting them to solid matches DXF's own overwhelmingly
 *  common case and isn't a loss of anything this reader could have
 *  recovered anyway. */
const CONTINUOUS_NAMES = new Set(["CONTINUOUS", "BYLAYER", "BYBLOCK"]);

/**
 * Resolves a record's group-6 linetype name into {value, degraded}.
 * `degraded` is true when a named pattern other than Continuous/ByLayer/
 * ByBlock was collapsed into this app's generic "dashed" -- the specific
 * dash-dot-space rhythm (DASHDOT vs CENTER vs HIDDEN, etc.) isn't preserved,
 * only "this line is drawn as some kind of non-solid pattern." Absent
 * group 6 defaults to "solid" with no degradation (DXF's own default
 * meaning "nothing specified," not a loss).
 */
export function resolveLineType(rec: Record<number, string>): ResolvedField<"solid" | "dashed"> {
  const name = rec[6];
  if (name === undefined) return { value: "solid", degraded: false };
  if (CONTINUOUS_NAMES.has(name.trim().toUpperCase())) return { value: "solid", degraded: false };
  return { value: "dashed", degraded: true };
}

// ---------------------------------------------------------------------------
// MTEXT: strip inline formatting codes down to plain, newline-split text.
// ---------------------------------------------------------------------------

// \Xnn; -- height/color/font/width/tracking/etc control codes, or a bare
// grouping brace.
const MTEXT_FORMATTING_CODE = /\\[A-Za-z](?:[^;\\]*;)?|[{}]/g;

/**
 * Strips DXF MTEXT inline formatting codes (\H1.5x; height override, \C1;
 * color, \fArial|...; font, {...} grouping, etc.) down to plain text. \P
 * (paragraph break) and a literal "\n" both become real newlines -- that's a
 * lossless structural conversion, not something worth warning about.
 * %%d/%%c/%%p (degree/diameter/plus-minus symbol codes) are translated to
 * their actual characters, also lossless.
 *
 * Returns {cleaned, hadFormatting} -- hadFormatting is true only if
 * something beyond a bare paragraph break was actually stripped, so the
 * caller can warn specifically about genuine information loss (inline
 * color/font/size runs collapsing to one plain style) rather than every
 * MTEXT indiscriminately.
 */
export function cleanMtext(raw: string): { cleaned: string; hadFormatting: boolean } {
  let text = raw.replaceAll("\\P", "\n").replaceAll("\\n", "\n");
  text = text.replaceAll("%%d", "°").replaceAll("%%c", "∅").replaceAll("%%p", "±");

  MTEXT_FORMATTING_CODE.lastIndex = 0;
  const hadFormatting = MTEXT_FORMATTING_CODE.test(text);
  const cleaned = text.replace(MTEXT_FORMATTING_CODE, "").replaceAll("\\\\", "\\");
  return { cleaned, hadFormatting };
}

// ---------------------------------------------------------------------------
// Spline: Cox-de Boor NURBS evaluation, sampled into a polyline.
//
// A NURBS curve's exact mathematical definition can't be preserved in this
// app's data model (Line/Arc/Circle/Text/Polyline only) -- approximating it
// as a fine polyline is the closest representable equivalent, matching
// "unsupported splines -> polylines." A hand-rolled solver isn't needed
// here: a spline's curve equation is directly evaluable in closed form once
// degree/knots/control points/weights are known, so this samples it
// directly rather than approximating via search.
// ---------------------------------------------------------------------------

/** Cox-de Boor recursion for a single B-spline basis function N_{i,degree}(u). */
function bsplineBasis(i: number, degree: number, u: number, knots: number[]): number {
  if (degree === 0) {
    return knots[i]! <= u && u < knots[i + 1]! ? 1.0 : 0.0;
  }

  let left = 0.0;
  const denomLeft = knots[i + degree]! - knots[i]!;
  if (denomLeft !== 0.0) {
    left = ((u - knots[i]!) / denomLeft) * bsplineBasis(i, degree - 1, u, knots);
  }

  let right = 0.0;
  const denomRight = knots[i + degree + 1]! - knots[i + 1]!;
  if (denomRight !== 0.0) {
    right = ((knots[i + degree + 1]! - u) / denomRight) * bsplineBasis(i + 1, degree - 1, u, knots);
  }

  return left + right;
}

/**
 * Samples a (optionally rational/weighted) B-spline curve into `samples`+1
 * world-space Points via direct Cox-de Boor basis evaluation -- no
 * control-flow-graph library dependency, just the standard closed-form
 * recursion. `weights` may be null (non-rational curve, every control point
 * weighted equally).
 *
 * The very last sample is nudged a hair inside the curve's own end
 * parameter rather than evaluated exactly at it, since the standard
 * half-open basis-function interval definition [knots[i], knots[i+1))
 * otherwise makes every basis function evaluate to zero exactly at the
 * curve's final knot value -- simpler and just as accurate as special-casing
 * the last basis index explicitly.
 */
export function sampleBspline(
  controlPoints: Point[],
  weights: number[] | null,
  degree: number,
  knots: number[],
  samples = 100,
): Point[] {
  const n = controlPoints.length - 1;
  if (n < 1 || knots.length < degree + n + 2) {
    return [...controlPoints]; // degenerate input -- nothing sensible to sample
  }

  const uMin = knots[degree]!;
  const uMax = knots[n + 1]!;
  if (uMax <= uMin) return [...controlPoints];

  const epsilon = (uMax - uMin) * 1e-9;
  const points: Point[] = [];
  for (let s = 0; s <= samples; s++) {
    let u = uMin + ((uMax - uMin) * s) / samples;
    if (s === samples) u = uMax - epsilon;

    let numX = 0.0;
    let numY = 0.0;
    let denom = 0.0;
    for (let i = 0; i <= n; i++) {
      const basis = bsplineBasis(i, degree, u, knots);
      if (basis === 0.0) continue;
      const w = weights ? weights[i]! : 1.0;
      numX += basis * w * controlPoints[i]!.x;
      numY += basis * w * controlPoints[i]!.y;
      denom += basis * w;
    }
    if (denom === 0.0) continue;
    points.push({ x: numX / denom, y: numY / denom });
  }

  return points.length >= 2 ? points : [...controlPoints];
}
