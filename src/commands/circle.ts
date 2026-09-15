/**
 * MinimalCAD Web
 * commands/circle.ts
 *
 * Ported from commands/circle.py: two-click center-radius circle creation.
 */

import type { Point } from "../core/types";
import type { Engine } from "../engine/engine";
import { BaseCommand } from "./base";
import { Circle } from "../entities/circle";
import { parseCircleRadius, parsePoint } from "../input/dynamicInput";

export class CircleCommand extends BaseCommand {
  private state: 0 | 1 = 0;
  private center: Point | null = null;
  private currentMousePos: Point | null = null;

  constructor(engine: Engine) {
    super(engine);
  }

  start(): void {
    this.state = 0;
    this.center = null;
    this.currentMousePos = null;
    this.commandBar.setStatus("CIRCLE", "Pick Center Point (or type x,y)");
    this.commandBar.enableInput();
    this.engine.requestRedraw();
  }

  private commitRadius(radius: number): void {
    if (radius <= 0) return;
    this.undo.push(this.document.toDict());
    this.document.addEntity(new Circle(this.center!, radius));
    this.start();
  }

  leftClick(worldPos: Point): void {
    if (this.state === 0) {
      const { point } = this.engine.snap(worldPos);
      this.center = point;
      this.currentMousePos = point;
      this.state = 1;
      this.commandBar.setStatus("CIRCLE", "Radius: 0.00 (or type r25/d25)");
      this.commandBar.enableInput();
    } else {
      const { point } = this.engine.snap(worldPos, this.center);
      const radius = Math.hypot(point.x - this.center!.x, point.y - this.center!.y);
      this.commitRadius(radius);
    }
    this.engine.requestRedraw();
  }

  mouseMove(worldPos: Point): void {
    const reference = this.state === 1 ? this.center : null;
    const { point } = this.engine.snap(worldPos, reference);
    this.currentMousePos = point;

    if (this.state === 1 && this.center !== null) {
      const radius = Math.hypot(point.x - this.center.x, point.y - this.center.y);
      this.commandBar.setStatus("CIRCLE", `Radius: ${radius.toFixed(2)} (or type r25/d25)`);
    }
    this.engine.requestRedraw();
  }

  textInput(text: string): void {
    if (this.state === 0) {
      const point = parsePoint(text, null);
      if (point === null) {
        this.commandBar.setStatus("CIRCLE", "Invalid point - use x,y");
        return;
      }
      this.center = point;
      this.currentMousePos = point;
      this.state = 1;
      this.commandBar.setStatus("CIRCLE", "Radius: 0.00 (or type r25/d25)");
    } else {
      const radius = parseCircleRadius(text);
      if (radius === null) {
        this.commandBar.setStatus("CIRCLE", "Invalid - enter r<value> or d<value> (e.g. r25 or d25)");
        return;
      }
      this.commitRadius(radius);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 1 || this.center === null || this.currentMousePos === null) return;
    const radius = Math.hypot(
      this.currentMousePos.x - this.center.x,
      this.currentMousePos.y - this.center.y,
    );
    if (radius <= 0) return;
    const ghost = new Circle(this.center, radius);
    ghost.draw(ctx, this.engine.viewport, true);
  }

  cancel(): void {
    this.state = 0;
    this.center = null;
    this.currentMousePos = null;
    this.commandBar.setReady();
    this.engine.requestRedraw();
  }
}
