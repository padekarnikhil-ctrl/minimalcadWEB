/**
 * MinimalCAD Web
 * commands/text.ts
 *
 * Ported from commands/text.py: a 3-state loop -- pick the insertion point,
 * confirm/override the (persisted-across-placements) text height, then type
 * the text string -- looping back to state 0 for continuous annotation
 * placement. Simpler than the Python source's own version: Python needed a
 * one-off Qt signal connect/disconnect dance to route the CommandBar's Enter
 * key to a *different* handler in state 2 than state 1; this port's
 * `textInput()` is already called generically for every submission while
 * the command is active, so both states just branch on `this.state` inside
 * it directly.
 */

import type { Point } from "../core/types";
import type { Engine } from "../engine/engine";
import { BaseCommand } from "./base";
import { Text, DEFAULT_HEIGHT } from "../entities/text";
import { evalNumber } from "../input/dynamicInput";

export class TextCommand extends BaseCommand {
  // State 0: Pick Insertion Point, 1: Confirm/Set Height, 2: Enter Text String
  private state: 0 | 1 | 2 = 0;
  private insertionPoint: Point = { x: 0, y: 0 };

  // Persists across placements (and tool re-activation), same convention as
  // Fillet's radius / Chamfer's distance.
  private height = DEFAULT_HEIGHT;

  constructor(engine: Engine) {
    super(engine);
  }

  start(): void {
    this.state = 0;
    this.commandBar.setStatus("TEXT", "Pick Insertion Point");
    this.commandBar.clear();
    this.commandBar.disableInput();
    this.engine.requestRedraw();
  }

  leftClick(worldPos: Point): void {
    if (this.state !== 0) return;

    const { point } = this.engine.snap(worldPos);
    this.insertionPoint = { ...point };
    this.state = 1;
    this.commandBar.setStatus("TEXT", `Text Height <${this.height.toFixed(2)}> (Enter to keep, or type a new value)`);
    this.commandBar.enableInput();
    this.engine.requestRedraw();
  }

  mouseMove(worldPos: Point): void {
    if (this.state === 0) {
      this.engine.snap(worldPos); // updates the snap marker only; no local preview point needed pre-pick
      this.engine.requestRedraw();
    }
  }

  textInput(text: string): void {
    if (this.state === 1) {
      const raw = text.trim();
      if (raw) {
        const value = evalNumber(raw);
        if (value === null || value <= 0) {
          this.commandBar.setStatus("TEXT", "Invalid height - enter a positive number");
          return;
        }
        this.height = value;
      }
      this.state = 2;
      this.commandBar.setStatus("TEXT", "Enter Text:");
      this.commandBar.enableInput();
      this.engine.requestRedraw();
      return;
    }

    if (this.state === 2) {
      const clean = text.trim();
      if (!clean) return; // ignore empty strings, keep focus for another attempt

      this.undo.push(this.document.toDict());
      this.document.addEntity(new Text(this.insertionPoint, clean, this.height));

      this.state = 0;
      this.commandBar.setStatus("TEXT", "Pick Insertion Point");
      this.commandBar.disableInput();
      this.engine.requestRedraw();
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 2) return;
    const preview = this.commandBar.text() || "Text";
    new Text(this.insertionPoint, preview, this.height).draw(ctx, this.engine.viewport, true);
  }

  cancel(): void {
    this.state = 0;
    this.commandBar.setReady();
    this.engine.requestRedraw();
  }
}
