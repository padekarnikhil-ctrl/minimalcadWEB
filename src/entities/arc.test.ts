import { describe, expect, it } from "vitest";
import { Arc } from "./arc";

describe("Arc", () => {
  it("serialize/fromDict round-trips field-for-field (degrees on the wire)", () => {
    const arc = new Arc({ x: 5, y: -3 }, 10, Math.PI / 4, (3 * Math.PI) / 2);
    const serialized = arc.serialize();
    expect(Arc.fromDict(serialized).serialize()).toEqual(serialized);
  });

  it("normalizes negative angles correctly (not JS's negative-result %)", () => {
    const arc = new Arc({ x: 0, y: 0 }, 5, -Math.PI / 2, Math.PI / 2);
    expect(arc.startAngle).toBeGreaterThanOrEqual(0);
    expect(arc.startAngle).toBeCloseTo((3 * Math.PI) / 2, 9);
  });

  it("exact start===end angle draws as a full circle, but getBounds/hitTest use the literal (zero) span", () => {
    // Matches the Python source: only draw() special-cases a zero span as a
    // full 360deg circle for rendering. getBounds()/hitTest() (via
    // angleInSweep) use the literal span, which for start===end is a single
    // angle, not a full sweep -- a pre-existing asymmetry in the ported
    // behavior, not something to "fix" here.
    const arc = new Arc({ x: 0, y: 0 }, 5, 0, 0);
    expect(arc.getBounds()).toEqual([5, 0, 5, 0]);
  });

  it("getBounds only extends to axis-extreme points within the actual sweep", () => {
    // Quarter arc from 0 to pi/2 (east to south, Y-down) -- doesn't reach west or north.
    const arc = new Arc({ x: 0, y: 0 }, 10, 0, Math.PI / 2);
    const [minX, minY, maxX, maxY] = arc.getBounds();
    expect(minX).toBeCloseTo(0, 9); // never reaches the west extreme (x=-10)
    expect(minY).toBeCloseTo(0, 9); // never reaches the north extreme (y=-10)
    expect(maxX).toBeCloseTo(10, 9);
    expect(maxY).toBeCloseTo(10, 9);
  });

  it("hitTest respects the angular span, not just the radius", () => {
    const arc = new Arc({ x: 0, y: 0 }, 10, 0, Math.PI); // east to west, through south
    expect(arc.hitTest({ x: 0, y: 10 }, 0.5)).toBe(true); // south, within [0, pi]
    expect(arc.hitTest({ x: 0, y: -10 }, 0.5)).toBe(false); // north, outside the sweep
  });

  it("rotate() shifts both center and the angular span", () => {
    const arc = new Arc({ x: 10, y: 0 }, 5, 0, Math.PI / 2);
    arc.rotate(0, 0, Math.PI / 2);
    expect(arc.center.x).toBeCloseTo(0, 9);
    expect(arc.center.y).toBeCloseTo(10, 9);
    expect(arc.startAngle).toBeCloseTo(Math.PI / 2, 9);
    expect(arc.endAngle).toBeCloseTo(Math.PI, 9);
  });

  it("copy() gets a fresh id", () => {
    const arc = new Arc({ x: 0, y: 0 }, 5, 0, 1);
    expect(arc.copy().id).not.toBe(arc.id);
  });
});
