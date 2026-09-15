/**
 * MinimalCAD Web
 * main.ts
 *
 * Phase C entry point: real command architecture (Line, Circle), dynamic
 * input via the CommandBar, and a toolbar -- wires Viewport + CommandBar +
 * Engine + CanvasView together, sharing one Viewport instance between the
 * renderer and the command context.
 */

import "./style.css";
import { CanvasView } from "./ui/canvasView";
import { CommandBar } from "./ui/commandBar";
import { buildToolbar } from "./ui/toolbar";
import { Viewport } from "./engine/viewport";
import { Engine } from "./engine/engine";

const canvasEl = document.getElementById("cad-canvas");
if (!(canvasEl instanceof HTMLCanvasElement)) {
  throw new Error("#cad-canvas element not found");
}
const toolbarEl = document.getElementById("toolbar");
if (toolbarEl === null) throw new Error("#toolbar element not found");
const commandBarEl = document.getElementById("command-bar");
if (commandBarEl === null) throw new Error("#command-bar element not found");

const viewport = new Viewport(
  () => canvasEl.clientWidth,
  () => canvasEl.clientHeight,
);
const commandBar = new CommandBar(commandBarEl);

// CanvasView's requestRedraw is referenced by Engine before CanvasView exists --
// both need each other (Engine needs a redraw hook, CanvasView needs Engine's
// document to render), so this closure defers the actual lookup until first use,
// by which point `view` below has already been assigned.
let view: CanvasView;
const engine = new Engine(viewport, commandBar, () => view.requestRedraw());

view = new CanvasView(canvasEl, viewport, engine);

commandBar.addEventListener("inputSubmitted", (e) => {
  engine.commandManager.textInput((e as CustomEvent<string>).detail);
  view.requestRedraw();
});
commandBar.addEventListener("escapePressed", () => {
  engine.cancelCommand();
  view.requestRedraw();
});
commandBar.addEventListener("orthoClicked", () => {
  engine.toggleOrtho();
});

buildToolbar(toolbarEl, engine, () => view.requestRedraw());

const homeBtn = document.getElementById("home-btn");
if (homeBtn !== null) {
  // Same focus-steal prevention as toolbar buttons -- see ui/toolbar.ts's
  // preventFocusSteal() doc comment.
  homeBtn.addEventListener("mousedown", (e) => e.preventDefault());
  homeBtn.addEventListener("click", () => engine.zoomExtents());
}
