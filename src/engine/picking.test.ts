import { describe, expect, it } from "vitest";
import { entityAt, gripAt } from "./picking";
import { Selection } from "../core/selection";
import { Line } from "../entities/line";
import { Circle } from "../entities/circle";

describe("entityAt", () => {
  it("returns the first match in list order, not topmost/reverse order", () => {
    const a = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    const b = new Line({ x: 0, y: 0 }, { x: 10, y: 0 }); // identical geometry, drawn "on top" of a
    expect(entityAt([a, b], { x: 5, y: 0 }, 1)).toBe(a);
    expect(entityAt([b, a], { x: 5, y: 0 }, 1)).toBe(b);
  });

  it("returns null when nothing is within tolerance", () => {
    const a = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(entityAt([a], { x: 100, y: 100 }, 1)).toBeNull();
  });
});

describe("gripAt", () => {
  it("returns null unless exactly one entity is selected", () => {
    const sel = new Selection();
    const line = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(gripAt(sel, { x: 0, y: 0 }, 1)).toBeNull(); // nothing selected

    const other = new Line({ x: 20, y: 20 }, { x: 30, y: 20 });
    sel.select(line);
    sel.select(other);
    expect(gripAt(sel, { x: 0, y: 0 }, 1)).toBeNull(); // two selected
  });

  it("Line: start/end points are line_extend grips, midpoint is a move_grip", () => {
    const sel = new Selection();
    const line = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    sel.select(line);

    const start = gripAt(sel, { x: 0, y: 0 }, 1)!;
    expect(start.kind).toBe("line_extend");
    expect(start.extra).toBe(true);

    const end = gripAt(sel, { x: 10, y: 0 }, 1)!;
    expect(end.kind).toBe("line_extend");
    expect(end.extra).toBe(false);

    const mid = gripAt(sel, { x: 5, y: 0 }, 1)!;
    expect(mid.kind).toBe("move_grip");
    expect(mid.extra).toEqual({ x: 5, y: 0 });
  });

  it("Circle: center is a move_grip, quadrant points are circle_resize", () => {
    const sel = new Selection();
    const circle = new Circle({ x: 0, y: 0 }, 10);
    sel.select(circle);

    const center = gripAt(sel, { x: 0, y: 0 }, 1)!;
    expect(center.kind).toBe("move_grip");

    const eastQuadrant = gripAt(sel, { x: 10, y: 0 }, 1)!;
    expect(eastQuadrant.kind).toBe("circle_resize");
    expect(eastQuadrant.extra).toEqual({ x: 10, y: 0 });
  });

  it("returns null when the click isn't near any grip", () => {
    const sel = new Selection();
    const line = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    sel.select(line);
    expect(gripAt(sel, { x: 3, y: 5 }, 1)).toBeNull();
  });
});
