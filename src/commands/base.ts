/**
 * MinimalCAD Web
 * commands/base.ts
 *
 * Ported from commands/base.py's BaseCommand: shared constructor plumbing +
 * default no-op behavior every concrete command overrides selectively.
 */

import type { Point } from "../core/types";
import type { Engine } from "../engine/engine";
import type { Command } from "./types";

export abstract class BaseCommand implements Command {
  protected engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  protected get document() {
    return this.engine.document;
  }
  protected get undo() {
    return this.engine.undo;
  }
  protected get commandBar() {
    return this.engine.commandBar;
  }

  abstract start(): void;

  leftClick(_pt: Point): void {}

  /** Default: right click cancels the command. */
  rightClick(_pt: Point): void {
    this.engine.cancelCommand();
  }

  mouseMove(_pt: Point): void {}
  keyPress(_key: string): void {}
  draw(_ctx: CanvasRenderingContext2D): void {}

  cancel(): void {
    this.commandBar.setReady();
  }
}
