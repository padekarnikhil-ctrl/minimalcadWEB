/**
 * MinimalCAD Web
 * commands/registry.ts
 *
 * Ported from commands/registry.py's COMMAND_REGISTRY. name -> (factory,
 * typed-command-line aliases). Grows one entry per phase as more commands
 * come online.
 */

import type { CommandFactory } from "./types";
import { LineCommand } from "./line";
import { CircleCommand } from "./circle";
import { ArcCommand } from "./arc";
import { RectangleCommand } from "./rectangle";
import { MoveCommand } from "./move";
import { CopyCommand } from "./copy";
import { RotateCommand } from "./rotate";
import { ScaleCommand } from "./scale";
import { MirrorCommand } from "./mirror";
import { TrimCommand } from "./trim";
import { OffsetCommand } from "./offset";
import { FilletCommand } from "./fillet";
import { ChamferCommand } from "./chamfer";
import { TextCommand } from "./text";
import { MoveGripCommand } from "./grips/moveGrip";
import { ExtendGripCommand } from "./grips/extendGrip";
import { CircleResizeGripCommand } from "./grips/circleResizeGrip";

export interface RegistryEntry {
  factory: CommandFactory;
  aliases: string[];
}

export const COMMAND_REGISTRY: Record<string, RegistryEntry> = {
  line: { factory: (engine) => new LineCommand(engine), aliases: ["l"] },
  circle: { factory: (engine) => new CircleCommand(engine), aliases: ["c"] },
  arc: { factory: (engine) => new ArcCommand(engine), aliases: ["a"] },
  rectangle: { factory: (engine) => new RectangleCommand(engine), aliases: ["r", "rec"] },
  move: { factory: (engine) => new MoveCommand(engine), aliases: ["m"] },
  copy: { factory: (engine) => new CopyCommand(engine), aliases: ["co", "cp"] },
  rotate: { factory: (engine) => new RotateCommand(engine), aliases: ["ro"] },
  scale: { factory: (engine) => new ScaleCommand(engine), aliases: ["s"] },
  mirror: { factory: (engine) => new MirrorCommand(engine), aliases: ["mi"] },
  trim: { factory: (engine) => new TrimCommand(engine), aliases: ["t"] },
  offset: { factory: (engine) => new OffsetCommand(engine), aliases: ["o"] },
  fillet: { factory: (engine) => new FilletCommand(engine), aliases: ["f"] },
  chamfer: { factory: (engine) => new ChamferCommand(engine), aliases: ["cha"] },
  text: { factory: (engine) => new TextCommand(engine), aliases: ["x"] },
  // Contextual-only: entered directly via canvasView's grip hit-test, never typed.
  movegrip: { factory: (engine) => new MoveGripCommand(engine), aliases: [] },
  gripextend: { factory: (engine) => new ExtendGripCommand(engine), aliases: [] },
  gripresize: { factory: (engine) => new CircleResizeGripCommand(engine), aliases: [] },
};

/** Grip-entry-only commands excluded from blank-Enter "repeat last command" --
 *  a blank Enter after a grip edit shouldn't re-arm a grip tool with nothing to act on. */
export const NON_REPEATABLE = new Set<string>(["movegrip", "gripextend", "gripresize"]);
