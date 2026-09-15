import { describe, expect, it } from "vitest";
import { makeTestEngine } from "../testUtils/fakeEngine";
import { Line } from "../entities/line";

describe("Engine.snap", () => {
  it("tracks the resolved snap as a side effect (activeSnapPoint/activeSnapType)", () => {
    const engine = makeTestEngine();
    engine.document.addEntity(new Line({ x: 0, y: 0 }, { x: 10, y: 0 }));

    engine.snap({ x: 0.2, y: 0 });
    expect(engine.activeSnapType).toBe("ENDPOINT");
    expect(engine.activeSnapPoint).toEqual({ x: 0, y: 0 });
  });

  it("no match leaves activeSnapType null", () => {
    const engine = makeTestEngine();
    engine.snap({ x: 500, y: 500 });
    expect(engine.activeSnapType).toBeNull();
    expect(engine.activeSnapPoint).toBeNull();
  });

  it("clearSnapFeedback resets both fields", () => {
    const engine = makeTestEngine();
    engine.document.addEntity(new Line({ x: 0, y: 0 }, { x: 10, y: 0 }));
    engine.snap({ x: 0.2, y: 0 });
    expect(engine.activeSnapType).not.toBeNull();

    engine.clearSnapFeedback();
    expect(engine.activeSnapType).toBeNull();
    expect(engine.activeSnapPoint).toBeNull();
  });

  it("cancelCommand() also clears snap feedback", () => {
    const engine = makeTestEngine();
    engine.document.addEntity(new Line({ x: 0, y: 0 }, { x: 10, y: 0 }));
    engine.snap({ x: 0.2, y: 0 });
    expect(engine.activeSnapType).not.toBeNull();

    engine.cancelCommand();
    expect(engine.activeSnapType).toBeNull();
  });
});
