import { describe, expect, it } from "vitest";
import { makeTestEngine } from "../testUtils/fakeEngine";
import { TrimCommand } from "./trim";
import { Line } from "../entities/line";
import { Circle } from "../entities/circle";
import { Arc } from "../entities/arc";

// These five scenarios directly mirror the scripted Python probes used to
// verify (and fix) commands/trim.py's three real bugs earlier this session:
// gap-tolerance near-touch trimming, merge-not-fragment on multi-crossing
// survivors, and whole-entity deletion when a line's only cutting edges
// touch it exactly at its own two endpoints (e.g. a rectangle corner).

describe("TrimCommand", () => {
  it("a click near an entity with no real cutting edge nearby does nothing", () => {
    const engine = makeTestEngine();
    const target = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    const far = new Line({ x: -500, y: -500 }, { x: -400, y: -500 });
    engine.document.addEntity(target);
    engine.document.addEntity(far);

    const cmd = new TrimCommand(engine);
    cmd.start();
    cmd.leftClick({ x: 50, y: 0 });

    expect(engine.document.entities).toHaveLength(2); // untouched
  });

  it("trims a line whose only cutting edge falls just short of it, within pick tolerance", () => {
    const engine = makeTestEngine();
    const target = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    const cutter = new Line({ x: 50, y: 0.02 }, { x: 50, y: 50 }); // endpoint 0.02 above the target
    engine.document.addEntity(target);
    engine.document.addEntity(cutter);

    const cmd = new TrimCommand(engine);
    cmd.start();
    cmd.leftClick({ x: 75, y: 0 }); // click the right half

    const remnant = engine.document.entities.find(
      (e): e is Line => e instanceof Line && Math.abs(e.startPoint.y) < 1 && Math.abs(e.endPoint.y) < 1,
    );
    expect(remnant).toBeDefined();
    expect(remnant!.endPoint.x).toBeCloseTo(50, 6);
  });

  it("trimming a middle segment merges the untouched survivors instead of fragmenting them", () => {
    const engine = makeTestEngine();
    const target = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    for (const x of [20, 40, 60, 80]) {
      engine.document.addEntity(new Line({ x, y: -50 }, { x, y: 50 }));
    }
    engine.document.addEntity(target);

    const cmd = new TrimCommand(engine);
    cmd.start();
    cmd.leftClick({ x: 50, y: 0 }); // remove the [40,60] middle segment

    const remnants = engine.document.entities
      .filter((e): e is Line => e instanceof Line && e.startPoint.y === 0 && e.endPoint.y === 0)
      .map((e) => [e.startPoint.x, e.endPoint.x])
      .sort((a, b) => a[0]! - b[0]!);
    expect(remnants).toEqual([
      [0, 40],
      [60, 100],
    ]);
  });

  it("a circle's first trim produces exactly one spanning Arc, not one fragment per crossing", () => {
    const engine = makeTestEngine();
    const circle = new Circle({ x: 0, y: 0 }, 50);
    engine.document.addEntity(circle);
    engine.document.addEntity(new Line({ x: -100, y: 10 }, { x: 100, y: 10 }));
    engine.document.addEntity(new Line({ x: -100, y: -10 }, { x: 100, y: -10 }));

    const cmd = new TrimCommand(engine);
    cmd.start();
    cmd.leftClick({ x: 0, y: 50 }); // top sliver

    const arcs = engine.document.entities.filter((e): e is Arc => e instanceof Arc);
    expect(arcs).toHaveLength(1);
  });

  it("a rectangle side whose only cutting edges touch it at its own two corners deletes entirely", () => {
    const engine = makeTestEngine();
    const p1 = { x: 0, y: 0 }, p2 = { x: 100, y: 0 }, p3 = { x: 100, y: 60 }, p4 = { x: 0, y: 60 };
    engine.document.addEntity(new Line(p1, p2)); // bottom -- the one we'll click
    engine.document.addEntity(new Line(p2, p3));
    engine.document.addEntity(new Line(p3, p4));
    engine.document.addEntity(new Line(p4, p1));

    const cmd = new TrimCommand(engine);
    cmd.start();
    cmd.leftClick({ x: 50, y: 0 }); // click the bottom side

    expect(engine.document.entities).toHaveLength(3); // bottom side fully deleted
  });
});
