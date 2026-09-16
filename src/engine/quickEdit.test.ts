import { describe, expect, it, vi } from "vitest";
import { makeTestEngine } from "../testUtils/fakeEngine";
import { Line } from "../entities/line";
import { Text } from "../entities/text";
import { Circle } from "../entities/circle";

describe("QuickEditController.target", () => {
  it("is null when nothing is selected", () => {
    const engine = makeTestEngine();
    expect(engine.quickEdit.target()).toBeNull();
  });

  it("is null when more than one entity is selected", () => {
    const engine = makeTestEngine();
    const a = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    const b = new Line({ x: 0, y: 0 }, { x: 0, y: 10 });
    engine.document.addEntity(a);
    engine.document.addEntity(b);
    engine.selection.select(a);
    engine.selection.select(b);
    expect(engine.quickEdit.target()).toBeNull();
  });

  it("is null for an entity type that isn't quick-editable", () => {
    const engine = makeTestEngine();
    const circle = new Circle({ x: 0, y: 0 }, 5);
    engine.document.addEntity(circle);
    engine.selection.select(circle);
    expect(engine.quickEdit.target()).toBeNull();
  });

  it("is null while a command is running, even with a single Line selected", () => {
    const engine = makeTestEngine();
    const line = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    engine.document.addEntity(line);
    engine.selection.select(line);
    engine.commandManager.startCommand("move");
    expect(engine.quickEdit.target()).toBeNull();
  });

  it("is the entity when exactly one Line or Text is selected", () => {
    const engine = makeTestEngine();
    const line = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    engine.document.addEntity(line);
    engine.selection.select(line);
    expect(engine.quickEdit.target()).toBe(line);

    const text = new Text({ x: 0, y: 0 }, "hi", 10);
    engine.document.addEntity(text);
    engine.selection.clear();
    engine.selection.select(text);
    expect(engine.quickEdit.target()).toBe(text);
  });
});

describe("QuickEditController.refreshStatus", () => {
  it("shows the current length for a selected Line", () => {
    const engine = makeTestEngine();
    const setStatus = vi.spyOn(engine.commandBar, "setStatus");
    const line = new Line({ x: 0, y: 0 }, { x: 30, y: 40 }); // length 50
    engine.document.addEntity(line);
    engine.selection.select(line);

    engine.quickEdit.refreshStatus();
    expect(setStatus).toHaveBeenLastCalledWith("LENGTH", "50.00 (type a new length, Enter to apply)");
  });

  it("shows the current text height for a selected Text", () => {
    const engine = makeTestEngine();
    const setStatus = vi.spyOn(engine.commandBar, "setStatus");
    const text = new Text({ x: 0, y: 0 }, "hi", 12.5);
    engine.document.addEntity(text);
    engine.selection.select(text);

    engine.quickEdit.refreshStatus();
    expect(setStatus).toHaveBeenLastCalledWith("SIZE", "12.50 (type a new text size, Enter to apply)");
  });

  it("resets to READY when there's no eligible target", () => {
    const engine = makeTestEngine();
    const setReady = vi.spyOn(engine.commandBar, "setReady");
    engine.quickEdit.refreshStatus();
    expect(setReady).toHaveBeenCalled();
  });

  it("clears any in-progress typed buffer", () => {
    const engine = makeTestEngine();
    const line = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    engine.document.addEntity(line);
    engine.selection.select(line);

    engine.quickEdit.handleChar("5", line);
    expect(engine.quickEdit.hasBuffer()).toBe(true);
    engine.quickEdit.refreshStatus();
    expect(engine.quickEdit.hasBuffer()).toBe(false);
  });
});

describe("QuickEditController.handleChar / backspace", () => {
  it("only accepts digits/math characters", () => {
    const engine = makeTestEngine();
    const line = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    engine.document.addEntity(line);
    engine.selection.select(line);

    expect(engine.quickEdit.handleChar("5", line)).toBe(true);
    expect(engine.quickEdit.handleChar("m", line)).toBe(false); // letters fall through to the command buffer instead
    expect(engine.quickEdit.hasBuffer()).toBe(true);
  });

  it("backspace removes the last character and reports whether it consumed anything", () => {
    const engine = makeTestEngine();
    const line = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    engine.document.addEntity(line);
    engine.selection.select(line);

    expect(engine.quickEdit.backspace(line)).toBe(false); // nothing typed yet
    engine.quickEdit.handleChar("2", line);
    expect(engine.quickEdit.backspace(line)).toBe(true);
    expect(engine.quickEdit.hasBuffer()).toBe(false);
  });
});

describe("QuickEditController.submit", () => {
  it("resizes a Line symmetrically about its own midpoint", () => {
    const engine = makeTestEngine();
    const line = new Line({ x: 0, y: 0 }, { x: 100, y: 0 }); // length 100, midpoint (50,0)
    engine.document.addEntity(line);
    engine.selection.select(line);

    engine.quickEdit.handleChar("4", line);
    engine.quickEdit.handleChar("0", line);
    engine.quickEdit.submit(line);

    expect(line.startPoint).toEqual({ x: 30, y: 0 });
    expect(line.endPoint).toEqual({ x: 70, y: 0 });
  });

  it("sets a Text's height directly", () => {
    const engine = makeTestEngine();
    const text = new Text({ x: 0, y: 0 }, "hi", 10);
    engine.document.addEntity(text);
    engine.selection.select(text);

    engine.quickEdit.handleChar("2", text);
    engine.quickEdit.handleChar("5", text);
    engine.quickEdit.submit(text);

    expect(text.height).toBe(25);
  });

  it("records undo history so the resize can be undone", () => {
    const engine = makeTestEngine();
    const line = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    engine.document.addEntity(line);
    engine.selection.select(line);

    engine.quickEdit.handleChar("4", line);
    engine.quickEdit.handleChar("0", line);
    engine.quickEdit.submit(line);

    // undoAction() rebuilds Document.entities from the pushed snapshot as
    // fresh objects (see Document.restoreFromDict) -- re-read the reverted
    // entity rather than asserting on the original (now-detached) `line`.
    engine.undoAction();
    const reverted = engine.document.entities[0] as Line;
    expect(reverted.startPoint).toEqual({ x: 0, y: 0 });
    expect(reverted.endPoint).toEqual({ x: 100, y: 0 });
  });

  it("rejects a non-positive value without mutating the entity", () => {
    const engine = makeTestEngine();
    const line = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    engine.document.addEntity(line);
    engine.selection.select(line);

    engine.quickEdit.handleChar("-", line);
    engine.quickEdit.handleChar("5", line);
    engine.quickEdit.submit(line);

    expect(line.startPoint).toEqual({ x: 0, y: 0 });
    expect(line.endPoint).toEqual({ x: 100, y: 0 });
  });

  it("is a no-op when the buffer is empty", () => {
    const engine = makeTestEngine();
    const line = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    engine.document.addEntity(line);
    engine.selection.select(line);

    engine.quickEdit.submit(line);
    expect(line.startPoint).toEqual({ x: 0, y: 0 });
    expect(line.endPoint).toEqual({ x: 100, y: 0 });
  });
});

describe("Engine.deleteSelected refreshes quick-edit status", () => {
  it("returns the command bar to READY after deleting the quick-edit target", () => {
    const engine = makeTestEngine();
    const setReady = vi.spyOn(engine.commandBar, "setReady");
    const line = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    engine.document.addEntity(line);
    engine.selection.select(line);

    engine.deleteSelected();
    expect(setReady).toHaveBeenCalled();
  });
});
