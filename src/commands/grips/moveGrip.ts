/**
 * MinimalCAD Web
 * commands/grips/moveGrip.ts
 *
 * Ported from commands/move_grip.py: relocates a whole entity by its
 * "move" anchor grip (Line midpoint / Circle center). Contextual-only --
 * entered directly via the grip hit-test in ui/canvasView.ts's mousedown,
 * not typeable, so start() alone leaves it inert; begin() arms it.
 */

import type { Point } from "../../core/types";
import type { Entity } from "../../entities/entity";
import type { Engine } from "../../engine/engine";
import { BaseCommand } from "../base";
import { parsePoint } from "../../input/dynamicInput";

export class MoveGripCommand extends BaseCommand {
  private entity: Entity | null = null;
  private anchor: Point | null = null;
  private currentDelta: Point = { x: 0, y: 0 };

  constructor(engine: Engine) {
    super(engine);
  }

  start(): void {
    this.entity = null;
    this.anchor = null;
    this.currentDelta = { x: 0, y: 0 };
    this.commandBar.setStatus("MOVE", "Click a shape's move grip to relocate it");
  }

  begin(entity: Entity, anchor: Point): void {
    this.entity = entity;
    this.anchor = { ...anchor };
    this.currentDelta = { x: 0, y: 0 };
    this.commandBar.setStatus("MOVE", "Drag, or type a new point (x,y or dist<angle)");
    this.commandBar.enableInput();
    this.commandBar.setValue(`${this.anchor.x.toFixed(2)}, ${this.anchor.y.toFixed(2)}`);
  }

  leftClick(worldPos: Point): void {
    if (this.entity === null || this.anchor === null) return;
    const { point } = this.engine.snap(worldPos, this.anchor);
    this.execute(point.x - this.anchor.x, point.y - this.anchor.y);
  }

  mouseMove(worldPos: Point): void {
    if (this.entity === null || this.anchor === null) return;
    const { point } = this.engine.snap(worldPos, this.anchor);
    this.currentDelta = { x: point.x - this.anchor.x, y: point.y - this.anchor.y };
    const newPoint = { x: this.anchor.x + this.currentDelta.x, y: this.anchor.y + this.currentDelta.y };
    this.commandBar.setLiveValue(`${newPoint.x.toFixed(2)}, ${newPoint.y.toFixed(2)}`);
    this.engine.requestRedraw();
  }

  textInput(text: string): void {
    if (this.entity === null || this.anchor === null) return;
    const point = parsePoint(text, this.anchor);
    if (point === null) {
      this.commandBar.setStatus("MOVE", "Invalid - use x,y or dist<angle");
      return;
    }
    this.execute(point.x - this.anchor.x, point.y - this.anchor.y);
  }

  private execute(dx: number, dy: number): void {
    this.undo.push(this.document.toDict());
    this.entity!.move(dx, dy);
    this.engine.selection.clear();
    this.engine.cancelCommand();
    this.engine.requestRedraw();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.entity === null) return;
    const ghost = this.entity.copy();
    ghost.move(this.currentDelta.x, this.currentDelta.y);
    ghost.draw(ctx, this.engine.viewport, true);
  }

  cancel(): void {
    this.entity = null;
    this.anchor = null;
    this.currentDelta = { x: 0, y: 0 };
    this.commandBar.setReady();
  }
}
