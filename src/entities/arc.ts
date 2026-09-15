/**
 * MinimalCAD Web
 * entities/arc.ts
 *
 * Ported from entities/arc.py. Sweep is ALWAYS the increasing-angle
 * direction from startAngle to endAngle (this app's own invariant, relied
 * on by Fillet/Mirror later) -- on this Y-down canvas that reads as
 * clockwise on screen.
 *
 * No Y-flip hack here unlike the Python source's "THE FIX" comment: that
 * flip exists purely to compensate for Qt's drawArc() assuming a Y-up
 * coordinate system. HTML5 Canvas's ctx.arc() is natively Y-down, already
 * matching this app's own angle convention -- so a straight port with no
 * flip produces the correct visual result.
 */

import { generateId } from "../core/id";
import type { Bounds, Point } from "../core/types";
import type { Entity, Viewport } from "./entity";
import { COLOR_NORMAL, drawGrip, rotatePoint } from "./style";
import type { EntityStyleOptions, LineType } from "./style";

const TWO_PI = 2.0 * Math.PI;

function normalizeAngle(angle: number): number {
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

export class Arc implements Entity {
  center: Point;
  radius: number;
  startAngle: number;
  endAngle: number;
  lineType: LineType;
  dxfLayer: string;
  dxfColor: number | null;
  readonly id: string;

  constructor(
    center: Point,
    radius: number,
    startAngleRad: number,
    endAngleRad: number,
    opts: EntityStyleOptions = {},
  ) {
    this.center = { ...center };
    this.radius = radius;
    this.startAngle = normalizeAngle(startAngleRad);
    this.endAngle = normalizeAngle(endAngleRad);
    this.lineType = opts.lineType ?? "solid";
    this.dxfLayer = opts.dxfLayer ?? "0";
    this.dxfColor = opts.dxfColor ?? null;
    this.id = opts.id ?? generateId();
  }

  /** Whether `angle` falls within this arc's own start->end increasing-angle
   *  sweep, wrapping across the 0-radian axis when start > end. Public so
   *  engine/snap.ts's Quadrant/Nearest osnap search can respect a partial
   *  arc's own span, not just its full parent circle. */
  angleInSweep(angle: number): boolean {
    const a = normalizeAngle(angle);
    const s = this.startAngle;
    const e = this.endAngle;
    if (s <= e) return a >= s && a <= e;
    return a >= s || a <= e;
  }

  draw(ctx: CanvasRenderingContext2D, viewport: Viewport, preview = false): void {
    const dashed = preview || this.lineType === "dashed";
    ctx.strokeStyle = COLOR_NORMAL;
    ctx.lineWidth = 1;
    ctx.setLineDash(dashed ? [6, 4] : []);

    const center = viewport.worldToScreen(this.center);
    const end = this.endAngle === this.startAngle ? this.startAngle + TWO_PI : this.endAngle;
    ctx.beginPath();
    ctx.arc(center.x, center.y, this.radius * viewport.zoom, this.startAngle, end, false);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawSelected(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const center = viewport.worldToScreen(this.center);
    const end = this.endAngle === this.startAngle ? this.startAngle + TWO_PI : this.endAngle;

    ctx.strokeStyle = "#1e90ff";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(center.x, center.y, this.radius * viewport.zoom, this.startAngle, end, false);
    ctx.stroke();
    ctx.setLineDash([]);

    drawGrip(ctx, center);
    const pStart = viewport.worldToScreen(this.pointAt(this.startAngle));
    const pEnd = viewport.worldToScreen(this.pointAt(this.endAngle));
    drawGrip(ctx, pStart);
    drawGrip(ctx, pEnd);
  }

  pointAt(angle: number): Point {
    return {
      x: this.center.x + this.radius * Math.cos(angle),
      y: this.center.y + this.radius * Math.sin(angle),
    };
  }

  move(dx: number, dy: number): void {
    this.center = { x: this.center.x + dx, y: this.center.y + dy };
  }

  rotate(cx: number, cy: number, angleRad: number): void {
    this.center = rotatePoint(this.center, cx, cy, angleRad);
    this.startAngle = normalizeAngle(this.startAngle + angleRad);
    this.endAngle = normalizeAngle(this.endAngle + angleRad);
  }

  copy(): Arc {
    return new Arc(this.center, this.radius, this.startAngle, this.endAngle, {
      lineType: this.lineType,
      dxfLayer: this.dxfLayer,
      dxfColor: this.dxfColor,
    });
  }

  getBounds(): Bounds {
    const pStart = this.pointAt(this.startAngle);
    const pEnd = this.pointAt(this.endAngle);
    const xs = [pStart.x, pEnd.x];
    const ys = [pStart.y, pEnd.y];

    if (this.angleInSweep(0)) xs.push(this.center.x + this.radius);
    if (this.angleInSweep(Math.PI)) xs.push(this.center.x - this.radius);
    if (this.angleInSweep(Math.PI / 2)) ys.push(this.center.y + this.radius);
    if (this.angleInSweep((3 * Math.PI) / 2)) ys.push(this.center.y - this.radius);

    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  hitTest(pt: Point, tolerance = 3.0): boolean {
    const dist = Math.hypot(pt.x - this.center.x, pt.y - this.center.y);
    if (Math.abs(dist - this.radius) > tolerance) return false;
    const angle = Math.atan2(pt.y - this.center.y, pt.x - this.center.x);
    return this.angleInSweep(angle);
  }

  serialize(): Record<string, unknown> {
    return {
      type: "arc",
      center: { x: this.center.x, y: this.center.y },
      radius: this.radius,
      start_angle: (this.startAngle * 180) / Math.PI,
      end_angle: (this.endAngle * 180) / Math.PI,
      line_type: this.lineType,
      dxf_layer: this.dxfLayer,
      dxf_color: this.dxfColor,
      id: this.id,
    };
  }

  static fromDict(data: Record<string, unknown>): Arc {
    const center = data.center as { x: number; y: number };
    const startRad = ((data.start_angle as number) * Math.PI) / 180;
    const endRad = ((data.end_angle as number) * Math.PI) / 180;
    return new Arc({ x: center.x, y: center.y }, data.radius as number, startRad, endRad, {
      lineType: (data.line_type as LineType | undefined) ?? "solid",
      dxfLayer: (data.dxf_layer as string | undefined) ?? "0",
      dxfColor: (data.dxf_color as number | null | undefined) ?? null,
      id: data.id as string | undefined,
    });
  }
}
