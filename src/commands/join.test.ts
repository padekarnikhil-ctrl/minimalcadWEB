import { describe, expect, it } from "vitest";
import { makeTestEngine } from "../testUtils/fakeEngine";
import { JoinCommand } from "./join";
import { Line } from "../entities/line";
import { Arc } from "../entities/arc";
import { Circle } from "../entities/circle";
import { Polyline } from "../entities/polyline";

describe("JoinCommand: interactive click-click", () => {
  it("bridges a gap between two colinear lines into a single Line", () => {
    const engine = makeTestEngine();
    const l1 = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    const l2 = new Line({ x: 15, y: 0 }, { x: 25, y: 0 });
    engine.document.addEntity(l1);
    engine.document.addEntity(l2);

    const cmd = new JoinCommand(engine);
    cmd.start();
    cmd.leftClick({ x: 5, y: 0 });
    cmd.leftClick({ x: 20, y: 0 });

    const lines = engine.document.entities.filter((e): e is Line => e instanceof Line);
    expect(lines).toHaveLength(1);
    expect([lines[0]!.startPoint.x, lines[0]!.endPoint.x].sort((a, b) => a - b)).toEqual([0, 25]);
  });

  it("collapses an overlapping colinear pair spanning both extremes", () => {
    const engine = makeTestEngine();
    const l1 = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    const l2 = new Line({ x: 5, y: 0 }, { x: 15, y: 0 });
    engine.document.addEntity(l1);
    engine.document.addEntity(l2);

    const cmd = new JoinCommand(engine);
    cmd.start();
    cmd.leftClick({ x: 2, y: 0 });
    cmd.leftClick({ x: 12, y: 0 });

    const lines = engine.document.entities.filter((e): e is Line => e instanceof Line);
    expect(lines).toHaveLength(1);
    expect([lines[0]!.startPoint.x, lines[0]!.endPoint.x].sort((a, b) => a - b)).toEqual([0, 15]);
  });

  it("merges two adjacent same-center/radius arcs into a single wider Arc", () => {
    const engine = makeTestEngine();
    const a1 = new Arc({ x: 0, y: 0 }, 10, 0, Math.PI / 2);
    const a2 = new Arc({ x: 0, y: 0 }, 10, Math.PI / 2, Math.PI);
    engine.document.addEntity(a1);
    engine.document.addEntity(a2);

    const cmd = new JoinCommand(engine);
    cmd.start();
    cmd.leftClick(a1.pointAt(Math.PI / 4));
    cmd.leftClick(a2.pointAt((3 * Math.PI) / 4));

    const arcs = engine.document.entities.filter((e): e is Arc => e instanceof Arc);
    expect(arcs).toHaveLength(1);
    expect(arcs[0]!.startAngle).toBeCloseTo(0);
    expect(arcs[0]!.endAngle).toBeCloseTo(Math.PI);
  });

  it("merges two arcs that close the full circle into a Circle", () => {
    const engine = makeTestEngine();
    const a1 = new Arc({ x: 0, y: 0 }, 10, 0, Math.PI);
    const a2 = new Arc({ x: 0, y: 0 }, 10, Math.PI, 0);
    engine.document.addEntity(a1);
    engine.document.addEntity(a2);

    const cmd = new JoinCommand(engine);
    cmd.start();
    cmd.leftClick(a1.pointAt(Math.PI / 2));
    cmd.leftClick(a2.pointAt((3 * Math.PI) / 2));

    expect(engine.document.entities.filter((e) => e instanceof Arc)).toHaveLength(0);
    const circles = engine.document.entities.filter((e): e is Circle => e instanceof Circle);
    expect(circles).toHaveLength(1);
    expect(circles[0]!.radius).toBeCloseTo(10);
  });

  it("connects a Line and an Arc meeting at an angle into an open Polyline", () => {
    const engine = makeTestEngine();
    const line = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    // Arc centered at (10,10): its start point (angle -90) is (10,0), coincident with the line's end.
    const arc = new Arc({ x: 10, y: 10 }, 10, -Math.PI / 2, 0);
    engine.document.addEntity(line);
    engine.document.addEntity(arc);

    const cmd = new JoinCommand(engine);
    cmd.start();
    cmd.leftClick({ x: 5, y: 0 });
    cmd.leftClick(arc.pointAt(-Math.PI / 4));

    expect(engine.document.entities.filter((e) => e instanceof Line || e instanceof Arc)).toHaveLength(0);
    const polylines = engine.document.entities.filter((e): e is Polyline => e instanceof Polyline);
    expect(polylines).toHaveLength(1);
    expect(polylines[0]!.closed).toBe(false);
    expect(polylines[0]!.vertices).toHaveLength(3);
    expect(polylines[0]!.vertices[0]!.point).toEqual({ x: 0, y: 0 });
    expect(polylines[0]!.vertices[2]!.point.x).toBeCloseTo(20);
    expect(polylines[0]!.vertices[2]!.point.y).toBeCloseTo(10);
  });

  it("first join of a triangle's two adjacent sides forms an open (not yet closed) Polyline", () => {
    const engine = makeTestEngine();
    const l1 = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    const l2 = new Line({ x: 10, y: 0 }, { x: 5, y: 8 });
    const l3 = new Line({ x: 5, y: 8 }, { x: 0, y: 0 });
    engine.document.addEntity(l1);
    engine.document.addEntity(l2);
    engine.document.addEntity(l3);

    const cmd = new JoinCommand(engine);
    cmd.start();
    cmd.leftClick({ x: 5, y: 0 }); // l1
    cmd.leftClick({ x: 7.5, y: 4 }); // l2 -- shares (10,0) with l1

    expect(engine.document.entities).toContain(l3); // untouched
    const polylines = engine.document.entities.filter((e): e is Polyline => e instanceof Polyline);
    expect(polylines).toHaveLength(1);
    expect(polylines[0]!.closed).toBe(false);
    expect(polylines[0]!.vertices).toHaveLength(3);
  });
});

