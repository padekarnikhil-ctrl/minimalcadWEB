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
import { buildMobileNumpad } from "./ui/mobileNumpad";
import { initAutosave } from "./ui/autosaveController";
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
const engine = new Engine(
  viewport,
  commandBar,
  () => view.requestRedraw(),
  // Fires on every command start/cancel, from wherever it happens (toolbar,
  // Escape, a grip command finishing, trim.ts, repeat-last, ...) -- see
  // CommandManager's own doc comment on this callback. Without this, a touch
  // point-pick candidate frozen at the end of one command (see
  // canvasView.ts's aim/confirm doc comment) stayed on screen after that
  // command ended and got wrongly confirmed as the first point of whatever
  // command ran next.
  () => view.discardInFlightTouchPointPick(),
);

commandBar.addEventListener("inputSubmitted", (e) => {
  engine.commandManager.textInput((e as CustomEvent<string>).detail);
  // A typed value always wins over a finger still down mid touch point-pick
  // preview -- see canvasView.ts's own doc comment on this method.
  view.discardInFlightTouchPointPick();
  view.requestRedraw();
});
commandBar.addEventListener("escapePressed", () => {
  engine.cancelCommand();
  view.requestRedraw();
});
// Drives a live typing preview (e.g. TextCommand's ghost string) -- the
// command itself just reads commandBar.text() from its own draw().
commandBar.addEventListener("textChanged", () => view.requestRedraw());
// Whenever the command bar stops accepting text (between point-picks mid-
// command, or back at READY), hand keyboard focus back to the canvas so
// Escape/Delete/single-letter typed commands keep working -- see
// commandBar.ts's disableInput() doc comment.
commandBar.addEventListener("inputDisabled", () => canvasEl.focus());
commandBar.addEventListener("orthoClicked", () => {
  engine.toggleOrtho();
});

// Built before CanvasView so the toolbar's real, final layout (which may
// wrap to a second row -- there are enough commands now that it can) is
// already in the DOM before CanvasView's constructor sizes the canvas
// against it. The ResizeObserver in canvasView.ts's constructor is the
// actual belt-and-braces fix for any *later* layout-driven size change;
// this ordering just makes sure the very first sizing is already correct.
buildToolbar(toolbarEl, engine, () => view.requestRedraw());

view = new CanvasView(canvasEl, viewport, engine);

initAutosave(engine, () => view.requestRedraw());

const homeBtn = document.getElementById("home-btn");
if (homeBtn !== null) {
  // Same focus-steal prevention as toolbar buttons -- see ui/toolbar.ts's
  // preventFocusSteal() doc comment.
  homeBtn.addEventListener("mousedown", (e) => e.preventDefault());
  homeBtn.addEventListener("click", () => engine.zoomExtents());
}

// Touch-only ESC/Enter/Undo/Redo/Delete/Ortho overlay, plus a numeric keypad
// (shown/hidden purely by CSS/CommandBar events -- nothing here decides
// visibility, see style.css's #mobile-touch-ui rule and mobileNumpad.ts).
// ESC/Enter don't reimplement cancellation/confirmation: dispatching a real
// 'keydown' at whichever element currently holds focus runs through the
// EXACT SAME listeners a physical key press would -- canvasView.ts's own
// onKeyDown when the canvas has focus (mid-command point-picking), or
// commandBar.ts's field handler when its input has focus (typed/dual-value
// entry) -- so there is nothing new to keep in sync with either. Neither
// button ever calls .focus() on anything, so tapping them never pops up the
// on-screen keyboard.
function dispatchSyntheticKey(key: string): void {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

const mobileControls: [string, () => void][] = [
  ["mobile-undo", () => engine.undoAction()],
  ["mobile-redo", () => engine.redoAction()],
  ["mobile-delete", () => engine.deleteSelected()],
  ["mobile-ortho", () => engine.toggleOrtho()],
  ["mobile-escape", () => dispatchSyntheticKey("Escape")],
  ["mobile-enter", () => dispatchSyntheticKey("Enter")],
];
for (const [id, action] of mobileControls) {
  const btn = document.getElementById(id);
  if (btn === null) continue;
  // Same focus-steal prevention as toolbar/home buttons -- critical here
  // specifically so tapping ESC/Enter doesn't itself move focus away from
  // whatever element dispatchSyntheticKey above needs to target.
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", () => {
    action();
    view.requestRedraw();
  });
}

const mobileNumpadEl = document.getElementById("mobile-numpad");
if (mobileNumpadEl !== null) {
  buildMobileNumpad(mobileNumpadEl, commandBar);
}
