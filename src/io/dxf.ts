/**
 * MinimalCAD Web
 * io/dxf.ts
 *
 * Ported from file_io/dxf.py: a lightweight pure-text DXF ASCII
 * export/import, restricted to plain R12 (AC1009) -- the bare-bones format
 * that opens cleanly in AutoCAD and every other consumer with no
 * TABLES/BLOCKS section required. Every entity emitted is legal under
 * AC1009: LINE, CIRCLE, ARC, TEXT, and the legacy POLYLINE/VERTEX/SEQEND
 * form (used both for closed Line/Arc loops and for this app's native
 * Polyline entity).
 *
 * Scope note (the one deliberate deviation from the desktop app): this web
 * port's entity model doesn't yet have Table or Ellipse (see
 * entities/registry.ts), so export has nothing to explode besides
 * Dimension, and import degrades ELLIPSE/SPLINE into Polyline/Line rather
 * than a native Ellipse -- a circular ellipse (ratio ~= 1) still imports as
 * this app's existing Circle, same as the desktop app.
 */

import type { Point } from "../core/types";
import type { Document } from "../core/document";
import type { Entity } from "../entities/entity";
import { Line } from "../entities/line";
import { Circle } from "../entities/circle";
import { Arc } from "../entities/arc";
import { Text, DEFAULT_HEIGHT } from "../entities/text";
import { Polyline } from "../entities/polyline";
import type { Vertex } from "../entities/polyline";
import { Dimension } from "../entities/dimension";
import { resolveColor, resolveLineType, cleanMtext, sampleBspline, ACI_PALETTE } from "./dxfDegrade";

function layerColorCodes(layer: string, color: number | null): string[] {
  const codes = ["  8", layer];
  if (color !== null) codes.push(" 62", String(color));
  return codes;
}

// ---------------------------------------------------------------------------
// Y-flip: DXF (and every CAD consumer) expects a Y-up world; this app's
// document space is Y-down (see core/types.ts's own doc comment). Writing
// world Y straight into DXF mirrors the whole drawing vertically: symmetric
// shapes like a plain rectangle look unchanged, but anything with an
// up/down relationship -- e.g. a text label placed below a shape -- comes
// out on the opposite side. Negate Y once here, up front, so every
// downstream computation (closed-loop walking, bulge/angle math) already
// operates on correct Y-up geometry. The flip is a self-inverse (negate Y
// twice cancels; swap+negate an arc's start/end angle twice restores the
// original order), so import reuses it unchanged to convert parsed Y-up
// geometry back into app space.
// ---------------------------------------------------------------------------

function flipYPoint(pt: Point): Point {
  return { x: pt.x, y: -pt.y };
}

function flipY(entities: Entity[]): Entity[] {
  const flipped: Entity[] = [];
  for (const ent of entities) {
    if (ent instanceof Line) {
      flipped.push(
        new Line(flipYPoint(ent.startPoint), flipYPoint(ent.endPoint), {
          lineType: ent.lineType,
          dxfLayer: ent.dxfLayer,
          dxfColor: ent.dxfColor,
        }),
      );
    } else if (ent instanceof Arc) {
      // Mirroring reverses rotational sense, so the sweep must be reversed
      // too (swap+negate start/end) to trace the same physical arc rather
      // than its complementary (wrong) portion of the circle.
      flipped.push(
        new Arc(flipYPoint(ent.center), ent.radius, -ent.endAngle, -ent.startAngle, {
          lineType: ent.lineType,
          dxfLayer: ent.dxfLayer,
          dxfColor: ent.dxfColor,
        }),
      );
    } else if (ent instanceof Circle) {
      flipped.push(
        new Circle(flipYPoint(ent.center), ent.radius, {
          lineType: ent.lineType,
          dxfLayer: ent.dxfLayer,
          dxfColor: ent.dxfColor,
        }),
      );
    } else if (ent instanceof Text) {
      // Mirroring reverses rotational sense, same reasoning as the Arc case above.
      flipped.push(new Text(flipYPoint(ent.position), ent.text, ent.height, -ent.rotation, ent.dxfLayer, ent.dxfColor));
    } else if (ent instanceof Polyline) {
      // Vertex order stays the same (unlike Arc, a Polyline's points have no
      // "start/end" role that swaps under mirroring) -- only each point's Y
      // and each edge's bulge sign flip, the latter for the same "mirroring
      // reverses rotational sense" reason as Arc's own flip above (a bulge
      // is a signed CCW(+)/CW(-) curvature factor for a fixed p1->p2 vertex order).
      flipped.push(
        new Polyline(
          ent.vertices.map((v) => ({ point: flipYPoint(v.point), bulge: -v.bulge })),
          ent.closed,
          { lineType: ent.lineType, dxfLayer: ent.dxfLayer, dxfColor: ent.dxfColor },
        ),
      );
    } else {
      flipped.push(ent);
    }
  }
  return flipped;
}

