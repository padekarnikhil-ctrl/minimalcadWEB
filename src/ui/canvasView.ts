/**
 * MinimalCAD Web
 * ui/canvasView.ts
 *
 * Owns the <canvas> element: HiDPI-correct backing-store sizing, the
 * pan/zoom/grid/entity/selection/command-preview render pass, and
 * dispatches mouse/keyboard events (converted to world coordinates) into
 * the Engine -- the direct analogue of graphics/canvas.py's
 * mousePressEvent/mouseMoveEvent/wheelEvent/keyPressEvent.
 *
 * HiDPI note: viewport.zoom/panOffset and every mouse-event coordinate stay
 * in CSS-pixel space throughout. devicePixelRatio only ever enters the
 * picture via the one-time backing-store resize and the per-frame
 * ctx.scale(dpr, dpr) below -- mixing CSS-pixel and device-pixel coordinates
 * anywhere else would silently break picking/pan/zoom.
 */

import { computeGridLines } from "../engine/grid";
import { entityAt, gripAt } from "../engine/picking";
import type { Viewport } from "../engine/viewport";
import type { Bounds, Point } from "../core/types";
import type { Entity } from "../entities/entity";
import type { Engine } from "../engine/engine";
import type { GripCommand } from "../commands/types";

const COLOR_BACKGROUND = "#1e1e1e";
const COLOR_GRID = "#2d2d2d";
const COLOR_AXIS = "#454545";
const COLOR_WINDOW_SELECT = "rgba(80, 140, 255, 1)";
const COLOR_CROSSING_SELECT = "rgba(90, 210, 110, 1)";
const COLOR_SNAP_MARKER = "#ffff00";
const SNAP_MARKER_SCREEN_SIZE = 9.0;

const GRIP_COMMAND_NAMES: Record<"line_extend" | "move_grip" | "circle_resize", string> = {
  line_extend: "gripextend",
  move_grip: "movegrip",
  circle_resize: "gripresize",
};

export class CanvasView {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly viewport: Viewport;
  private engine: Engine;

  private isPanning = false;
  private lastPanScreenPos: Point = { x: 0, y: 0 };
  private redrawScheduled = false;
  private homeInitialized = false;
  private commandBuffer = "";

  // Rubber-band window/crossing selection state.
  private selectOrigin: Point | null = null;
  private selectCurrent: Point | null = null;
  private selectActive = false;
  private selectAdditive = false;

  // Direct click-and-drag body relocation (armed by a plain, non-Shift click
  // that hits an entity body, resolved on move/release).
  private dragEntities: Entity[] | null = null;
  private dragLastPos: Point | null = null;
  private dragMoved = false;

  constructor(canvas: HTMLCanvasElement, viewport: Viewport, engine: Engine) {
    this.canvas = canvas;
    this.viewport = viewport;
    this.engine = engine;

    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;

    this.resizeToDisplaySize();
    window.addEventListener("resize", () => this.resizeToDisplaySize());

    this.canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    this.canvas.addEventListener("mousedown", (e) => this.onMouseDown(e));
    this.canvas.addEventListener("mousemove", (e) => this.onMouseMove(e));
    this.canvas.addEventListener("mouseup", (e) => this.onMouseUp(e));
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.addEventListener("keydown", (e) => this.onKeyDown(e));
    this.canvas.addEventListener("mouseleave", () => {
      this.engine.clearSnapFeedback();
      this.requestRedraw();
    });

    this.requestRedraw();
  }

  /** Batches repaint requests into at most one per animation frame. */
  requestRedraw(): void {
    if (this.redrawScheduled) return;
    this.redrawScheduled = true;
    requestAnimationFrame(() => {
      this.redrawScheduled = false;
      this.render();
    });
  }

  private resizeToDisplaySize(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);

