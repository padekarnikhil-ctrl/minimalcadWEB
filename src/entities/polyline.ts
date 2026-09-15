/**
 * MinimalCAD Web
 * entities/polyline.ts
 *
 * Ported from entities/polyline.py. A Polyline is just an ordered
 * (vertex, bulge) chain -- it has NO drawing/hitTest/bounds math of its
 * own, it decomposes into per-edge Line/Arc instances via
 * segmentEntities() and delegates every geometric operation to those.
 * Unlike Line/Circle/Arc, Polyline carries no `id` field (matches the
 * desktop app's own JSON shape -- don't add one, it would break file
 * compatibility).
 */

import type { Bounds, Point } from "../core/types";
import type { Entity, Viewport } from "./entity";
import type { EntityStyleOptions, LineType } from "./style";
import { drawGrip } from "./style";
import { Line } from "./line";
import { Arc } from "./arc";

export interface Vertex {
  point: Point;
  bulge: number;
}

/** Reconstructs the Arc a bulge value represents for the edge p1->p2 --
 *  bulge = tan(includedAngle/4), 0 = straight (handled by the caller before
 *  ever reaching here), sign orients which of p1/p2 is the arc's own
 *  increasing-angle start. Implemented with plain real-number complex-
 *  number arithmetic (no complex type needed) rather than a literal
 *  transliteration of Python's `complex()` usage. */
export function bulgeToArc(p1: Point, p2: Point, bulge: number, opts: EntityStyleOptions = {}): Arc {
  const [sp, ep] = bulge >= 0 ? [p1, p2] : [p2, p1];
  const phi = 4 * Math.atan(Math.abs(bulge));

  const rotX = Math.cos(phi);
  const rotY = Math.sin(phi);

  // sp * rot (complex multiply)
  const spRotX = sp.x * rotX - sp.y * rotY;
  const spRotY = sp.x * rotY + sp.y * rotX;

  // numer = ep - sp*rot
  const numerX = ep.x - spRotX;
  const numerY = ep.y - spRotY;

  // d = 1 - rot; center = numer / d, via numer * conj(d) / |d|^2
  const dX = 1 - rotX;
  const dY = -rotY;
  const denom = dX * dX + dY * dY;
  const centerX = (numerX * dX + numerY * dY) / denom;
  const centerY = (numerY * dX - numerX * dY) / denom;
  const center: Point = { x: centerX, y: centerY };

  const radius = Math.hypot(sp.x - centerX, sp.y - centerY);
  const startAngle = Math.atan2(sp.y - centerY, sp.x - centerX);

  return new Arc(center, radius, startAngle, startAngle + phi, opts);
}

export class Polyline implements Entity {
  vertices: Vertex[];
  closed: boolean;
  lineType: LineType;
  dxfLayer: string;
  dxfColor: number | null;

  constructor(vertices: Vertex[], closed = false, opts: EntityStyleOptions = {}) {
    this.vertices = vertices.map((v) => ({ point: { ...v.point }, bulge: v.bulge }));
    this.closed = closed;
    this.lineType = opts.lineType ?? "solid";
    this.dxfLayer = opts.dxfLayer ?? "0";
    this.dxfColor = opts.dxfColor ?? null;
  }

  private *edges(): Generator<[Point, Point, number]> {
    const n = this.vertices.length;
    const edgeCount = this.closed ? n : n - 1;
    for (let i = 0; i < edgeCount; i++) {
      const v1 = this.vertices[i]!;
      const v2 = this.vertices[(i + 1) % n]!;
      yield [v1.point, v2.point, v1.bulge];
    }
  }

  segmentEntities(): Entity[] {
    const opts = { lineType: this.lineType, dxfLayer: this.dxfLayer, dxfColor: this.dxfColor };
    const segments: Entity[] = [];
    for (const [p1, p2, bulge] of this.edges()) {
      segments.push(bulge === 0 ? new Line(p1, p2, opts) : bulgeToArc(p1, p2, bulge, opts));
    }
    return segments;
  }

  gripItems(): { index: number; point: Point }[] {
    return this.vertices.map((v, index) => ({ index, point: { ...v.point } }));
  }

  setVertex(index: number, newPoint: Point): void {
    const v = this.vertices[index];
    if (v === undefined) return;
    v.point = { ...newPoint };
  }

  draw(ctx: CanvasRenderingContext2D, viewport: Viewport, preview = false): void {
    for (const seg of this.segmentEntities()) {
      seg.draw(ctx, viewport, preview);
    }
  }

  drawSelected(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    ctx.strokeStyle = "#1e90ff";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (const seg of this.segmentEntities()) {
      seg.draw(ctx, viewport, false);
    }
    ctx.setLineDash([]);

    for (const { point } of this.gripItems()) {
      drawGrip(ctx, viewport.worldToScreen(point));
    }
  }

  move(dx: number, dy: number): void {
    for (const v of this.vertices) {
      v.point = { x: v.point.x + dx, y: v.point.y + dy };
    }
  }

  rotate(cx: number, cy: number, angleRad: number): void {
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    for (const v of this.vertices) {
      const dx = v.point.x - cx;
      const dy = v.point.y - cy;
      v.point = { x: cx + dx * cosA - dy * sinA, y: cy + dx * sinA + dy * cosA };
      // bulge is shape-relative (an included angle + winding sign), rotation-invariant -- untouched.
    }
  }

  copy(): Polyline {
    return new Polyline(this.vertices, this.closed, {
      lineType: this.lineType,
      dxfLayer: this.dxfLayer,
      dxfColor: this.dxfColor,
    });
  }

  hitTest(pt: Point, tolerance = 3.0): boolean {
    return this.segmentEntities().some((seg) => seg.hitTest(pt, tolerance));
  }

  getBounds(): Bounds {
    const segments = this.segmentEntities();
    if (segments.length === 0) {
      const p = this.vertices[0]?.point ?? { x: 0, y: 0 };
      return [p.x, p.y, p.x, p.y];
    }
    let bounds = segments[0]!.getBounds();
    for (const seg of segments.slice(1)) {
      const [x0, y0, x1, y1] = seg.getBounds();
      bounds = [
        Math.min(bounds[0], x0),
        Math.min(bounds[1], y0),
        Math.max(bounds[2], x1),
        Math.max(bounds[3], y1),
      ];
    }
    return bounds;
  }

  serialize(): Record<string, unknown> {
    return {
      type: "polyline",
      vertices: this.vertices.map((v) => ({ x: v.point.x, y: v.point.y, bulge: v.bulge })),
      closed: this.closed,
      line_type: this.lineType,
      dxf_layer: this.dxfLayer,
      dxf_color: this.dxfColor,
    };
  }

  static fromDict(data: Record<string, unknown>): Polyline {
    const rawVertices = (data.vertices as { x: number; y: number; bulge?: number }[]) ?? [];
    const vertices: Vertex[] = rawVertices.map((v) => ({
      point: { x: v.x, y: v.y },
      bulge: v.bulge ?? 0,
    }));
    return new Polyline(vertices, Boolean(data.closed), {
      lineType: (data.line_type as LineType | undefined) ?? "solid",
      dxfLayer: (data.dxf_layer as string | undefined) ?? "0",
      dxfColor: (data.dxf_color as number | null | undefined) ?? null,
    });
  }
}