// ---------------------------------------------------------------------------
// Closed-loop detection: merges connected chains of Line/Arc entities that
// form simple closed loops (every shared vertex touched by exactly two
// segments) into a single legacy POLYLINE contour -- much easier to
// select/offset/cut as one contour in laser-cutting software than a pile of
// disconnected segments. Chains that are open (free ends) or ambiguous (3+
// segments meeting at one point, e.g. a T-junction) are left untouched.
// ---------------------------------------------------------------------------

const POINT_MATCH_TOLERANCE = 1e-4; // world-unit endpoint coincidence tolerance for chain-walking

function endpoints(ent: Line | Arc): [Point, Point] {
  if (ent instanceof Line) return [ent.startPoint, ent.endPoint];
  const p0 = { x: ent.center.x + ent.radius * Math.cos(ent.startAngle), y: ent.center.y + ent.radius * Math.sin(ent.startAngle) };
  const p1 = { x: ent.center.x + ent.radius * Math.cos(ent.endAngle), y: ent.center.y + ent.radius * Math.sin(ent.endAngle) };
  return [p0, p1];
}

/** Snaps a point to a coincidence-tolerance grid for adjacency matching. */
function pointKey(pt: Point): string {
  return `${Math.round(pt.x / POINT_MATCH_TOLERANCE)},${Math.round(pt.y / POINT_MATCH_TOLERANCE)}`;
}

/**
 * Walks a connected component (every vertex already confirmed degree-2)
 * into an ordered vertex list. Returns Vertex[] or null if the component
 * doesn't resolve into one single simple cycle.
 */
function walkCycle(entityIds: Set<number>, endpointsById: Map<number, [Point, Point]>, entities: (Line | Arc)[]): Vertex[] | null {
  const pointEdges = new Map<string, number[]>();
  for (const eidx of entityIds) {
    const [p0, p1] = endpointsById.get(eidx)!;
    for (const key of [pointKey(p0), pointKey(p1)]) {
      const list = pointEdges.get(key) ?? [];
      list.push(eidx);
      pointEdges.set(key, list);
    }
  }

  const startEidx = entityIds.values().next().value as number;
  const startKey = pointKey(endpointsById.get(startEidx)![0]);
  let currentKey = startKey;
  let currentPoint = endpointsById.get(startEidx)![0];
  const remaining = new Set(entityIds);
  const vertices: Vertex[] = [];

  for (let i = 0; i < entityIds.size + 1; i++) {
    const candidates = (pointEdges.get(currentKey) ?? []).filter((e) => remaining.has(e));
    if (candidates.length === 0) break;
    const eidx = candidates[0]!;
    remaining.delete(eidx);
    const ent = entities[eidx]!;
    const [p0, p1] = endpointsById.get(eidx)!;
    const forward = pointKey(p0) === currentKey;
    const nextPoint = forward ? p1 : p0;
    const nextKey = pointKey(nextPoint);

    let bulge = 0.0;
    if (ent instanceof Arc) {
      const twoPi = 2.0 * Math.PI;
      let sweep = ((ent.endAngle - ent.startAngle) % twoPi + twoPi) % twoPi;
      if (sweep === 0.0) sweep = twoPi;
      const b = Math.tan(sweep / 4.0);
      bulge = forward ? b : -b;
    }

    vertices.push({ point: currentPoint, bulge });
    currentKey = nextKey;
    currentPoint = nextPoint;

    if (currentKey === startKey) break;
  }

  if (remaining.size > 0 || currentKey !== startKey || vertices.length < 2) return null;
  return vertices;
}

interface MergedPolyline {
  vertices: Vertex[];
  layer: string;
  color: number | null;
}

/**
 * Detects closed Line/Arc loops and walks each into an ordered vertex+bulge
 * list suitable for a single DXF LWPOLYLINE. Returns {polylines, leftover}
 * -- leftover holds every entity not absorbed into a loop, in original
 * order. A merged contour can only carry one layer/color for the whole
 * loop; the accepted simplification (consistent with this app having no
 * layer manager) is to use whichever entity the walk started from as the
 * representative.
 */