    if (!this.homeInitialized && width > 0 && height > 0) {
      this.viewport.resetView();
      this.homeInitialized = true;
    }
    this.requestRedraw();
  }

  private eventToScreenPoint(e: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.viewport.zoomAtCursor(this.eventToScreenPoint(e), e.deltaY);
    this.requestRedraw();
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button === 1) {
      this.isPanning = true;
      this.lastPanScreenPos = this.eventToScreenPoint(e);
      this.canvas.style.cursor = "grabbing";
      e.preventDefault();
      return;
    }

    const worldPos = this.viewport.screenToWorld(this.eventToScreenPoint(e));
    const commandActive = this.engine.commandManager.currentCommand !== null;

    if (commandActive) {
      if (e.button === 0) this.engine.commandManager.leftClick(worldPos);
      else if (e.button === 2) this.engine.commandManager.rightClick(worldPos);
      this.engine.commandBar.enableInput();
      this.requestRedraw();
      return;
    }

    if (e.button !== 0) return; // no command active: only left-click drives selection/grips

    const tolerance = this.engine.pickTolerance();
    const gripHit = gripAt(this.engine.selection, worldPos, tolerance);
    if (gripHit !== null) {
      const commandName = GRIP_COMMAND_NAMES[gripHit.kind];
      this.engine.commandManager.startCommand(commandName);
      const grip = this.engine.commandManager.currentCommand as GripCommand | null;
      grip?.begin(gripHit.entity, gripHit.extra);
      this.requestRedraw();
      return;
    }

    const hit = entityAt(this.engine.document.getEntities(), worldPos, tolerance);
    if (hit !== null) {
      const shiftHeld = e.shiftKey;
      this.applySelectionPick(hit, shiftHeld);
      if (!shiftHeld) {
        this.dragEntities = this.engine.selection.getEntities();
        this.dragLastPos = worldPos;
        this.dragMoved = false;
      }
    } else {
      this.selectOrigin = worldPos;
      this.selectCurrent = worldPos;
      this.selectActive = false;
      this.selectAdditive = e.shiftKey;
    }

    this.requestRedraw();
  }

  private applySelectionPick(entity: Entity, shiftHeld: boolean): void {
    if (shiftHeld) {
      if (this.engine.selection.isSelected(entity)) {
        this.engine.selection.deselect(entity);
      } else {
        this.engine.selection.select(entity);
      }
    } else {
      this.engine.selection.clear();
      this.engine.selection.select(entity);
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.isPanning) {
      const current = this.eventToScreenPoint(e);
      const delta = { x: current.x - this.lastPanScreenPos.x, y: current.y - this.lastPanScreenPos.y };
      this.viewport.pan(delta);
      this.lastPanScreenPos = current;
      this.requestRedraw();
      return;
    }

    const worldPos = this.viewport.screenToWorld(this.eventToScreenPoint(e));

    if (this.dragEntities !== null && this.dragLastPos !== null) {
      const delta = { x: worldPos.x - this.dragLastPos.x, y: worldPos.y - this.dragLastPos.y };
      if (!this.dragMoved) {
        const threshold = this.engine.pickTolerance(3.0);
        if (Math.abs(delta.x) < threshold && Math.abs(delta.y) < threshold) {
          return; // sub-threshold jitter -- don't pollute undo with a no-op click
        }
        this.engine.undo.push(this.engine.document.toDict());
        this.dragMoved = true;
      }
      for (const entity of this.dragEntities) entity.move(delta.x, delta.y);
      this.dragLastPos = worldPos;
      this.requestRedraw();
      return;
    }

    if (this.selectOrigin !== null) {
      this.selectCurrent = worldPos;
      this.selectActive = true;
      this.requestRedraw();
      return;
    }

    this.engine.commandManager.mouseMove(worldPos);
    this.requestRedraw();
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 1) {
      this.isPanning = false;
      this.canvas.style.cursor = "crosshair";
      return;
    }

    if (e.button !== 0) return;

    if (this.dragEntities !== null) {
      this.dragEntities = null;
      this.dragLastPos = null;
      this.dragMoved = false;
      return;
    }

    if (this.selectOrigin !== null) {
      if (this.selectActive) {
        this.finishBoxSelect();
      } else if (!this.selectAdditive) {
        this.engine.selection.clear();
      }
      this.selectOrigin = null;
      this.selectCurrent = null;
      this.selectActive = false;
      this.requestRedraw();
    }
  }

  private finishBoxSelect(): void {
    if (this.selectOrigin === null || this.selectCurrent === null) return;
    const x0 = Math.min(this.selectOrigin.x, this.selectCurrent.x);
    const x1 = Math.max(this.selectOrigin.x, this.selectCurrent.x);
    const y0 = Math.min(this.selectOrigin.y, this.selectCurrent.y);
    const y1 = Math.max(this.selectOrigin.y, this.selectCurrent.y);
    const leftToRight = this.selectCurrent.x >= this.selectOrigin.x;

    if (!this.selectAdditive) this.engine.selection.clear();

    for (const entity of this.engine.document.getEntities()) {
      const [ex0, ey0, ex1, ey1] = entity.getBounds();
      const hit = leftToRight
        ? ex0 >= x0 && ex1 <= x1 && ey0 >= y0 && ey1 <= y1 // window: fully enclosed
        : ex0 <= x1 && ex1 >= x0 && ey0 <= y1 && ey1 >= y0; // crossing: any overlap
      if (hit) this.engine.selection.select(entity);
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === "F8") {
      this.engine.toggleOrtho();
      e.preventDefault();
      this.requestRedraw();
      return;
    }

    if (e.key === "Escape") {
      this.engine.cancelCommand(); // also clears snap feedback -- see engine/engine.ts
      this.commandBuffer = "";
      this.engine.selection.clear();
      this.selectOrigin = null;
      this.selectCurrent = null;
      this.selectActive = false;
      this.dragEntities = null;
      this.dragLastPos = null;
      this.dragMoved = false;
      this.engine.commandBar.setReady();
      e.preventDefault();
      this.requestRedraw();
      return;
    }

    const commandActive = this.engine.commandManager.currentCommand !== null;

    if (commandActive) {
      this.engine.commandManager.keyPress(e.key);
      return;
    }

    if (e.key === " " || e.code === "Space") {
      // Zoom Extents -- same as the Home/Zoom Extents toolbar button.
      this.engine.zoomExtents();
      e.preventDefault();
      return;
    }

    if (e.key === "Delete" || (e.key === "Backspace" && this.commandBuffer === "")) {
      this.engine.deleteSelected();
      e.preventDefault();
      this.requestRedraw();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (this.commandBuffer !== "") {
        this.engine.commandManager.tryStartFromText(this.commandBuffer);
        this.commandBuffer = "";
      } else {
        this.engine.commandManager.repeatLast();
      }
      this.requestRedraw();
      return;
    }
    if (e.key === "Backspace" && this.commandBuffer !== "") {
      this.commandBuffer = this.commandBuffer.slice(0, -1);
      this.engine.commandBar.setTypedCommand(this.commandBuffer);
      e.preventDefault();
      return;
    }
    if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
      this.commandBuffer += e.key.toLowerCase();
      this.engine.commandBar.setTypedCommand(this.commandBuffer);
      e.preventDefault();
    }
  }

  private render(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const ctx = this.ctx;

    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = COLOR_BACKGROUND;
    ctx.fillRect(0, 0, width, height);

    this.drawGrid();
    this.drawEntities();
    this.drawSelectionHighlights();
    this.drawSelectionBox();
    this.engine.commandManager.draw(this.ctx);
    this.drawSnapMarker();

    ctx.restore();
  }

  /** Distinct glyph per osnap type, drawn at a fixed on-screen pixel size
   *  regardless of zoom, matching the desktop app's own marker set. */
  private drawSnapMarker(): void {
    const point = this.engine.activeSnapPoint;
    const type = this.engine.activeSnapType;
    if (point === null || type === null) return;

    const { x, y } = this.viewport.worldToScreen(point);
    const half = SNAP_MARKER_SCREEN_SIZE / 2;
    const ctx = this.ctx;

    ctx.save();
    ctx.strokeStyle = COLOR_SNAP_MARKER;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([]);

    switch (type) {
      case "ENDPOINT":
        ctx.strokeRect(x - half, y - half, SNAP_MARKER_SCREEN_SIZE, SNAP_MARKER_SCREEN_SIZE);
        break;
      case "MIDPOINT":
        ctx.beginPath();
        ctx.moveTo(x, y - half);
        ctx.lineTo(x - half, y + half);
        ctx.lineTo(x + half, y + half);
        ctx.closePath();
        ctx.stroke();
        break;
      case "CENTER":
        ctx.beginPath();
        ctx.arc(x, y, half * 0.85, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "QUADRANT":
        ctx.beginPath();
        ctx.moveTo(x, y - half);
        ctx.lineTo(x + half, y);
        ctx.lineTo(x, y + half);
        ctx.lineTo(x - half, y);
        ctx.closePath();
        ctx.stroke();
        break;
      case "INTERSECTION":
        ctx.beginPath();
        ctx.moveTo(x - half, y - half);
        ctx.lineTo(x + half, y + half);
        ctx.moveTo(x + half, y - half);
        ctx.lineTo(x - half, y + half);
        ctx.stroke();
        break;
      case "PERPENDICULAR":
        ctx.strokeRect(x - half, y - half, SNAP_MARKER_SCREEN_SIZE, SNAP_MARKER_SCREEN_SIZE);
        ctx.beginPath();
        ctx.moveTo(x - half, y);
        ctx.lineTo(x - half + half * 0.6, y);
        ctx.lineTo(x - half + half * 0.6, y - half * 0.6);
        ctx.stroke();
        break;
      case "TANGENT":
        ctx.beginPath();
        ctx.arc(x, y, half, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - half, y + half);
        ctx.lineTo(x + half, y + half);
        ctx.stroke();
        break;
      default: // NEAREST / unstyled fallback -- plain crosshair
        ctx.beginPath();
        ctx.moveTo(x - half, y);
        ctx.lineTo(x + half, y);
        ctx.moveTo(x, y - half);
        ctx.lineTo(x, y + half);
        ctx.stroke();
        break;
    }

    ctx.restore();
  }

  private drawEntities(): void {
    const visible = this.viewport.visibleWorldRect();
    for (const entity of this.engine.document.getEntities()) {
      if (entityVisible(entity.getBounds(), visible)) {
        entity.draw(this.ctx, this.viewport, false);
      }
    }
  }

  private drawSelectionHighlights(): void {
    for (const entity of this.engine.selection.getEntities()) {
      entity.drawSelected(this.ctx, this.viewport);
    }
  }

  private drawSelectionBox(): void {
    if (!this.selectActive || this.selectOrigin === null || this.selectCurrent === null) return;
    const leftToRight = this.selectCurrent.x >= this.selectOrigin.x;
    const color = leftToRight ? COLOR_WINDOW_SELECT : COLOR_CROSSING_SELECT;

    const p1 = this.viewport.worldToScreen(this.selectOrigin);
    const p2 = this.viewport.worldToScreen(this.selectCurrent);
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);

    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash(leftToRight ? [] : [4, 4]);
    this.ctx.fillStyle = color.replace("1)", "0.15)");
    this.ctx.fillRect(x, y, w, h);
    this.ctx.strokeRect(x, y, w, h);
    this.ctx.restore();
  }

  private drawGrid(): void {
    const { verticals, horizontals } = computeGridLines(this.viewport);
    const ctx = this.ctx;
    const height = this.canvas.clientHeight;
    const width = this.canvas.clientWidth;

    ctx.lineWidth = 1;

    for (const { x, isAxis } of verticals) {
      const sx = this.viewport.worldToScreen({ x, y: 0 }).x;
      ctx.strokeStyle = isAxis ? COLOR_AXIS : COLOR_GRID;
      ctx.beginPath();
      ctx.moveTo(sx + 0.5, 0);
      ctx.lineTo(sx + 0.5, height);
      ctx.stroke();
    }

    for (const { y, isAxis } of horizontals) {
      const sy = this.viewport.worldToScreen({ x: 0, y }).y;
      ctx.strokeStyle = isAxis ? COLOR_AXIS : COLOR_GRID;
      ctx.beginPath();
      ctx.moveTo(0, sy + 0.5);
      ctx.lineTo(width, sy + 0.5);
      ctx.stroke();
    }
  }
}

function entityVisible(entityBounds: Bounds, visibleRect: Bounds): boolean {
  const [ex0, ey0, ex1, ey1] = entityBounds;
  const [vx0, vy0, vx1, vy1] = visibleRect;
  return ex1 >= vx0 && ex0 <= vx1 && ey1 >= vy0 && ey0 <= vy1;
}
