/**
 * MinimalCAD Web
 * entities/ellipse.ts
 *
 * Ported from entities/ellipse.py: center + independent x/y radii +
 * rotation, with an optional start/end parametric angle sweep for
 * elliptical arcs (mirrors DXF's ELLIPSE entity). Simpler than the Python
 * source here: Qt has no native rotated-ellipse-arc primitive, so
 * entities/ellipse.py has to translate+rotate the whole painter and
 * manually flip Qt's drawArc() angle convention ("THE FIX", see
 * entities/arc.py). Canvas2D's ctx.ellipse(x, y, rx, ry, rotation, start,
 * end) takes rotation and a Y-down-native start/end sweep directly as
 * arguments -- no transform stack, no flip -- so this port's draw() is a
 * single call instead of a save/translate/rotate/restore dance, same
 * simplification entities/arc.ts already got over its own Python source.
 */

import { generateId } from "../core/id";
import type { Bounds, Point } from "../core/types";
import type { Entity, Viewport } from "./entity";
import { COLOR_NORMAL, COLOR_SELECTED, drawGrip, rotatePoint } from "./style";
import type { EntityStyleOptions, LineType } from "./style";

const TWO_PI = 2.0 * Math.PI;

function normalizeAngle(angle: number): number {
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

export class Ellipse implements Entity {
  center: Point;
  radiusX: number;
  radiusY: number;
  rotation: number;
  startAngle: number;
  endAngle: number;
  lineType: LineType;
  dxfLayer: string;
  dxfColor: number | null;
  readonly id: string;

  constructor(
    center: Point,
    radiusX: number,
    radiusY: number,
    rotationRad = 0.0,
    startAngleRad = 0.0,
    endAngleRad = TWO_PI,
    opts: EntityStyleOptions = {},
  ) {
    this.center = { ...center };
    this.radiusX = radiusX;
    this.radiusY = radiusY;
    this.rotation = normalizeAngle(rotationRad);
    this.startAngle = normalizeAngle(startAngleRad);
    this.endAngle = normalizeAngle(endAngleRad);
    this.lineType = opts.lineType ?? "solid";
    this.dxfLayer = opts.dxfLayer ?? "0";
    this.dxfColor = opts.dxfColor ?? null;
    this.id = opts.id ?? generateId();
  }

  /** A start/end sweep that normalizes to zero span means a full ellipse
   *  (matches entities/arc.ts's angleInSweep 0-span convention for a full circle). */
  isFull(): boolean {
    return Math.abs(normalizeAngle(this.endAngle - this.startAngle)) < 1e-9;
  }

  /** World point at parametric angle `t` (this Ellipse's own start/endAngle
   *  convention: the pre-rotation local point (radiusX*cos t, radiusY*sin
   *  t), rotated and translated into world space). */
  pointAt(t: number): Point {
    const lx = this.radiusX * Math.cos(t);
    const ly = this.radiusY * Math.sin(t);
    const cosR = Math.cos(this.rotation);
    const sinR = Math.sin(this.rotation);
    return {
      x: this.center.x + lx * cosR - ly * sinR,
      y: this.center.y + lx * sinR + ly * cosR,
    };
  }

  /** The parametric angle (this ellipse's own start/endAngle convention) of
   *  the ray from the center through `pt`, projected onto the boundary --
   *  the local-frame equivalent of Circle/Arc's plain atan2(dy, dx). Shared
   *  by hitTest() and the trim engine's ellipse-arc splitting. */
  paramAngleOf(pt: Point): number {
    const dx = pt.x - this.center.x;
    const dy = pt.y - this.center.y;
    const cosR = Math.cos(-this.rotation);
    const sinR = Math.sin(-this.rotation);
    const lx = dx * cosR - dy * sinR;
    const ly = dx * sinR + dy * cosR;
    return normalizeAngle(Math.atan2(ly / this.radiusY, lx / this.radiusX));
  }

  /** Implicit "distance off the boundary" in the ellipse's own local frame:
   *  0 exactly on the boundary, <0 inside, >0 outside. Used by the trim
   *  engine's numeric ellipse-vs-{circle,arc,ellipse} root finding --
   *  closed-form quartics are deliberately avoided (see
   *  geometry/intersect.ts's own doc comment). */
  implicitValue(pt: Point): number {
    const dx = pt.x - this.center.x;
    const dy = pt.y - this.center.y;
    const cosR = Math.cos(-this.rotation);
    const sinR = Math.sin(-this.rotation);
    const lx = dx * cosR - dy * sinR;
    const ly = dx * sinR + dy * cosR;
    return (lx / this.radiusX) ** 2 + (ly / this.radiusY) ** 2 - 1;
  }

  /** The 4 major/minor axis endpoints in world space (rotation applied) --
   *  this ellipse's equivalent of Circle.quadrantPoints(). */
  axisPoints(): [Point, Point, Point, Point] {
    const localPts: Point[] = [
      { x: this.radiusX, y: 0 },
      { x: -this.radiusX, y: 0 },
      { x: 0, y: this.radiusY },
      { x: 0, y: -this.radiusY },
    ];
    const cosR = Math.cos(this.rotation);
    const sinR = Math.sin(this.rotation);
    const world = localPts.map((p) => ({
      x: this.center.x + p.x * cosR - p.y * sinR,
      y: this.center.y + p.x * sinR + p.y * cosR,
    }));
    return world as [Point, Point, Point, Point];
  }

  draw(ctx: CanvasRenderingContext2D, viewport: Viewport, preview = false): void {
    const dashed = preview || this.lineType === "dashed";
    ctx.strokeStyle = COLOR_NORMAL;
    ctx.lineWidth = 1;
    ctx.setLineDash(dashed ? [6, 4] : []);
    this.strokeCurve(ctx, viewport);
    ctx.setLineDash([]);
  }

  drawSelected(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    ctx.strokeStyle = COLOR_SELECTED;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    this.strokeCurve(ctx, viewport);
    ctx.setLineDash([]);

    for (const pt of [this.center, ...this.axisPoints()]) drawGrip(ctx, viewport.worldToScreen(pt));
  }

  private strokeCurve(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const center = viewport.worldToScreen(this.center);
    const end = this.isFull() ? this.startAngle + TWO_PI : this.endAngle <= this.startAngle ? this.endAngle + TWO_PI : this.endAngle;
    ctx.beginPath();
    ctx.ellipse(
      center.x,
      center.y,
      this.radiusX * viewport.zoom,
      this.radiusY * viewport.zoom,
      this.rotation,
      this.startAngle,
      end,
      false,
    );
    ctx.stroke();
  }

  move(dx: number, dy: number): void {
    this.center = { x: this.center.x + dx, y: this.center.y + dy };
  }

  rotate(cx: number, cy: number, angleRad: number): void {
    this.center = rotatePoint(this.center, cx, cy, angleRad);
    this.rotation = normalizeAngle(this.rotation + angleRad);
  }

  copy(): Ellipse {
    return new Ellipse(this.center, this.radiusX, this.radiusY, this.rotation, this.startAngle, this.endAngle, {
      lineType: this.lineType,
      dxfLayer: this.dxfLayer,
      dxfColor: this.dxfColor,
    });
  }

  /**
   * Axis-aligned bounding box. A full ellipse has an exact closed form
   * (below). A partial elliptical arc has no equally simple closed form for
   * a *rotated* ellipse's swept-arc-only extremes, so it's approximated by
   * sampling the swept boundary instead -- same technique and segment-count
   * formula as io/dxf.ts's ELLIPSE-to-Polyline degrade sampling.
   */
  getBounds(): Bounds {
    const cosR = Math.cos(this.rotation);
    const sinR = Math.sin(this.rotation);

    if (this.isFull()) {
      const halfW = Math.hypot(this.radiusX * cosR, this.radiusY * sinR);
      const halfH = Math.hypot(this.radiusX * sinR, this.radiusY * cosR);
      return [this.center.x - halfW, this.center.y - halfH, this.center.x + halfW, this.center.y + halfH];
    }

    const sweep = normalizeAngle(this.endAngle - this.startAngle) || TWO_PI;
    const samples = Math.max(24, Math.round((144 * sweep) / TWO_PI));
    const xs: number[] = [];
    const ys: number[] = [];
    for (let k = 0; k <= samples; k++) {
      const t = this.startAngle + (sweep * k) / samples;
      const lx = this.radiusX * Math.cos(t);
      const ly = this.radiusY * Math.sin(t);
      xs.push(this.center.x + lx * cosR - ly * sinR);
      ys.push(this.center.y + lx * sinR + ly * cosR);
    }
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  /**
   * Approximate nearest point on the ellipse's boundary to `pos`: where the
   * ray from the center through `pos` crosses the ellipse (solved in the
   * ellipse's own rotated-but-unscaled local frame). Not the true nearest
   * point on an ellipse (no simple closed form), but self-consistent (a
   * point already on the boundary maps to itself) -- same approximation
   * entities/ellipse.py uses, shared by hitTest() and (later) a NEAREST
   * osnap. Null if `pos` is exactly at the center.
   */
  nearestBoundaryPoint(pos: Point): Point | null {
    const dx = pos.x - this.center.x;
    const dy = pos.y - this.center.y;
    const cosR = Math.cos(-this.rotation);
    const sinR = Math.sin(-this.rotation);
    const lx = dx * cosR - dy * sinR;
    const ly = dx * sinR + dy * cosR;

    const denom = Math.hypot(lx / this.radiusX, ly / this.radiusY);
    if (denom === 0) return null;

    const k = 1 / denom;
    const boundaryLx = k * lx;
    const boundaryLy = k * ly;
    const cosPos = Math.cos(this.rotation);
    const sinPos = Math.sin(this.rotation);
    return {
      x: this.center.x + boundaryLx * cosPos - boundaryLy * sinPos,
      y: this.center.y + boundaryLx * sinPos + boundaryLy * cosPos,
    };
  }

  /** Flat world-unit distance to the approximate nearest boundary point --
   *  NOT a tolerance normalized by radius, which blows up for small
   *  ellipses (see entities/ellipse.py's own hitTest() docstring). */
  hitTest(pt: Point, tolerance = 3.0): boolean {
    if (this.radiusX <= 0 || this.radiusY <= 0) return false;

    const boundary = this.nearestBoundaryPoint(pt);
    if (boundary === null) return false;
    if (Math.hypot(pt.x - boundary.x, pt.y - boundary.y) > tolerance) return false;

    if (this.isFull()) return true;

    const angle = this.paramAngleOf(pt);
    const s = this.startAngle;
    const e = this.endAngle;
    return s <= e ? angle >= s && angle <= e : angle >= s || angle <= e;
  }

  serialize(): Record<string, unknown> {
    return {
      type: "ellipse",
      center: { x: this.center.x, y: this.center.y },
      radius_x: this.radiusX,
      radius_y: this.radiusY,
      rotation: (this.rotation * 180) / Math.PI,
      start_angle: (this.startAngle * 180) / Math.PI,
      end_angle: (this.endAngle * 180) / Math.PI,
      line_type: this.lineType,
      dxf_layer: this.dxfLayer,
      dxf_color: this.dxfColor,
      id: this.id,
    };
  }

  static fromDict(data: Record<string, unknown>): Ellipse {
    const center = data.center as { x: number; y: number };
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    return new Ellipse(
      { x: center.x, y: center.y },
      data.radius_x as number,
      data.radius_y as number,
      toRad((data.rotation as number | undefined) ?? 0),
      toRad((data.start_angle as number | undefined) ?? 0),
      toRad((data.end_angle as number | undefined) ?? 360),
      {
        lineType: (data.line_type as LineType | undefined) ?? "solid",
        dxfLayer: (data.dxf_layer as string | undefined) ?? "0",
        dxfColor: (data.dxf_color as number | null | undefined) ?? null,
        id: data.id as string | undefined,
      },
    );
  }
}