function extractClosedPolylines(entities: (Line | Arc)[]): { polylines: MergedPolyline[]; leftover: (Line | Arc)[] } {
  const endpointsById = new Map<number, [Point, Point]>();
  entities.forEach((e, i) => endpointsById.set(i, endpoints(e)));

  const pointTouches = new Map<string, number[]>();
  endpointsById.forEach(([p0, p1], i) => {
    for (const key of [pointKey(p0), pointKey(p1)]) {
      const list = pointTouches.get(key) ?? [];
      list.push(i);
      pointTouches.set(key, list);
    }
  });
  const degree = new Map<string, number>();
  pointTouches.forEach((list, key) => degree.set(key, list.length));

  const pointComponent = new Map<string, number>();
  let compCounter = 0;
  const polylines: MergedPolyline[] = [];
  const merged = new Set<number>();

  for (const seedKey of pointTouches.keys()) {
    if (pointComponent.has(seedKey)) continue;
    const compId = compCounter++;
    const compPoints = new Set<string>([seedKey]);
    const compEntities = new Set<number>();
    const stack = [seedKey];
    pointComponent.set(seedKey, compId);

    while (stack.length > 0) {
      const k = stack.pop()!;
      for (const eidx of pointTouches.get(k) ?? []) {
        compEntities.add(eidx);
        const [p0, p1] = endpointsById.get(eidx)!;
        for (const other of [pointKey(p0), pointKey(p1)]) {
          if (!pointComponent.has(other)) {
            pointComponent.set(other, compId);
            compPoints.add(other);
            stack.push(other);
          }
        }
      }
    }

    if (compEntities.size > 0 && [...compPoints].every((k) => degree.get(k) === 2)) {
      const loop = walkCycle(compEntities, endpointsById, entities);
      if (loop !== null) {
        const representative = entities[Math.min(...compEntities)]!;
        polylines.push({ vertices: loop, layer: representative.dxfLayer, color: representative.dxfColor });
        for (const e of compEntities) merged.add(e);
      }
    }
  }

  const leftover = entities.filter((_, i) => !merged.has(i));
  return { polylines, leftover };
}

/**
 * Appends a legacy POLYLINE/VERTEX/SEQEND sequence -- the R12-legal way to
 * describe a connected multi-segment contour (LWPOLYLINE is an R13+ entity
 * and is not valid under this file's declared AC1009 header). `vertices`
 * carries bulge 0 meaning a straight segment to the next vertex.
 */
function writePolyline(out: string[], vertices: Vertex[], layer: string, color: number | null, closed: boolean): void {
  out.push("  0", "POLYLINE");
  out.push(...layerColorCodes(layer, color));
  out.push(" 66", "1", " 70", closed ? "1" : "0", " 10", "0.0", " 20", "0.0", " 30", "0.0");
  for (const { point, bulge } of vertices) {
    out.push("  0", "VERTEX");
    out.push(...layerColorCodes(layer, color));
    out.push(" 10", point.x.toFixed(4), " 20", point.y.toFixed(4), " 30", "0.0", " 70", "0");
    if (bulge !== 0.0) out.push(" 42", bulge.toFixed(6));
  }
  out.push("  0", "SEQEND", "  8", layer);
}

