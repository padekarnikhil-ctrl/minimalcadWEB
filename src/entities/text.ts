/**
 * MinimalCAD Web
 * entities/text.ts
 *
 * Ported from entities/text.py: a text-string annotation pinned by its
 * lower-left baseline insertion point, with a single rotation angle applied
 * about that point. Font metrics come from Canvas 2D's own measureText()
 * (this port's analogue of Qt's QFontMetricsF) via a lazily-created,
 * module-level offscreen canvas -- reused across every Text instance rather
 * than spinning one up per call. In a non-browser environment (Vitest's
 * "node" test environment has no `document`), measurement falls back to a
 * fixed-pitch approximation so geometry (bounds/hit-test/serialize) stays
 * fully testable without a real canvas.
 */

import type { Bounds, Point } from "../core/types";
import type { Entity, Viewport } from "./entity";
import { rotatePoint } from "./style";

export const DEFAULT_HEIGHT = 3.5;
const FONT_FAMILY = "sans-serif";
const COLOR_NORMAL = "#ffffff";
const COLOR_SELECTED = "#00ffff"; // matches entities/text.py's own distinct cyan, not the app-wide blue
const COLOR_PREVIEW = "#00ff00"; // matches entities/text.py's own distinct green preview, not just dashed

interface TextMetricsLite {
  width: number;
  ascent: number;
  descent: number;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx === undefined) {
    measureCtx =
      typeof document === "undefined" ? null : (document.createElement("canvas").getContext("2d") ?? null);
  }
  return measureCtx;
}

/** Local-frame text metrics at a given pixel font size. Falls back to a fixed-pitch
 *  approximation (no real font/canvas involved) when no canvas is available. */
function measureAt(text: string, fontPx: number): TextMetricsLite {
  const ctx = getMeasureCtx();
  if (ctx !== null) {
    ctx.font = `${fontPx}px ${FONT_FAMILY}`;
    const m = ctx.measureText(text);
    const ascent = m.actualBoundingBoxAscent || fontPx * 0.8;
    const descent = m.actualBoundingBoxDescent || fontPx * 0.2;
    return { width: m.width, ascent, descent };
  }
  return { width: text.length * fontPx * 0.6, ascent: fontPx * 0.8, descent: fontPx * 0.2 };
}

export class Text implements Entity {
  position: Point;
  text: string;
  height: number;
  rotation: number; // degrees, clockwise-on-screen -- same convention as style.ts's rotatePoint
  dxfLayer: string;
  dxfColor: number | null;
  // Unlike Line/Circle/Arc, Text carries no `id` field -- matches entities/text.py's
  // own constructor exactly (see entities/polyline.ts's identical precedent).

  constructor(
    position: Point,
    text: string,
    height = DEFAULT_HEIGHT,
    rotation = 0.0,
    dxfLayer = "0",
    dxfColor: number | null = null,
  ) {
    this.position = { ...position };
    this.text = text;
    this.height = height;
    this.rotation = ((rotation % 360) + 360) % 360;
    this.dxfLayer = dxfLayer;
    this.dxfColor = dxfColor;
  }

  /** Local-frame bounding rect (world units): origin at the insertion baseline,
   *  before rotation. [x0, y0, x1, y1] with y0 negative (text rises above baseline). */
  private measure(): [number, number, number, number] {
    const { width, ascent, descent } = measureAt(this.text, this.height);
    return [0, -ascent, width, descent];
  }

  private toWorld(local: Point): Point {
    const rad = (this.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: this.position.x + local.x * cos - local.y * sin,
      y: this.position.y + local.x * sin + local.y * cos,
    };
  }

  private toLocal(world: Point): Point {
    const dx = world.x - this.position.x;
    const dy = world.y - this.position.y;
    const rad = (-this.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
  }

  draw(ctx: CanvasRenderingContext2D, viewport: Viewport, preview = false): void {
    const screenPos = viewport.worldToScreen(this.position);
    const fontPx = this.height * viewport.zoom;
    const rad = (this.rotation * Math.PI) / 180;

    ctx.save();
    ctx.translate(screenPos.x, screenPos.y);
    ctx.rotate(rad);
    ctx.font = `${fontPx}px ${FONT_FAMILY}`;
    ctx.fillStyle = preview ? COLOR_PREVIEW : COLOR_NORMAL;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(this.text, 0, 0);
    ctx.restore();
  }

  drawSelected(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const screenPos = viewport.worldToScreen(this.position);
    const fontPx = this.height * viewport.zoom;
    const rad = (this.rotation * Math.PI) / 180;
    const [x0, y0, x1, y1] = this.measureScreenRect(fontPx);

    ctx.save();
    ctx.translate(screenPos.x, screenPos.y);
    ctx.rotate(rad);

    ctx.font = `${fontPx}px ${FONT_FAMILY}`;
    ctx.fillStyle = COLOR_SELECTED;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(this.text, 0, 0);

    ctx.strokeStyle = COLOR_SELECTED;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.setLineDash([]);

    // Fixed on-screen handle size at the insertion point, not zoom-scaled.
    const handle = 4.8;
    ctx.fillStyle = COLOR_SELECTED;
    ctx.fillRect(-handle / 2, -handle / 2, handle, handle);
    ctx.restore();
  }

  private measureScreenRect(fontPx: number): [number, number, number, number] {
    const { width, ascent, descent } = measureAt(this.text, fontPx);
    return [0, -ascent, width, descent];
  }

  move(dx: number, dy: number): void {
    this.position = { x: this.position.x + dx, y: this.position.y + dy };
  }

  rotate(cx: number, cy: number, angleRad: number): void {
    this.position = rotatePoint(this.position, cx, cy, angleRad);
    const updated = this.rotation + (angleRad * 180) / Math.PI;
    this.rotation = ((updated % 360) + 360) % 360; // JS `%` can be negative; Python's cannot
  }

  copy(): Text {
    return new Text(this.position, this.text, this.height, this.rotation, this.dxfLayer, this.dxfColor);
  }

  hitTest(pt: Point, tolerance = 2.0): boolean {
    const [x0, y0, x1, y1] = this.measure();
    const local = this.toLocal(pt);
    return (
      local.x >= x0 - tolerance &&
      local.x <= x1 + tolerance &&
      local.y >= y0 - tolerance &&
      local.y <= y1 + tolerance
    );
  }

  getBounds(): Bounds {
    const [x0, y0, x1, y1] = this.measure();
    const corners = [
      this.toWorld({ x: x0, y: y0 }),
      this.toWorld({ x: x1, y: y0 }),
      this.toWorld({ x: x0, y: y1 }),
      this.toWorld({ x: x1, y: y1 }),
    ];
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  serialize(): Record<string, unknown> {
    return {
      type: "text",
      position: [this.position.x, this.position.y],
      text: this.text,
      height: this.height,
      rotation: this.rotation,
      dxf_layer: this.dxfLayer,
      dxf_color: this.dxfColor,
    };
  }

  static fromDict(data: Record<string, unknown>): Text {
    const pos = (data.position as [number, number] | undefined) ?? [0, 0];
    return new Text(
      { x: pos[0], y: pos[1] },
      (data.text as string | undefined) ?? "",
      (data.height as number | undefined) ?? DEFAULT_HEIGHT,
      (data.rotation as number | undefined) ?? 0,
      (data.dxf_layer as string | undefined) ?? "0",
      (data.dxf_color as number | null | undefined) ?? null,
    );
  }
}
