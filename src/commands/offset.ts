/**
 * MinimalCAD Web
 * commands/offset.ts
 *
 * Ported from commands/offset.py. Distance is cached across uses (default
 * 10.0); a single click both indicates which side to offset toward AND
 * commits -- no separate confirm step. The original entity is always kept;
 * offset adds a new entity alongside it.
 */

import type { Point } from "../core/types";
import type { Entity } from "../entities/entity";
import type { Engine } from "../engine/engine";
import { BaseCommand } from "./base";
import { Line } from "../entities/line";
import { Circle } from "../entities/circle";
import { Arc } from "../entities/arc";
import { entityAt } from "../engine/picking";
import { parsePositiveFloat } from "../input/dynamicInput";

export class OffsetCommand extends BaseCommand {
  private targetEntity: Entity | null = null;
  private currentMousePos: Point | null = null;
  private distance = 10.0;

  constructor(engine: Engine) {
    super(engine);
  }

  start(): void {
    this.targetEntity = null;
    this.currentMousePos = null;
    this.commandBar.setStatus("OFFSET", `Select Entity (Distance: ${this.distance.toFixed(2)}, or type a new distance)`);
    this.commandBar.enableInput();
    this.engine.requestRedraw();
  }

  private isOffsettable(e: Entity): boolean {
    return e instanceof Line || e instanceof Circle || e instanceof Arc;
  }

  leftClick(worldPos: Point): void {
    if (this.targetEntity === null) {
      const candidates = this.document.getEntities().filter((e) => this.isOffsettable(e));
      const hit = entityAt(candidates, worldPos, this.engine.pickTolerance());
      if (hit === null) return;
      this.targetEntity = hit;
      this.currentMousePos = { ...worldPos };
      this.commandBar.setStatus("OFFSET", "Click Offset Side");
    } else {
      this.currentMousePos = { ...worldPos };
      this.executeOffset();
    }
    this.engine.requestRedraw();
  }

  mouseMove(worldPos: Point): void {
    if (this.targetEntity === null) return;
    this.currentMousePos = worldPos;
    this.engine.requestRedraw();
  }

  textInput(text: string): void {
    const distance = parsePositiveFloat(text);
    if (distance === null) {
      this.commandBar.setStatus("OFFSET", "Invalid - enter a positive distance");
      return;
    }
    this.distance = distance;
    this.start();
  }

  private calculateOffsetGeometry(sidePos: Point): Entity | null {
    const entity = this.targetEntity!;
    if (entity instanceof Line) {
      const x1 = entity.startPoint.x, y1 = entity.startPoint.y;
      const x2 = entity.endPoint.x, y2 = entity.endPoint.y;
      const dx = x2 - x1, dy = y2 - y1;
      const length = Math.hypot(dx, dy);
      if (length === 0) return null;
      let nx = -dy / length, ny = dx / length;
      const cross = (x2 - x1) * (sidePos.y - y1) - (y2 - y1) * (sidePos.x - x1);
      if (cross < 0) {
        nx = -nx;
        ny = -ny;
      }
      const ox = nx * this.distance, oy = ny * this.distance;
      return new Line({ x: x1 + ox, y: y1 + oy }, { x: x2 + ox, y: y2 + oy }, { lineType: entity.lineType });
    }
    if (entity instanceof Circle || entity instanceof Arc) {
      const clickDist = Math.hypot(sidePos.x - entity.center.x, sidePos.y - entity.center.y);
      const newRadius = clickDist >= entity.radius ? entity.radius + this.distance : entity.radius - this.distance;
      if (newRadius <= 0.01) return null;
      return entity instanceof Circle
        ? new Circle(entity.center, newRadius, { lineType: entity.lineType })
        : new Arc(entity.center, newRadius, entity.startAngle, entity.endAngle, { lineType: entity.lineType });
    }
    return null;
  }

  private executeOffset(): void {
    const newEntity = this.calculateOffsetGeometry(this.currentMousePos!);
    if (newEntity === null) {
      this.start();
      return;
    }
    this.undo.push(this.document.toDict());
    this.document.addEntity(newEntity);
    this.start();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.targetEntity === null) return;
    this.targetEntity.drawSelected(ctx, this.engine.viewport);

    if (this.currentMousePos !== null) {
      const preview = this.calculateOffsetGeometry(this.currentMousePos);
      preview?.draw(ctx, this.engine.viewport, true);
    }
  }

  cancel(): void {
    this.targetEntity = null;
    this.currentMousePos = null;
    this.commandBar.setReady();
    this.engine.requestRedraw();
  }
}
