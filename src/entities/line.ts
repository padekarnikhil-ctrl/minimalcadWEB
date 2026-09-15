/**
 * MinimalCAD Web
 * entities/line.ts
 *
 * Ported from entities/line.py. Field names in serialize()/fromDict() match
 * the desktop app's JSON exactly -- required for cross-app file
 * compatibility, not just convention.
 */

import { generateId } from "../core/id";
import type { Bounds, Point } from "../core/types";
import type { Entity, Viewport } from "./entity";
import { COLOR_NORMAL, drawGrip, rotatePoint } from "./style";
import type { EntityStyleOptions, LineType } from "./style";

export type { LineType };

export class Line implements Entity {
  startPoint: Point;
  endPoint: Point;
  lineType: LineType;
  dxfLayer: string;
  dxfColor: number | null;
  readonly id: string;

  constructor(startPoint: Point, endPoint: Point, opts: EntityStyleOptions = {}) {
    this.startPoint = { ...startPoint };
    this.endPoint = { ...endPoint };
    this.lineType = opts.lineType ?? "solid";
    this.dxfLayer = opts.dxfLayer ?? "0";
    this.dxfColor = opts.dxfColor ?? null;
    // Stable identity for a future constraints feature -- not used by any v1
    // logic yet, but present now so files saved by this port carry it
    // forward. copy() deliberately omits it so duplicates get a fresh id.
    this.id = opts.id ?? generateId();
  }

  midpoint(): Point {
    return { x: (this.startPoint.x + this.endPoint.x) / 2, y: (this.startPoint.y + this.endPoint.y) / 2 };
  }

  draw(ctx: CanvasRenderingContext2D, viewport: Viewport, preview = false): void {
    const dashed = preview || this.lineType === "dashed";
    ctx.strokeStyle = COLOR_NORMAL;
    ctx.lineWidth = 1;
    ctx.setLineDash(dashed ? [6, 4] : []);

    const p1 = viewport.worldToScreen(this.startPoint);
    const p2 = viewport.worldToScreen(this.endPoint);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawSelected(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const p1 = viewport.worldToScreen(this.startPoint);
    const p2 = viewport.worldToScreen(this.endPoint);
    const mid = viewport.worldToScreen(this.midpoint());

    ctx.strokeStyle = "#1e90ff";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const pt of [p1, mid, p2]) drawGrip(ctx, pt);
  }

  move(dx: number, dy: number): void {
    this.startPoint = { x: this.startPoint.x + dx, y: this.startPoint.y + dy };
    this.endPoint = { x: this.endPoint.x + dx, y: this.endPoint.y + dy };
  }

  rotate(cx: number, cy: number, angleRad: number): void {
    this.startPoint = rotatePoint(this.startPoint, cx, cy, angleRad);
    this.endPoint = rotatePoint(this.endPoint, cx, cy, angleRad);
  }

  copy(): Line {
    return new Line(this.startPoint, this.endPoint, {
      lineType: this.lineType,
      dxfLayer: this.dxfLayer,
      dxfColor: this.dxfColor,
      // no id -- fresh identity for the duplicate
    });
  }

  getBounds(): Bounds {
    return [
      Math.min(this.startPoint.x, this.endPoint.x),
      Math.min(this.startPoint.y, this.endPoint.y),
      Math.max(this.startPoint.x, this.endPoint.x),
      Math.max(this.startPoint.y, this.endPoint.y),
    ];
  }

  hitTest(pt: Point, tolerance = 3.0): boolean {
    const x0 = pt.x;
    const y0 = pt.y;
    const x1 = this.startPoint.x;
    const y1 = this.startPoint.y;
    const x2 = this.endPoint.x;
    const y2 = this.endPoint.y;

    const px = x2 - x1;
    const py = y2 - y1;
    const lengthSq = px * px + py * py;

    if (lengthSq === 0) {
      return Math.hypot(x0 - x1, y0 - y1) <= tolerance;
    }

    let u = ((x0 - x1) * px + (y0 - y1) * py) / lengthSq;
    u = Math.max(0, Math.min(1, u));

    const nearestX = x1 + u * px;
    const nearestY = y1 + u * py;
    return Math.hypot(x0 - nearestX, y0 - nearestY) <= tolerance;
  }

  serialize(): Record<string, unknown> {
    return {
      type: "line",
      start: { x: this.startPoint.x, y: this.startPoint.y },
      end: { x: this.endPoint.x, y: this.endPoint.y },
      line_type: this.lineType,
      dxf_layer: this.dxfLayer,
      dxf_color: this.dxfColor,
      id: this.id,
    };
  }

  static fromDict(data: Record<string, unknown>): Line {
    const start = data.start as { x: number; y: number };
    const end = data.end as { x: number; y: number };
    return new Line(
      { x: start.x, y: start.y },
      { x: end.x, y: end.y },
      {
        lineType: (data.line_type as LineType | undefined) ?? "solid",
        dxfLayer: (data.dxf_layer as string | undefined) ?? "0",
        dxfColor: (data.dxf_color as number | null | undefined) ?? null,
        id: data.id as string | undefined,
      },
    );
  }
}
