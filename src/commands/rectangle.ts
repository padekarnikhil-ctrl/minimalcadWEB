/**
 * MinimalCAD Web
 * commands/rectangle.ts
 *
 * Ported from commands/rectangle.py: two-corner rectangle -> 4 independent
 * Line entities (NOT a distinct Rectangle entity type, and NOT a closed
 * Polyline) -- required for exact file compatibility with the desktop app,
 * which does the same decomposition.
 */

import type { Point } from "../core/types";
import type { Engine } from "../engine/engine";
import { BaseCommand } from "./base";
import { Line } from "../entities/line";
import { parsePoint, parseTwoPositiveFloats } from "../input/dynamicInput";

export class RectangleCommand extends BaseCommand {
  private state: 0 | 1 = 0;
  private firstCorner: Point | null = null;
  private currentMousePos: Point | null = null;

  constructor(engine: Engine) {
    super(engine);
  }

  start(): void {
    this.state = 0;
    this.firstCorner = null;
    this.currentMousePos = null;
    this.commandBar.setStatus("RECTANGLE", "Pick First Corner (or type x,y)");
    this.commandBar.enableInput();
    this.engine.requestRedraw();
  }

  leftClick(worldPos: Point): void {
    if (this.state === 0) {
      const { point } = this.engine.snap(worldPos);
      this.firstCorner = { ...point };
      this.currentMousePos = { ...point };
      this.state = 1;
      this.commandBar.setStatus("RECTANGLE", "Width: 0.00 | Height: 0.00 (or type w,h)");
      this.commandBar.enableInput();
    } else {
      const { point } = this.engine.snap(worldPos, this.firstCorner);
      this.commitOppositeCorner(point);
    }
    this.engine.requestRedraw();
  }

  private commitOppositeCorner(worldPos: Point): void {
    const width = Math.abs(worldPos.x - this.firstCorner!.x);
    const height = Math.abs(worldPos.y - this.firstCorner!.y);
    if (width === 0 || height === 0) return; // degenerate rectangle, silently rejected

    this.undo.push(this.document.toDict());
    const p1 = this.firstCorner!;
    const p2: Point = { x: worldPos.x, y: p1.y };
    const p3 = worldPos;
    const p4: Point = { x: p1.x, y: worldPos.y };
    this.document.addEntity(new Line(p1, p2));
    this.document.addEntity(new Line(p2, p3));
    this.document.addEntity(new Line(p3, p4));
    this.document.addEntity(new Line(p4, p1));
    this.start();
  }

  mouseMove(worldPos: Point): void {
    const reference = this.state === 1 ? this.firstCorner : null;
    const { point } = this.engine.snap(worldPos, reference);
    this.currentMousePos = point;

    if (this.state === 1 && this.firstCorner !== null) {
      const width = Math.abs(point.x - this.firstCorner.x);
      const height = Math.abs(point.y - this.firstCorner.y);
      this.commandBar.setStatus(
        "RECTANGLE",
        `Width: ${width.toFixed(2)} | Height: ${height.toFixed(2)} (or type w,h)`,
      );
    }
    this.engine.requestRedraw();
  }

  textInput(text: string): void {
    if (this.state === 0) {
      const point = parsePoint(text, null);
      if (point === null) {
        this.commandBar.setStatus("RECTANGLE", "Invalid point - use x,y");
        return;
      }
      this.firstCorner = point;
      this.currentMousePos = point;
      this.state = 1;
      this.commandBar.setStatus("RECTANGLE", "Width: 0.00 | Height: 0.00 (or type w,h)");
    } else {
      const dims = parseTwoPositiveFloats(text);
      if (dims === null) {
        this.commandBar.setStatus("RECTANGLE", "Invalid - enter width,height");
        return;
      }
      const [width, height] = dims;
      const mouse = this.currentMousePos ?? this.firstCorner!;
      const xDir = mouse.x >= this.firstCorner!.x ? 1 : -1;
      const yDir = mouse.y >= this.firstCorner!.y ? 1 : -1;
      this.commitOppositeCorner({
        x: this.firstCorner!.x + width * xDir,
        y: this.firstCorner!.y + height * yDir,
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 1 || this.firstCorner === null || this.currentMousePos === null) return;
    const viewport = this.engine.viewport;
    const p1 = viewport.worldToScreen(this.firstCorner);
    const p2 = viewport.worldToScreen({ x: this.currentMousePos.x, y: this.firstCorner.y });
    const p3 = viewport.worldToScreen(this.currentMousePos);
    const p4 = viewport.worldToScreen({ x: this.firstCorner.x, y: this.currentMousePos.y });

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  cancel(): void {
    this.state = 0;
    this.firstCorner = null;
    this.currentMousePos = null;
    this.commandBar.setReady();
    this.engine.requestRedraw();
  }
}