describe("JoinCommand: bulk (pre-selected) join", () => {
  it("joins every connected pair in one run, closing a triangle in a single call", () => {
    const engine = makeTestEngine();
    const l1 = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    const l2 = new Line({ x: 10, y: 0 }, { x: 5, y: 8 });
    const l3 = new Line({ x: 5, y: 8 }, { x: 0, y: 0 });
    engine.document.addEntity(l1);
    engine.document.addEntity(l2);
    engine.document.addEntity(l3);
    engine.selection.select(l1);
    engine.selection.select(l2);
    engine.selection.select(l3);

    const cmd = new JoinCommand(engine);
    cmd.start(); // pre-selected -- runs bulk join immediately

    const polylines = engine.document.entities.filter((e): e is Polyline => e instanceof Polyline);
    expect(polylines).toHaveLength(1);
    expect(polylines[0]!.closed).toBe(true);
    expect(polylines[0]!.vertices).toHaveLength(3);
    expect(engine.document.entities.filter((e) => e instanceof Line)).toHaveLength(0);
  });

  it("refuses to connect through an ambiguous T-junction where 3 entities meet", () => {
    const engine = makeTestEngine();
    // Three non-colinear lines all meeting at the origin -- every pairing
    // shares that same point, but with a third entity also touching it.
    const l1 = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    const l2 = new Line({ x: 0, y: 0 }, { x: 0, y: 10 });
    const l3 = new Line({ x: 0, y: 0 }, { x: 7, y: 7 });
    engine.document.addEntity(l1);
    engine.document.addEntity(l2);
    engine.document.addEntity(l3);
    engine.selection.select(l1);
    engine.selection.select(l2);
    engine.selection.select(l3);

    const cmd = new JoinCommand(engine);
    cmd.start();

    // Nothing should have merged -- all 3 lines survive untouched.
    expect(engine.document.entities.filter((e) => e instanceof Line)).toHaveLength(3);
    expect(engine.document.entities.filter((e) => e instanceof Polyline)).toHaveLength(0);
  });

  it("refuses to bridge a colinear gap when the facing end is claimed by other connected geometry", () => {
    const engine = makeTestEngine();
    // l1 and l3 are colinear along the X axis with a real gap between them
    // (10 to 20). l2 is a perpendicular detour connected to l1's facing end
    // (10,0) -- bridging the l1/l3 gap directly would erase that detour.
    const l1 = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    const l3 = new Line({ x: 20, y: 0 }, { x: 30, y: 0 });
    const l2 = new Line({ x: 10, y: 0 }, { x: 10, y: 10 });
    engine.document.addEntity(l1);
    engine.document.addEntity(l3);
    engine.document.addEntity(l2);
    engine.selection.select(l1);
    engine.selection.select(l3);
    engine.selection.select(l2);

    const cmd = new JoinCommand(engine);
    cmd.start();

    // l1/l3 must NOT have been bridged into one line (l3 survives, unmerged).
    expect(engine.document.entities).toContain(l3);
    // l1 and l2 legitimately connect at (10,0) instead (a degree-2 point --
    // not ambiguous for a plain connect, only for bridging a colinear gap).
    const polylines = engine.document.entities.filter((e): e is Polyline => e instanceof Polyline);
    expect(polylines).toHaveLength(1);
    expect(polylines[0]!.vertices).toHaveLength(3);
  });

  it("reports zero joins and leaves the document untouched when nothing is colinear/connected", () => {
    const engine = makeTestEngine();
    const l1 = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    const l2 = new Line({ x: 100, y: 100 }, { x: 110, y: 100 });
    engine.document.addEntity(l1);
    engine.document.addEntity(l2);
    engine.selection.select(l1);
    engine.selection.select(l2);

    const cmd = new JoinCommand(engine);
    cmd.start();

    expect(engine.document.entities).toHaveLength(2);
    expect(engine.document.entities).toContain(l1);
    expect(engine.document.entities).toContain(l2);
  });
});
