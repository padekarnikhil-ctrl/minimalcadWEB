/**
 * MinimalCAD Web
 * commands/polarArray.ts
 *
 * Ported from commands/array_polar.py: pick object(s), pick a center point,
 * then type the total number of items -- the source stays put and
 * (count - 1) rotated copies are placed evenly around a full 360 degrees
 * about the center, as a single undo step.
 */

import type { Point } from "../core/types";
import type { Engine } from "../engine/engine";
import { PickTransformCommand } from "./transformBase";

const MAX_ITEMS = 1000;
const PREVIEW_CAP = 60; // sanity cap on live ghost-preview item count while typing

export class PolarArrayCommand extends PickTransformCommand {
  private state: 0 | 1 | 2 = 0;
  private centerPoint: Point | null = null;

  constructor(engine: Engine) {
    super(engine);
  }

  start(): void {
    const preSelected = this.preSelected();
    if (preSelected.length > 0) {
      this.targetEntities = preSelected;
      this.state = 1;
      this.commandBar.setStatus("ARRAY", `${preSelected.length} selected - Pick Center Point (or type x,y)`);
    } else {
      this.targetEntities = [];
      this.state = 0;
      this.commandBar.setStatus("ARRAY", "Select Object(s)");
    }
    this.centerPoint = null;
    this.commandBar.enableInput();
    this.engine.requestRedraw();
  }

  leftClick(worldPos: Point): void {
    if (this.state === 0) {
      const pick = this.pickTargetAt(worldPos);
      if (pick === null) return;
      this.targetEntities = [pick];
      this.state = 1;
      this.commandBar.setStatus("ARRAY", "Pick Center Point (or type x,y)");
    } else if (this.state === 1) {
      const { point } = this.engine.snap(worldPos);
      this.centerPoint = point;
      this.state = 2;
      this.commandBar.setStatus("ARRAY", "Number of Items (min 2)");
    }
    // State 2 (typed count) has no meaningful click action -- see textInput.
    this.engine.requestRedraw();
  }

  mouseMove(worldPos: Point): void {
    // Only the center-point pick step tracks the live cursor; the count step is typed-only.
    if (this.state !== 1) return;
    this.engine.snap(worldPos);
    this.engine.requestRedraw();
  }

  textInput(text: string): void {
    if (this.state === 2) {
      const raw = text.trim();
      const count = Number(raw);
      if (!Number.isInteger(count)) {
        this.commandBar.setStatus("ARRAY", "Invalid count - enter a whole number, 2 or more");
        return;
      }
      if (count < 2 || count > MAX_ITEMS) {
        this.commandBar.setStatus("ARRAY", `Invalid count - enter a number between 2 and ${MAX_ITEMS}`);
        return;
      }
      this.executeArray(count);
    }
    // State 1 (picking the center point) is click-only in this port, same as
    // most other point-pick states -- typed "x,y" support can be added
    // later if wanted, matching the desktop's parse_point() acceptance.
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.state >= 1) this.drawTargetsSelected(ctx);
    if (this.state !== 2 || this.centerPoint === null) return;

    const raw = this.commandBar.text().trim();
    const parsed = Number(raw);
    let previewCount = raw !== "" && Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
    previewCount = Math.min(previewCount, PREVIEW_CAP);

    const cx = this.centerPoint.x;
    const cy = this.centerPoint.y;
    for (let k = 1; k < previewCount; k++) {
      const angleRad = (2.0 * Math.PI * k) / previewCount;
      this.drawGhosts(ctx, (e) => e.rotate(cx, cy, angleRad));
    }

    // Small crosshair marker at the array center.
    const center = this.engine.viewport.worldToScreen(this.centerPoint);
    ctx.strokeStyle = "#1e90ff";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(center.x - 4, center.y);
    ctx.lineTo(center.x + 4, center.y);
    ctx.moveTo(center.x, center.y - 4);
    ctx.lineTo(center.x, center.y + 4);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  cancel(): void {
    this.state = 0;
    this.targetEntities = [];
    this.centerPoint = null;
    this.commandBar.setReady();
    this.engine.requestRedraw();
  }

  private executeArray(count: number): void {
    const cx = this.centerPoint!.x;
    const cy = this.centerPoint!.y;
    this.commitNew((entity) => {
      const copies = [];
      for (let k = 1; k < count; k++) {
        const angleRad = (2.0 * Math.PI * k) / count;
        const c = entity.copy();
        c.rotate(cx, cy, angleRad);
        copies.push(c);
      }
      return copies;
    });
  }
}
