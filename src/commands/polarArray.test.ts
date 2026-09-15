import { describe, expect, it } from "vitest";
import { makeTestEngine } from "../testUtils/fakeEngine";
import { PolarArrayCommand } from "./polarArray";
import { Line } from "../entities/line";

describe("PolarArrayCommand", () => {
  it("places (count - 1) rotated copies evenly around the center, source untouched", () => {
    const engine = makeTestEngine();
    // Center pick at the origin needs to land well outside snap tolerance of
    // the line itself, or engine.snap() correctly (and desirably, matching
    // the desktop app's own behavior) pulls it onto the line's own nearest
    // endpoint instead of the literal click point.
    const line = new Line({ x: 50, y: 0 }, { x: 60, y: 0 });
    engine.document.addEntity(line);

    const cmd = new PolarArrayCommand(engine);
    cmd.start();
    cmd.leftClick({ x: 55, y: 0 }); // pick the line
    cmd.leftClick({ x: 0, y: 0 }); // center at origin
    cmd.textInput("4");

    const lines = engine.document.entities.filter((e): e is Line => e instanceof Line);
    expect(lines).toHaveLength(4);
    expect(lines).toContain(line); // original untouched, still present

    // A copy rotated 90 degrees about the origin: (50,0)->(60,0) becomes (0,50)->(0,60).
    const rotated90 = lines.find(
      (l) => Math.abs(l.startPoint.x) < 1e-6 && Math.abs(l.startPoint.y - 50) < 1e-6,
    );
    expect(rotated90).toBeDefined();
    expect(rotated90!.endPoint.x).toBeCloseTo(0);
    expect(rotated90!.endPoint.y).toBeCloseTo(60);
  });

  it("skips straight to center-pick when entities are pre-selected", () => {
    const engine = makeTestEngine();
    const line = new Line({ x: 10, y: 0 }, { x: 20, y: 0 });
    engine.document.addEntity(line);
    engine.selection.select(line);

    const cmd = new PolarArrayCommand(engine);
    cmd.start();
    // No leftClick to pick a target needed -- straight to center pick.
    cmd.leftClick({ x: 0, y: 0 });
    cmd.textInput("2");

    expect(engine.document.entities.filter((e) => e instanceof Line)).toHaveLength(2);
  });

  it("rejects a count below 2 or above the max, leaving the document untouched", () => {
    const engine = makeTestEngine();
    const line = new Line({ x: 10, y: 0 }, { x: 20, y: 0 });
    engine.document.addEntity(line);

    const cmd = new PolarArrayCommand(engine);
    cmd.start();
    cmd.leftClick({ x: 15, y: 0 });
    cmd.leftClick({ x: 0, y: 0 });

    cmd.textInput("1");
    expect(engine.document.entities).toHaveLength(1);

    cmd.textInput("1001");
    expect(engine.document.entities).toHaveLength(1);

    cmd.textInput("not a number");
    expect(engine.document.entities).toHaveLength(1);
  });

  it("clicking empty space in the object-pick state does nothing", () => {
    const engine = makeTestEngine();
    const line = new Line({ x: 10, y: 0 }, { x: 20, y: 0 });
    engine.document.addEntity(line);

    const cmd = new PolarArrayCommand(engine);
    cmd.start();
    cmd.leftClick({ x: 500, y: 500 }); // far from the line -- no pick
    cmd.leftClick({ x: 0, y: 0 }); // still in object-pick state, this is another miss too
    cmd.textInput("4");

    // Nothing committed -- still just the original line, no target was ever picked.
    expect(engine.document.entities).toHaveLength(1);
  });
});
