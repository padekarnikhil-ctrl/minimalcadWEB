/**
 * MinimalCAD Web
 * commands/line.ts
 *
 * Ported from commands/line.py: multi-segment continuous line chaining --
 * after each committed segment, state loops back to "pick next point" (not
 * back to "pick first point"), so consecutive clicks trace a connected
 * polyline of independent Line entities without re-invoking the tool.
 */

import type { Point } from "../core/types";
import type { Engine } from "../engine/engine";
import { BaseCommand } from "./base";
import { Line } from "../entities/line";
import { parsePoint } from "../input/dynamicInput";

export class LineCommand extends BaseCommand {
  private state: 0 | 1 = 0;
  private startPoint: Point | null = null;
  private currentMousePos: Point | null = null;

  constructor(engine: Engine) {
    super(engine);
  }

  start(): void {
    this.state = 0;
    this.startPoint = null;
    this.currentMousePos = null;
    this.commandBar.setStatus("LINE", "Pick First Point (or type x,y)");
    this.commandBar.disableDualInput();
    this.commandBar.enableInput();
    this.engine.requestRedraw();
  }

  private currentAngle(): number {
    if (this.startPoint === null || this.currentMousePos === null) return 0;
    const dx = this.currentMousePos.x - this.startPoint.x;
    const dy = this.currentMousePos.y - this.startPoint.y;
    if (dx === 0 && dy === 0) return 0;
    return Math.atan2(dy, dx);
  }

  leftClick(worldPos: Point): void {
    if (this.state === 0) {
      const { point } = this.engine.snap(worldPos);
      this.startPoint = point;
      this.currentMousePos = point;
      this.state = 1;
      this.commandBar.setStatus("LINE", "Pick Next Point (Tab: Distance -> Angle, Enter to commit)");
      this.commandBar.enableDualInput("0.00", "0.0");
      this.engine.requestRedraw();
    } else {
      const { point, snapType } = this.engine.snap(worldPos, this.startPoint);
      const resolved = snapType === null ? this.engine.applyOrtho(this.startPoint!, point) : point;
      this.commitNextPoint(resolved);
    }
  }

  private commitNextPoint(worldPos: Point): void {
    const snapshotBefore = this.document.toDict();
    this.document.addEntity(new Line(this.startPoint!, worldPos));
    this.undo.push(snapshotBefore);

    this.startPoint = worldPos;
    this.currentMousePos = worldPos;
    this.state = 1;
    this.commandBar.setStatus("LINE", "Pick Next Point (Tab: Distance -> Angle, Enter to commit)");
    this.commandBar.enableDualInput("0.00", "0.0");
    this.engine.requestRedraw();
  }

  mouseMove(worldPos: Point): void {
    const reference = this.state === 1 ? this.startPoint : null;
    const { point, snapType } = this.engine.snap(worldPos, reference);
    const resolved =
      this.state === 1 && snapType === null ? this.engine.applyOrtho(this.startPoint!, point) : point;
    this.currentMousePos = resolved;

    if (this.state !== 1 || this.startPoint === null) return;

    const distance = Math.hypot(
      this.currentMousePos.x - this.startPoint.x,
      this.currentMousePos.y - this.startPoint.y,
    );
    const angleDeg = (this.currentAngle() * 180) / Math.PI;
    this.commandBar.setLiveValue(distance.toFixed(2));
    this.commandBar.setLiveAngle(angleDeg.toFixed(1));
    this.engine.requestRedraw();
  }

  textInput(text: string): void {
    if (this.state === 0) {
      const point = parsePoint(text, null);
      if (point === null) {
        this.commandBar.setStatus("LINE", "Invalid point - use x,y");
        return;
      }
      this.startPoint = point;
      this.currentMousePos = point;
      this.state = 1;
      this.commandBar.setStatus("LINE", "Pick Next Point (Tab: Distance -> Angle, Enter to commit)");
      this.commandBar.enableDualInput("0.00", "0.0");
    } else {
      const point = parsePoint(text, this.startPoint, this.currentAngle());
      if (point === null) {
        this.commandBar.setStatus("LINE", "Invalid - use x,y, dist<angle, or a bare distance");
        return;
      }
      this.commitNextPoint(point);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 1 || this.startPoint === null || this.currentMousePos === null) return;
    const ghost = new Line(this.startPoint, this.currentMousePos);
    ghost.draw(ctx, this.engine.viewport, true);
  }

  cancel(): void {
    this.state = 0;
    this.startPoint = null;
    this.currentMousePos = null;
    this.commandBar.setReady();
    this.engine.requestRedraw();
  }
}
