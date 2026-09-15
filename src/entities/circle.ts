/**
 * MinimalCAD Web
 * entities/circle.ts
 *
 * Ported from entities/circle.py.
 */

import { generateId } from "../core/id";
import type { Bounds, Point } from "../core/types";
import type { Entity, Viewport } from "./entity";
import { COLOR_NORMAL, drawGrip, rotatePoint } from "./style";
import type { EntityStyleOptions, LineType } from "./style";

export class Circle implements Entity {
  center: Point;
  radius: number;
  lineType: LineType;
  dxfLayer: string;
  dxfColor: number | null;
  readonly id: string;

  constructor(center: Point, radius: number, opts: EntityStyleOptions = {}) {
    this.center = { ...center };
    this.radius = radius;
    this.lineType = opts.lineType ?? "solid";
    this.dxfLayer = opts.dxfLayer ?? "0";
    this.dxfColor = opts.dxfColor ?? null;
    this.id = opts.id ?? generateId();
  }

  /** 3/12/9/6 o'clock points (east, "north"=up-on-screen since Y is down, west, "south"=down). */
  quadrantPoints(): [Point, Point, Point, Point] {
    const { x, y } = this.center;
    const r = this.radius;
    return [
      { x: x + r, y },
      { x, y: y - r },
      { x: x - r, y },
      { x, y: y + r },
    ];
  }

  draw(ctx: CanvasRenderingContext2D, viewport: Viewport, preview = false): void {
    const dashed = preview || this.lineType === "dashed";
    ctx.strokeStyle = COLOR_NORMAL;
    ctx.lineWidth = 1;
    ctx.setLineDash(dashed ? [6, 4] : []);

    const center = viewport.worldToScreen(this.center);
    ctx.beginPath();
    ctx.arc(center.x, center.y, this.radius * viewport.zoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawSelected(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const center = viewport.worldToScreen(this.center);
    ctx.strokeStyle = "#1e90ff";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(center.x, center.y, this.radius * viewport.zoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    drawGrip(ctx, center);
    for (const q of this.quadrantPoints()) drawGrip(ctx, viewport.worldToScreen(q));
  }

  move(dx: number, dy: number): void {
    this.center = { x: this.center.x + dx, y: this.center.y + dy };
  }

  rotate(cx: number, cy: number, angleRad: number): void {
    this.center = rotatePoint(this.center, cx, cy, angleRad);
  }

  copy(): Circle {
    return new Circle(this.center, this.radius, {
      lineType: this.lineType,
      dxfLayer: this.dxfLayer,
      dxfColor: this.dxfColor,
    });
  }

  getBounds(): Bounds {
    const { x, y } = this.center;
    const r = this.radius;
    return [x - r, y - r, x + r, y + r];
  }

  /** Edge-only hit test (not filled-interior). */
  hitTest(pt: Point, tolerance = 3.0): boolean {
    const dist = Math.hypot(pt.x - this.center.x, pt.y - this.center.y);
    return Math.abs(dist - this.radius) <= tolerance;
  }

  serialize(): Record<string, unknown> {
    return {
      type: "circle",
      center: { x: this.center.x, y: this.center.y },
      radius: this.radius,
      line_type: this.lineType,
      dxf_layer: this.dxfLayer,
      dxf_color: this.dxfColor,
      id: this.id,
    };
  }

  static fromDict(data: Record<string, unknown>): Circle {
    const center = data.center as { x: number; y: number };
    return new Circle(
      { x: center.x, y: center.y },
      data.radius as number,
      {
        lineType: (data.line_type as LineType | undefined) ?? "solid",
        dxfLayer: (data.dxf_layer as string | undefined) ?? "0",
        dxfColor: (data.dxf_color as number | null | undefined) ?? null,
        id: data.id as string | undefined,
      },
    );
  }
}
