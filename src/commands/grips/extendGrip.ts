/**
 * MinimalCAD Web
 * commands/grips/extendGrip.ts
 *
 * Ported from commands/extend_grip.py: drags one endpoint of a Line,
 * leaving the other fixed. Contextual-only, armed via begin().
 */

import type { Point } from "../../core/types";
import type { Line } from "../../entities/line";
import type { Engine } from "../../engine/engine";
import { BaseCommand } from "../base";
import { parsePoint } from "../../input/dynamicInput";

export class ExtendGripCommand extends BaseCommand {
  private entity: Line | null = null;
  private isStart = true;
  private currentPos: Point | null = null;

  constructor(engine: Engine) {
    super(engine);
  }

  start(): void {
    this.entity = null;
    this.currentPos = null;
    this.commandBar.setStatus("LINE", "Click an endpoint grip to extend it");
  }

  begin(entity: Line, isStart: boolean): void {
    this.entity = entity;
    this.isStart = isStart;
    this.currentPos = isStart ? { ...entity.startPoint } : { ...entity.endPoint };
    this.commandBar.setStatus("LINE", "Drag, or type a new point (x,y or dist<angle)");
    this.commandBar.enableInput();
    this.commandBar.setValue(`${this.currentPos.x.toFixed(2)}, ${this.currentPos.y.toFixed(2)}`);
  }

  leftClick(worldPos: Point): void {
    if (this.entity === null || this.currentPos === null) return;
    const { point } = this.engine.snap(worldPos, this.currentPos);
    this.execute(point);
  }

  mouseMove(worldPos: Point): void {
    if (this.entity === null || this.currentPos === null) return;
    const { point } = this.engine.snap(worldPos, this.currentPos);
    this.currentPos = point;
    this.commandBar.setLiveValue(`${point.x.toFixed(2)}, ${point.y.toFixed(2)}`);
    this.engine.requestRedraw();
  }

  textInput(text: string): void {
    if (this.entity === null || this.currentPos === null) return;
    const point = parsePoint(text, this.currentPos);
    if (point === null) {
      this.commandBar.setStatus("LINE", "Invalid - use x,y or dist<angle");
      return;
    }
    this.execute(point);
  }

  private execute(point: Point): void {
    this.undo.push(this.document.toDict());
    if (this.isStart) {
      this.entity!.startPoint = point;
    } else {
      this.entity!.endPoint = point;
    }
    this.engine.selection.clear();
    this.engine.cancelCommand();
    this.engine.requestRedraw();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.entity === null || this.currentPos === null) return;
    const ghost = this.entity.copy();
    if (this.isStart) ghost.startPoint = this.currentPos;
    else ghost.endPoint = this.currentPos;
    ghost.draw(ctx, this.engine.viewport, true);
  }

  cancel(): void {
    this.entity = null;
    this.currentPos = null;
    this.commandBar.setReady();
  }
}
