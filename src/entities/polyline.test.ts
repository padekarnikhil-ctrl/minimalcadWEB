import { describe, expect, it } from "vitest";
import { Polyline, bulgeToArc } from "./polyline";
import { Line } from "./line";
import { Arc } from "./arc";

describe("bulgeToArc", () => {
  it("reconstructs a known quarter-circle arc from its bulge", () => {
    // Quarter circle: p1=(10,0), p2=(0,10), center=(0,0), radius=10, sweep pi/2.
    // bulge = tan(includedAngle/4) = tan(pi/8).
    const bulge = Math.tan(Math.PI / 8);
    const arc = bulgeToArc({ x: 10, y: 0 }, { x: 0, y: 10 }, bulge);
    expect(arc.center.x).toBeCloseTo(0, 6);
    expect(arc.center.y).toBeCloseTo(0, 6);
    expect(arc.radius).toBeCloseTo(10, 6);
  });

  it("a semicircle bulge of 1.0 spans exactly pi", () => {
    const arc = bulgeToArc({ x: -5, y: 0 }, { x: 5, y: 0 }, 1.0);
    const twoPi = 2 * Math.PI;
    const sweep = ((arc.endAngle - arc.startAngle) % twoPi + twoPi) % twoPi;
    expect(sweep).toBeCloseTo(Math.PI, 6);
    expect(arc.radius).toBeCloseTo(5, 6);
  });

  it("negative bulge orients the arc from p2 towards p1", () => {
    // bulge=1.0 (an exact semicircle) is degenerate for this check: its center
    // always sits ON the chord regardless of sign. Use a non-semicircle bulge
    // so the center actually lands off the chord line, where sign flips it.
    const positive = bulgeToArc({ x: -5, y: 0 }, { x: 5, y: 0 }, 0.5);
    const negative = bulgeToArc({ x: -5, y: 0 }, { x: 5, y: 0 }, -0.5);
    expect(positive.center.y).not.toBeCloseTo(0, 3);
    expect(negative.center.y).toBeCloseTo(-positive.center.y, 6);
  });
});

describe("Polyline", () => {
  it("straight (bulge=0) edges become Line segments, curved edges become Arc", () => {
    const pl = new Polyline([
      { point: { x: 0, y: 0 }, bulge: 0 },
      { point: { x: 10, y: 0 }, bulge: 1.0 },
      { point: { x: 20, y: 0 }, bulge: 0 },
    ]);
    const segments = pl.segmentEntities();
    expect(segments).toHaveLength(2); // open polyline, 3 vertices -> 2 edges
    expect(segments[0]).toBeInstanceOf(Line);
    expect(segments[1]).toBeInstanceOf(Arc);
  });

  it("closed polyline has one edge per vertex, wrapping back to vertex 0", () => {
    const pl = new Polyline(
      [
        { point: { x: 0, y: 0 }, bulge: 0 },
        { point: { x: 10, y: 0 }, bulge: 0 },
        { point: { x: 10, y: 10 }, bulge: 0 },
      ],
      true,
    );
    expect(pl.segmentEntities()).toHaveLength(3);
  });

  it("serialize/fromDict round-trips field-for-field, no id field", () => {
    const pl = new Polyline([
      { point: { x: 0, y: 0 }, bulge: 0 },
      { point: { x: 10, y: 0 }, bulge: 0.5 },
    ]);
    const serialized = pl.serialize();
    expect(serialized.id).toBeUndefined();
    expect(Polyline.fromDict(serialized).serialize()).toEqual(serialized);
  });

  it("move() translates every vertex, bulges untouched", () => {
    const pl = new Polyline([
      { point: { x: 0, y: 0 }, bulge: 0.3 },
      { point: { x: 10, y: 0 }, bulge: 0 },
    ]);
    pl.move(5, 5);
    expect(pl.vertices[0]!.point).toEqual({ x: 5, y: 5 });
    expect(pl.vertices[0]!.bulge).toBe(0.3);
    expect(pl.vertices[1]!.point).toEqual({ x: 15, y: 5 });
  });

  it("hitTest delegates to whichever segment is closest", () => {
    const pl = new Polyline([
      { point: { x: 0, y: 0 }, bulge: 0 },
      { point: { x: 10, y: 0 }, bulge: 0 },
    ]);
    expect(pl.hitTest({ x: 5, y: 0.5 }, 1)).toBe(true);
    expect(pl.hitTest({ x: 5, y: 5 }, 1)).toBe(false);
  });

  it("copy() produces an independent deep copy", () => {
    const pl = new Polyline([
      { point: { x: 0, y: 0 }, bulge: 0 },
      { point: { x: 10, y: 0 }, bulge: 0 },
    ]);
    const copy = pl.copy();
    copy.move(100, 100);
    expect(pl.vertices[0]!.point).toEqual({ x: 0, y: 0 }); // original untouched
  });
});
