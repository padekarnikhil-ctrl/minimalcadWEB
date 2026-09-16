import { describe, expect, it } from "vitest";
import { makeTestEngine } from "../testUtils/fakeEngine";
import { ConstrainDistanceCommand } from "./constrainDistance";
import { Line } from "../entities/line";
import { Circle } from "../entities/circle";
import type { Constraint } from "../core/constraints";

describe("ConstrainDistanceCommand", () => {
  it("pins a circle a fixed distance from a wall's edge", () => {
    const engine = makeTestEngine();
    const wall = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    const circle = new Circle({ x: 50, y: 10 }, 5);
    engine.document.addEntity(wall);
    engine.document.addEntity(circle);

    const cmd = new ConstrainDistanceCommand(engine);
    cmd.start();
    cmd.leftClick({ x: 50, y: 10 }); // pick the circle (driven)
    cmd.leftClick({ x: 50, y: 0 }); // pick the wall (reference)
    cmd.textInput("30");

    expect(circle.center.y).toBeCloseTo(30, 4);
    const constraints = engine.document.constraints as Constraint[];
    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toMatchObject({
      driven_entity_id: circle.id,
      driven_feature: "center",
      ref_entity_id: wall.id,
      ref_feature: "edge",
      target: 30,
    });
  });

  it("keeps the point on the same side of the reference edge it started on", () => {
    const engine = makeTestEngine();
    const wall = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    const circle = new Circle({ x: 50, y: -10 }, 5); // starts above the wall (negative side)
    engine.document.addEntity(wall);
    engine.document.addEntity(circle);

    const cmd = new ConstrainDistanceCommand(engine);
    cmd.start();
    cmd.leftClick({ x: 50, y: -10 });
    cmd.leftClick({ x: 50, y: 0 });
    cmd.textInput("30");

    expect(circle.center.y).toBeCloseTo(-30, 4); // stayed above, not flipped below
  });

  it("re-runs the solver across all of an entity's constraints so a second reference lands at their intersection", () => {
    const engine = makeTestEngine();
    const wallX = new Line({ x: 0, y: 50 }, { x: 0, y: -50 });
    const wallY = new Line({ x: -50, y: 0 }, { x: 50, y: 0 });
    // Well clear of both walls (default pick tolerance is a few world units)
    // so the driven-entity click can't accidentally also hit a wall.
    const circle = new Circle({ x: 20, y: 20 }, 5);
    engine.document.addEntity(wallX);
    engine.document.addEntity(wallY);
    engine.document.addEntity(circle);

    const cmd = new ConstrainDistanceCommand(engine);
    cmd.start();
    cmd.leftClick({ x: 20, y: 20 });
    cmd.leftClick({ x: 0, y: 20 }); // pick wallX
    cmd.textInput("30");
    expect(circle.center.x).toBeCloseTo(30, 4);

    // Command loops back to picking another reference for the same driven entity.
    cmd.leftClick({ x: 20, y: 0 }); // pick wallY
    cmd.textInput("40");

    expect(circle.center.x).toBeCloseTo(30, 4); // first constraint still holds
    expect(circle.center.y).toBeCloseTo(40, 4);
    expect(engine.document.constraints).toHaveLength(2);
  });

  it("rejects a distance that would conflict with an existing constraint on the same entity", () => {
    const engine = makeTestEngine();
    const wall = new Line({ x: 0, y: 50 }, { x: 0, y: -50 });
    const circle = new Circle({ x: 20, y: 20 }, 5);
    engine.document.addEntity(wall);
    engine.document.addEntity(circle);

    const cmd = new ConstrainDistanceCommand(engine);
    cmd.start();
    cmd.leftClick({ x: 20, y: 20 });
    cmd.leftClick({ x: 0, y: 20 });
    cmd.textInput("30");
    expect(engine.document.constraints).toHaveLength(1);

    // Constrain the SAME driven point against the SAME wall again with an
    // incompatible target -- geometrically impossible to satisfy alongside
    // the first, so it must be rejected rather than silently overwritten.
    cmd.leftClick({ x: 0, y: 20 });
    cmd.textInput("60");

    expect(engine.document.constraints).toHaveLength(1); // second one was rejected
    expect(circle.center.x).toBeCloseTo(30, 4); // position untouched by the rejected attempt
  });

  it("rejects picking the same entity as both driven and reference", () => {
    const engine = makeTestEngine();
    const wall = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    engine.document.addEntity(wall);

    const cmd = new ConstrainDistanceCommand(engine);
    cmd.start();
    cmd.leftClick({ x: 50, y: 0 });
    cmd.leftClick({ x: 50, y: 0 }); // same entity again

    expect(engine.document.constraints).toHaveLength(0);
  });

  it("rejects a non-positive distance", () => {
    const engine = makeTestEngine();
    const wall = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    const circle = new Circle({ x: 50, y: 10 }, 5);
    engine.document.addEntity(wall);
    engine.document.addEntity(circle);

    const cmd = new ConstrainDistanceCommand(engine);
    cmd.start();
    cmd.leftClick({ x: 50, y: 10 });
    cmd.leftClick({ x: 50, y: 0 });
    cmd.textInput("-5");

    expect(engine.document.constraints).toHaveLength(0);
  });

  it("right-click (BaseCommand default) cancels the command via the manager", () => {
    const engine = makeTestEngine();
    const wall = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    const circle = new Circle({ x: 50, y: 10 }, 5);
    engine.document.addEntity(wall);
    engine.document.addEntity(circle);

    engine.commandManager.startCommand("constrain");
    engine.commandManager.leftClick({ x: 50, y: 10 });
    engine.commandManager.rightClick({ x: 0, y: 0 });

    expect(engine.commandManager.currentCommand).toBeNull();
  });
});
