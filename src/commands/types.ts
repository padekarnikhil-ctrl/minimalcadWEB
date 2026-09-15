/**
 * MinimalCAD Web
 * commands/types.ts
 *
 * The Command interface every command implements, ported from commands/base.py's
 * duck type -- `textInput` is an honest optional interface method here instead
 * of Python's hasattr() check.
 */

import type { Point } from "../core/types";
import type { Entity } from "../entities/entity";
import type { Engine } from "../engine/engine";

export interface Command {
  start(): void;
  leftClick(pt: Point): void;
  rightClick(pt: Point): void;
  mouseMove(pt: Point): void;
  keyPress(key: string): void;
  draw(ctx: CanvasRenderingContext2D): void;
  cancel(): void;
  textInput?(text: string): void;
}

/** Contextual grip-drag commands (move/extend/resize grips) aren't typeable
 *  and need an extra `begin(entity, extra)` call, right after start(), to
 *  actually arm them with which entity/grip was clicked -- see
 *  engine/picking.ts's GripHit and ui/canvasView.ts's mousedown handling. */
export interface GripCommand extends Command {
  begin(entity: Entity, extra: unknown): void;
}

/** Factory signature every command module exports -- CommandManager builds one
 *  singleton instance per registered name at startup (see commands/registry.ts). */
export type CommandFactory = (engine: Engine) => Command;