/** Generates standard-compliant ASCII DXF vector output without third-party frameworks. */
export function exportDxf(document: Document): string {
  const out: string[] = [];

  out.push(
    "  0", "SECTION", "  2", "HEADER",
    "  9", "$ACADVER", "  1", "AC1009",
    "  0", "ENDSEC",
  );
  out.push("  0", "SECTION", "  2", "ENTITIES");

  // Exploding dimensions into their constituent LINE/ARC/TEXT primitives --
  // a Dimension has no native DXF representation, so this is also its only
  // export path, not a fallback.
  const resolvedEntities: Entity[] = [];
  for (const entity of document.getEntities()) {
    if (entity instanceof Dimension) resolvedEntities.push(...entity.explode());
    else resolvedEntities.push(entity);
  }

  const flipped = flipY(resolvedEntities);

  const lineArcEntities = flipped.filter((e): e is Line | Arc => e instanceof Line || e instanceof Arc);
  const otherEntities = flipped.filter((e) => !(e instanceof Line || e instanceof Arc));
  const { polylines, leftover: leftoverLineArc } = extractClosedPolylines(lineArcEntities);

  for (const { vertices, layer, color } of polylines) {
    writePolyline(out, vertices, layer, color, true);
  }

  for (const ent of [...leftoverLineArc, ...otherEntities]) {
    if (ent instanceof Line) {
      out.push("  0", "LINE");
      out.push(...layerColorCodes(ent.dxfLayer, ent.dxfColor));
      out.push(
        " 10", ent.startPoint.x.toFixed(4), " 20", ent.startPoint.y.toFixed(4), " 30", "0.0",
        " 11", ent.endPoint.x.toFixed(4), " 21", ent.endPoint.y.toFixed(4), " 31", "0.0",
      );
    } else if (ent instanceof Circle) {
      out.push("  0", "CIRCLE");
      out.push(...layerColorCodes(ent.dxfLayer, ent.dxfColor));
      out.push(
        " 10", ent.center.x.toFixed(4), " 20", ent.center.y.toFixed(4), " 30", "0.0",
        " 40", ent.radius.toFixed(4),
      );
    } else if (ent instanceof Arc) {
      // DXF arcs track counter-clockwise sweeps in degrees natively.
      const saDeg = ((ent.startAngle * 180) / Math.PI) % 360.0;
      const eaDeg = ((ent.endAngle * 180) / Math.PI) % 360.0;
      out.push("  0", "ARC");
      out.push(...layerColorCodes(ent.dxfLayer, ent.dxfColor));
      out.push(
        " 10", ent.center.x.toFixed(4), " 20", ent.center.y.toFixed(4), " 30", "0.0",
        " 40", ent.radius.toFixed(4),
        " 50", saDeg.toFixed(4), " 51", eaDeg.toFixed(4),
      );
    } else if (ent instanceof Text) {
      out.push("  0", "TEXT");
      out.push(...layerColorCodes(ent.dxfLayer, ent.dxfColor));
      out.push(
        " 10", ent.position.x.toFixed(4), " 20", ent.position.y.toFixed(4), " 30", "0.0",
        " 40", ent.height.toFixed(4),
        "  1", ent.text,
        " 50", (((ent.rotation % 360.0) + 360.0) % 360.0).toFixed(4),
      );
    } else if (ent instanceof Polyline) {
      writePolyline(out, ent.vertices, ent.dxfLayer, ent.dxfColor, ent.closed);
    }
  }

  out.push("  0", "ENDSEC", "  0", "EOF");
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Import
//
// Natively understands LINE, CIRCLE, ARC, TEXT, and the legacy
// POLYLINE/VERTEX/SEQEND form -- the entity subset exportDxf() itself
// produces. A POLYLINE/LWPOLYLINE record (whether open or closed) imports
// as a single Polyline entity, matching entities/polyline.ts's own
// vertex+bulge model directly, rather than exploding into separate Line/Arc
// entities. Also natively understands LWPOLYLINE and ELLIPSE (circular
// ellipses import as Circle; true/elliptical-arc ellipses import as a
// sampled Polyline, since this port has no native Ellipse entity yet) for
// broad interop with third-party R13+ files this app didn't itself write.
//
// Everything else follows a graceful-degradation strategy instead of being
// silently dropped: whenever a DXF construct has no direct equivalent in
// this app's data model, it's converted into the closest representation
// that does -- MTEXT becomes multiple TEXT entities (one per line,
// formatting codes stripped), unsupported true colors resolve to the
// nearest palette color, unsupported linetype patterns collapse to this
// app's generic dashed line, and SPLINE becomes a sampled polyline (NURBS
// evaluated directly, or its fit points / control polygon as a fallback --
// see io/dxfDegrade.ts). Geometry and engineering intent are preserved
// wherever possible; a warning is generated only for the residual cases
// where information genuinely can't be retained (BLOCK references, HATCH,
// native DIMENSION entities, XDATA, and any other entity type this reader
// has no representation for at all, plus malformed records it can't parse).
// importDxf() returns those warnings alongside its entity list so the
// caller can surface them.
// ---------------------------------------------------------------------------

type Pair = [number, string];

/**
 * Decodes a raw DXF file's bytes into trimmed lines. Tries UTF-8 first
 * (what this app's own exportDxf() always writes), then windows-1252
 * (classic Windows AutoCAD's default for older R12-style files), then
 * iso-8859-1/latin-1 as a final byte-preserving fallback (every byte value
 * maps to a printable char under latin-1, so this attempt never itself
 * throws -- it's the guaranteed backstop).
 */
function readDxfText(buffer: ArrayBuffer): string[] {
  for (const encoding of ["utf-8", "windows-1252", "iso-8859-1"]) {
    try {
      const decoder = new TextDecoder(encoding, { fatal: encoding === "utf-8" });
      const text = decoder.decode(buffer);
      return text.split(/\r\n|\r|\n/).map((ln) => ln.trim());
    } catch {
      continue;
    }
  }
  return [];
}

/** Reads a DXF file's raw group-code/value lines as [code, value] pairs. */
function parseDxfPairs(buffer: ArrayBuffer): Pair[] {
  const lines = readDxfText(buffer);

  // Only strip trailing blank padding at the very end of the file. A blank
  // line *inside* the file is not necessarily padding -- it can be a
  // perfectly legal, empty group value (e.g. header vars commonly have an
  // empty string as their group-1 value). DXF's group-code/value lines
  // strictly alternate, so dropping any such blank mid-file desyncs every
  // code/value pair after it for the rest of the file.
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]);
    if (!Number.isInteger(code)) continue;
    pairs.push([code, lines[i + 1]!]);
  }
  return pairs;
}

/** Slices out the [code, value] pairs strictly inside the ENTITIES section. */
function entitiesSection(pairs: Pair[]): Pair[] {
  let start: number | null = null;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i]![0] === 2 && pairs[i]![1] === "ENTITIES") {
      start = i + 1;
      break;
    }
  }
  if (start === null) return [];

  let end = pairs.length;
  for (let i = start; i < pairs.length; i++) {
    if (pairs[i]![0] === 0 && pairs[i]![1] === "ENDSEC") {
      end = i;
      break;
    }
  }
  return pairs.slice(start, end);
}

/** Collects a flat {code: value} record starting at `start` until the next group-0 marker. */
function readRecord(pairs: Pair[], start: number): [Record<number, string>, number] {
  let j = start;
  const rec: Record<number, string> = {};
  while (j < pairs.length && pairs[j]![0] !== 0) {
    const [code, value] = pairs[j]!;
    rec[code] = value;
    j++;
  }
  return [rec, j];
}

