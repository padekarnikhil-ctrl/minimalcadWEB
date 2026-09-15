/**
 * MinimalCAD Web
 * geometry/pickSide.ts
 *
 * Ported from commands/fillet.py's click-disambiguation helpers -- shared
 * (in this port; the Python source duplicates them verbatim in
 * commands/chamfer.py, a known smell called out in the porting research)
 * by both Fillet and Chamfer's Line-Line closed-form corner math.
 */

import type { Point } from "../core/types";
import type { Line } from "../entities/line";

/** Which of `line`'s two ends the click was closer to, direction-wise: unit
 *  vector from `intersection` toward whichever endpoint has the larger dot
 *  product with the click direction. Null if that chosen vector is
 *  degenerate (the corner coincides with an endpoint). */
export function clickDirectionVector(line: Line, intersection: Point, clickPos: Point): Point | null {
  const vStart = { x: line.startPoint.x - intersection.x, y: line.startPoint.y - intersection.y };
  const vEnd = { x: line.endPoint.x - intersection.x, y: line.endPoint.y - intersection.y };
  const vClick = { x: clickPos.x - intersection.x, y: clickPos.y - intersection.y };

  const dotStart = vStart.x * vClick.x + vStart.y * vClick.y;
  const dotEnd = vEnd.x * vClick.x + vEnd.y * vClick.y;
  const chosen = dotStart >= dotEnd ? vStart : vEnd;

  const len = Math.hypot(chosen.x, chosen.y);
  if (len < 1e-9) return null;
  return { x: chosen.x / len, y: chosen.y / len };
}

/** Whichever of `line`'s two actual endpoints has the larger dot product
 *  with `direction` -- the endpoint on the "kept" side, away from the corner. */
export function keptEndpoint(line: Line, direction: Point): Point {
  const dotStart = line.startPoint.x * direction.x + line.startPoint.y * direction.y;
  const dotEnd = line.endPoint.x * direction.x + line.endPoint.y * direction.y;
  return dotStart >= dotEnd ? line.startPoint : line.endPoint;
}

/** Standard infinite-line-vs-infinite-line intersection (no segment
 *  clamping, no gap tolerance -- Fillet/Chamfer's closed-form math operates
 *  on the lines' own infinite extensions). Null if parallel/coincident. */
export function infiniteLineIntersection(l1: Line, l2: Line): Point | null {
  const x1 = l1.startPoint.x, y1 = l1.startPoint.y;
  const x2 = l1.endPoint.x, y2 = l1.endPoint.y;
  const x3 = l2.startPoint.x, y3 = l2.startPoint.y;
  const x4 = l2.endPoint.x, y4 = l2.endPoint.y;

  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-12) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}