export interface ImportDxfResult {
  entities: Entity[];
  warnings: string[];
}

/**
 * Walks entity records inside ENTITIES, dispatching by their group-0 type
 * marker. Returns {entities, warnings} -- warnings describes anything
 * approximated or dropped during import, so information loss is visible to
 * the user instead of silent. Homogeneous, routine degradations that could
 * occur once per entity in a large file (true-color approximation, linetype
 * pattern collapse, unsupported/malformed entity types) are aggregated into
 * one summary line per cause rather than one line per occurrence.
 */
function entitiesFromPairs(pairs: Pair[]): ImportDxfResult {
  const entities: Entity[] = [];
  const warnings: string[] = [];
  let colorDegradedCount = 0;
  let linetypeDegradedCount = 0;
  const skippedCounts = new Map<string, number>();
  const malformedCounts = new Map<string, number>();
  let i = 0;
  const n = pairs.length;

  const bumpColor = (degraded: boolean) => {
    if (degraded) colorDegradedCount++;
  };
  const bumpLinetype = (degraded: boolean) => {
    if (degraded) linetypeDegradedCount++;
  };

  while (i < n) {
    const [code, value] = pairs[i]!;
    if (code !== 0) {
      i++;
      continue;
    }
    const etype = value;
    i++;

    try {
      if (etype === "LINE") {
        const [rec, next] = readRecord(pairs, i);
        i = next;
        const p1 = { x: Number(rec[10]), y: Number(rec[20]) };
        const p2 = { x: Number(rec[11]), y: Number(rec[21]) };
        const layer = rec[8] ?? "0";
        const { value: color, degraded: colorLossy } = resolveColor(rec);
        const { value: lineType, degraded: ltLossy } = resolveLineType(rec);
        bumpColor(colorLossy);
        bumpLinetype(ltLossy);
        entities.push(new Line(p1, p2, { lineType, dxfLayer: layer, dxfColor: color }));
      } else if (etype === "CIRCLE") {
        const [rec, next] = readRecord(pairs, i);
        i = next;
        const center = { x: Number(rec[10]), y: Number(rec[20]) };
        const layer = rec[8] ?? "0";
        const { value: color, degraded: colorLossy } = resolveColor(rec);
        const { value: lineType, degraded: ltLossy } = resolveLineType(rec);
        bumpColor(colorLossy);
        bumpLinetype(ltLossy);
        entities.push(new Circle(center, Number(rec[40]), { lineType, dxfLayer: layer, dxfColor: color }));
      } else if (etype === "ARC") {
        const [rec, next] = readRecord(pairs, i);
        i = next;
        const center = { x: Number(rec[10]), y: Number(rec[20]) };
        const radius = Number(rec[40]);
        const startAngle = (Number(rec[50]) * Math.PI) / 180;
        const endAngle = (Number(rec[51]) * Math.PI) / 180;
        const layer = rec[8] ?? "0";
        const { value: color, degraded: colorLossy } = resolveColor(rec);
        const { value: lineType, degraded: ltLossy } = resolveLineType(rec);
        bumpColor(colorLossy);
        bumpLinetype(ltLossy);
        entities.push(new Arc(center, radius, startAngle, endAngle, { lineType, dxfLayer: layer, dxfColor: color }));
      } else if (etype === "ELLIPSE") {
        // Center + major-axis endpoint *relative to center* + minor/major
        // ratio + start/end parameter (radians -- unlike almost every other
        // DXF angle field). A circular ellipse (ratio ~= 1) imports as this
        // app's existing Circle entity; a genuinely elliptical one (or an
        // elliptical arc, via 41/42) is sampled into a Polyline, since this
        // port has no native Ellipse entity yet.
        const [rec, next] = readRecord(pairs, i);
        i = next;
        const cx = Number(rec[10]);
        const cy = Number(rec[20]);
        const majorDx = Number(rec[11]);
        const majorDy = Number(rec[21]);
        const ratio = rec[40] !== undefined ? Number(rec[40]) : 1.0;
        const startParam = rec[41] !== undefined ? Number(rec[41]) : 0.0;
        const endParam = rec[42] !== undefined ? Number(rec[42]) : 2.0 * Math.PI;
        const majorRadius = Math.hypot(majorDx, majorDy);
        const layer = rec[8] ?? "0";
        const { value: color, degraded: colorLossy } = resolveColor(rec);
        const { value: lineType, degraded: ltLossy } = resolveLineType(rec);
        bumpColor(colorLossy);
        bumpLinetype(ltLossy);

        if (majorRadius > 0.0) {
          if (Math.abs(ratio - 1.0) < 1e-6) {
            entities.push(new Circle({ x: cx, y: cy }, majorRadius, { lineType, dxfLayer: layer, dxfColor: color }));
          } else {
            const rotation = Math.atan2(majorDy, majorDx);
            const minorRadius = majorRadius * ratio;
            const full = Math.abs(((endParam - startParam) % (2 * Math.PI)) - 0) < 1e-9 || endParam - startParam >= 2 * Math.PI - 1e-9;
            const sweep = full ? 2.0 * Math.PI : ((endParam - startParam) % (2.0 * Math.PI) + 2.0 * Math.PI) % (2.0 * Math.PI);
            const segments = Math.max(24, Math.round((144 * sweep) / (2.0 * Math.PI)));
            const cosR = Math.cos(rotation);
            const sinR = Math.sin(rotation);
            const pointCount = full ? segments : segments + 1;
            const vertices: Vertex[] = [];
            for (let k = 0; k < pointCount; k++) {
              const t = startParam + (sweep * k) / segments;
              const lx = majorRadius * Math.cos(t);
              const ly = minorRadius * Math.sin(t);
              vertices.push({
                point: { x: cx + lx * cosR - ly * sinR, y: cy + lx * sinR + ly * cosR },
                bulge: 0,
              });
            }
            entities.push(new Polyline(vertices, full, { lineType, dxfLayer: layer, dxfColor: color }));
            warnings.push(
              `ELLIPSE on layer ${layer}: approximated as a ${pointCount}-segment polyline ` +
                "(no native ellipse entity in this app -- exact curvature not preserved)",
            );
          }
        }
      } else if (etype === "TEXT") {
        const [rec, next] = readRecord(pairs, i);
        i = next;
        const pos = { x: Number(rec[10]), y: Number(rec[20]) };
        const height = rec[40] !== undefined ? Number(rec[40]) : DEFAULT_HEIGHT;
        const rotation = rec[50] !== undefined ? Number(rec[50]) : 0.0;
        const layer = rec[8] ?? "0";
        const { value: color, degraded: colorLossy } = resolveColor(rec);
        bumpColor(colorLossy);
        entities.push(new Text(pos, rec[1] ?? "", height, rotation, layer, color));
      } else if (etype === "MTEXT") {
        // Load-bearing detail, same reason as LWPOLYLINE below: group 3
        // (text chunk continuation) repeats once per 250-char chunk, and
        // group 1 (the final chunk) always comes last -- a flat
        // {code: value} record would keep only the final piece of a long
        // MTEXT. Walked directly instead, concatenating 3's in order
        // followed by 1.
        let layer = "0";
        let height = DEFAULT_HEIGHT;
        let rotationDeg = 0.0;
        let ix: number | null = null;
        let iy: number | null = null;
        const chunks: string[] = [];
        let finalChunk = "";
        const recForColor: Record<number, string> = {};
        let j = i;
        while (j < n && pairs[j]![0] !== 0) {
          const [vcode, vvalue] = pairs[j]!;
          if (vcode === 8) layer = vvalue;
          else if (vcode === 62 || vcode === 420) recForColor[vcode] = vvalue;
          else if (vcode === 10) ix = Number(vvalue);
          else if (vcode === 20) iy = Number(vvalue);
          else if (vcode === 40) height = Number(vvalue);
          else if (vcode === 50) {
            // MTEXT's own group 50 is radians (unlike single-line TEXT's
            // group 50, which is degrees) -- converted here to degrees to
            // match this app's Text.rotation convention.
            rotationDeg = (Number(vvalue) * 180) / Math.PI;
          } else if (vcode === 3) chunks.push(vvalue);
          else if (vcode === 1) finalChunk = vvalue;
          // 41 (reference rectangle width), 71/72 (attachment/flow
          // direction), 73 (line spacing style), 11/21 (explicit X-axis
          // direction vector, an alternative to group 50): intentionally
          // ignored -- direction-vector rotation isn't read, matching this
          // reader's existing scope of "angle fields only."
          j++;
        }
        i = j;

        const { value: color, degraded: colorLossy } = resolveColor(recForColor);
        bumpColor(colorLossy);

        if (ix !== null && iy !== null && (chunks.length > 0 || finalChunk !== "")) {
          const insertion = { x: ix, y: iy };
          const rawText = chunks.join("") + finalChunk;
          const { cleaned, hadFormatting } = cleanMtext(rawText);
          const label = `MTEXT on layer ${layer}`;
          if (hadFormatting) {
            warnings.push(`${label}: inline formatting codes stripped -- imported as plain text`);
          }

          const textLines = cleaned.split("\n");
          const lineSpacing = height * 1.5;
          const rad = (rotationDeg * Math.PI) / 180;
          const downX = Math.sin(rad);
          const downY = -Math.cos(rad);
          let addedLines = 0;
          textLines.forEach((lineText, k) => {
            if (lineText.trim() === "" && textLines.length > 1) return; // blank paragraph-break line -- no glyphs, skip the entity but keep the vertical gap
            const pos = { x: insertion.x + downX * lineSpacing * k, y: insertion.y + downY * lineSpacing * k };
            entities.push(new Text(pos, lineText, height, rotationDeg, layer, color));
            addedLines++;
          });
          if (addedLines > 1) {
            warnings.push(`${label}: split into ${addedLines} separate TEXT entities (one per line)`);
          }
        }
      } else if (etype === "LWPOLYLINE") {
        // Load-bearing detail: LWPOLYLINE carries *repeated* group codes
        // (one 10/20 pair per vertex, possibly dozens in one record) --
        // readRecord's flat {code: value} record would silently keep only
        // the *last* vertex (key collision) if reused here, so this walks
        // pairs directly instead.
        let layer = "0";
        let flags = 0;
        const rawVertices: [number, number | null, number][] = [];
        const recForStyle: Record<number, string> = {};
        let j = i;
        while (j < n && pairs[j]![0] !== 0) {
          const [vcode, vvalue] = pairs[j]!;
          if (vcode === 8) layer = vvalue;
          else if (vcode === 62 || vcode === 420 || vcode === 6) recForStyle[vcode] = vvalue;
          else if (vcode === 70) flags = Number(vvalue);
          else if (vcode === 10) rawVertices.push([Number(vvalue), null, 0.0]);
          else if (vcode === 20 && rawVertices.length > 0) rawVertices[rawVertices.length - 1]![1] = Number(vvalue);
          else if (vcode === 42 && rawVertices.length > 0) rawVertices[rawVertices.length - 1]![2] = Number(vvalue);
          // 90 (vertex count -- redundant with rawVertices.length, ignored),
          // 40/41 (start/end width, unsupported), 100 (subclass marker
          // string), 5 (handle), 210/220/230 (extrusion direction, always
          // +Z in a 2D app): intentionally ignored, matching this reader's
          // existing "tolerate/skip unrecognized codes inside a known
          // record" convention.
          j++;
        }
        i = j;

        const { value: color, degraded: colorLossy } = resolveColor(recForStyle);
        const { value: lineType, degraded: ltLossy } = resolveLineType(recForStyle);
        bumpColor(colorLossy);
        bumpLinetype(ltLossy);

        const verts: Vertex[] = rawVertices
          .filter(([, y]) => y !== null)
          .map(([x, y, bulge]) => ({ point: { x, y: y as number }, bulge }));
        const closed = (flags & 1) !== 0;
        if (verts.length >= 2) {
          entities.push(new Polyline(verts, closed, { lineType, dxfLayer: layer, dxfColor: color }));
        }
      } else if (etype === "POLYLINE") {
        const [rec, afterHeader] = readRecord(pairs, i);
        i = afterHeader;
        const closed = (Number(rec[70] ?? "0") & 1) === 1;
        const layer = rec[8] ?? "0";
        const { value: color, degraded: colorLossy } = resolveColor(rec);
        const { value: lineType, degraded: ltLossy } = resolveLineType(rec);
        bumpColor(colorLossy);
        bumpLinetype(ltLossy);

        const vertices: Vertex[] = [];
        while (i < n && pairs[i]![0] === 0 && pairs[i]![1] === "VERTEX") {
          i++;
          const [vrec, afterVertex] = readRecord(pairs, i);
          i = afterVertex;
          vertices.push({
            point: { x: Number(vrec[10]), y: Number(vrec[20]) },
            bulge: vrec[42] !== undefined ? Number(vrec[42]) : 0.0,
          });
        }
        if (i < n && pairs[i]![0] === 0 && pairs[i]![1] === "SEQEND") {
          i++;
          const [, afterSeqend] = readRecord(pairs, i);
          i = afterSeqend;
        }

        if (vertices.length >= 2) {
          entities.push(new Polyline(vertices, closed, { lineType, dxfLayer: layer, dxfColor: color }));
        }
      } else if (etype === "SPLINE") {
        // Same repeated-group-code situation as LWPOLYLINE/MTEXT above --
        // knots (40), weights (41), control points (10/20), and fit points
        // (11/21) all repeat once per value, so this walks pairs directly
        // rather than through readRecord.
        let layer = "0";
        let flags = 0;
        let degree = 3;
        const knots: number[] = [];
        const weights: number[] = [];
        const rawControl: [number, number | null][] = [];
        const rawFit: [number, number | null][] = [];
        const recForStyle: Record<number, string> = {};
        let j = i;
        while (j < n && pairs[j]![0] !== 0) {
          const [vcode, vvalue] = pairs[j]!;
          if (vcode === 8) layer = vvalue;
          else if (vcode === 62 || vcode === 420 || vcode === 6) recForStyle[vcode] = vvalue;
          else if (vcode === 70) flags = Number(vvalue);
          else if (vcode === 71) degree = Number(vvalue);
          else if (vcode === 40) knots.push(Number(vvalue));
          else if (vcode === 41) weights.push(Number(vvalue));
          else if (vcode === 10) rawControl.push([Number(vvalue), null]);
          else if (vcode === 20 && rawControl.length > 0) rawControl[rawControl.length - 1]![1] = Number(vvalue);
          else if (vcode === 11) rawFit.push([Number(vvalue), null]);
          else if (vcode === 21 && rawFit.length > 0) rawFit[rawFit.length - 1]![1] = Number(vvalue);
          // 72/73/74 (knot/control-point/fit-point counts, redundant with
          // the actual repeated-group counts), 12/22/13/23 (start/end
          // tangent vectors), 42/43/44 (knot/control/fit tolerances):
          // intentionally ignored, unsupported.
          j++;
        }
        i = j;

        const { value: color, degraded: colorLossy } = resolveColor(recForStyle);
        const { value: lineType, degraded: ltLossy } = resolveLineType(recForStyle);
        bumpColor(colorLossy);
        bumpLinetype(ltLossy);

        const controlPts: Point[] = rawControl.filter(([, y]) => y !== null).map(([x, y]) => ({ x, y: y as number }));
        const fitPts: Point[] = rawFit.filter(([, y]) => y !== null).map(([x, y]) => ({ x, y: y as number }));
        const closed = (flags & 1) !== 0;
        const label = `SPLINE on layer ${layer}`;

        let pathPoints: Point[] | null = null;
        if (controlPts.length >= 2 && knots.length >= degree + controlPts.length + 1) {
          const samples = Math.max(20, Math.min(200, controlPts.length * 12));
          pathPoints = sampleBspline(controlPts, weights.length > 0 ? weights : null, degree, knots, samples);
          warnings.push(
            `${label}: approximated as a ${pathPoints.length - 1}-segment polyline ` +
              "(exact NURBS curvature not preserved)",
          );
        } else if (fitPts.length >= 2) {
          pathPoints = fitPts;
          warnings.push(
            `${label}: no usable knot vector -- approximated by connecting its ${fitPts.length} fit points ` +
              "directly (smooth curvature not preserved)",
          );
        } else if (controlPts.length >= 2) {
          pathPoints = controlPts;
          warnings.push(
            `${label}: no usable knot vector or fit points -- approximated by its raw control polygon ` +
              "(least accurate fallback; shape may differ noticeably from the true curve)",
          );
        }

        if (pathPoints !== null && pathPoints.length >= 2) {
          const segments: [Point, Point][] = [];
          for (let k = 0; k < pathPoints.length - 1; k++) segments.push([pathPoints[k]!, pathPoints[k + 1]!]);
          if (closed) segments.push([pathPoints[pathPoints.length - 1]!, pathPoints[0]!]);
          for (const [p1, p2] of segments) {
            entities.push(new Line(p1, p2, { lineType, dxfLayer: layer, dxfColor: color }));
          }
        } else {
          warnings.push(`${label}: too few usable points to approximate -- skipped`);
        }
      } else {
        // Unsupported entity type -- skip its record, keep walking the rest
        // of the file. Counted rather than warned individually so a file
        // with hundreds of e.g. HATCH entities produces one summary line
        // instead of hundreds of identical ones.
        skippedCounts.set(etype, (skippedCounts.get(etype) ?? 0) + 1);
        const [, next] = readRecord(pairs, i);
        i = next;
      }
    } catch {
      // Malformed/unexpected record for the type -- skip it, keep walking the rest of the file.
      malformedCounts.set(etype, (malformedCounts.get(etype) ?? 0) + 1);
      const [, next] = readRecord(pairs, i);
      i = next;
    }
  }

  if (colorDegradedCount > 0) {
    warnings.push(
      `${colorDegradedCount} entities used a true (24-bit) color -- approximated to the nearest of a ` +
        `${Object.keys(ACI_PALETTE).length}-color palette`,
    );
  }
  if (linetypeDegradedCount > 0) {
    warnings.push(
      `${linetypeDegradedCount} entities used a named linetype pattern other than Continuous -- ` +
        "approximated as a generic dashed line",
    );
  }
  for (const [etypeName, count] of [...skippedCounts.entries()].sort()) {
    const noun = count === 1 ? "entity" : "entities";
    warnings.push(`${count} unsupported ${etypeName} ${noun} skipped (not representable in this app's data model)`);
  }
  for (const [etypeName, count] of [...malformedCounts.entries()].sort()) {
    const noun = count === 1 ? "record" : "records";
    warnings.push(`${count} malformed ${etypeName} ${noun} skipped (could not be parsed)`);
  }

  return { entities, warnings };
}

/**
 * Reads a DXF file's raw bytes and returns the parsed entities (in this
 * app's own Y-down world space) alongside any import warnings. Returns null
 * on outright failure (unreadable/empty file).
 */
export function importDxf(buffer: ArrayBuffer): ImportDxfResult | null {
  const pairs = parseDxfPairs(buffer);
  if (pairs.length === 0) return null;

  const { entities, warnings } = entitiesFromPairs(entitiesSection(pairs));
  // DXF is Y-up; this app's document space is Y-down -- flipY is a
  // self-inverse, so reuse it unchanged to convert the parsed Y-up geometry
  // back into app space.
  return { entities: flipY(entities), warnings };
}
