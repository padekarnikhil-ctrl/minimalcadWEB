import { describe, expect, it } from "vitest";
import { Line } from "./line";

describe("Line", () => {
  it("serialize/fromDict round-trips field-for-field", () => {
    const line = new Line(
      { x: 1.5, y: -2.25 },
      { x: 10, y: 20 },
      { lineType: "dashed", dxfLayer: "walls", dxfColor: 5 },
    );
    const serialized = line.serialize();
    const restored = Line.fromDict(serialized);
    expect(restored.serialize()).toEqual(serialized);
  });

  it("copy() produces a distinct id, not the original's", () => {
    const line = new Line({ x: 0, y: 0 }, { x: 1, y: 1 });
    const copy = line.copy();
    expect(copy.id).not.toBe(line.id);
    expect(copy.startPoint).toEqual(line.startPoint);
  });

  it("move() translates both endpoints", () => {
    const line = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    line.move(5, 3);
    expect(line.startPoint).toEqual({ x: 5, y: 3 });
    expect(line.endPoint).toEqual({ x: 15, y: 3 });
  });

  it("rotate() about a point matches the Y-down clockwise-positive convention", () => {
    const line = new Line({ x: 10, y: 0 }, { x: 10, y: 0 });
    line.rotate(0, 0, Math.PI / 2);
    // +90deg rotation of (10,0) about origin, Y-down clockwise-positive => (0, 10)
    expect(line.startPoint.x).toBeCloseTo(0, 9);
    expect(line.startPoint.y).toBeCloseTo(10, 9);
  });

  it("hitTest is a clamped point-to-segment distance check", () => {
    const line = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(line.hitTest({ x: 5, y: 0.5 }, 1.0)).toBe(true);
    expect(line.hitTest({ x: 5, y: 5 }, 1.0)).toBe(false);
    // beyond the segment's end, clamped projection should reject
    expect(line.hitTest({ x: 15, y: 0 }, 1.0)).toBe(false);
  });

  it("getBounds returns the axis-aligned box regardless of endpoint order", () => {
    const line = new Line({ x: 10, y: 10 }, { x: 0, y: -5 });
    expect(line.getBounds()).toEqual([0, -5, 10, 10]);
  });

  it("degenerate zero-length line hitTest falls back to point distance", () => {
    const line = new Line({ x: 5, y: 5 }, { x: 5, y: 5 });
    expect(line.hitTest({ x: 5.5, y: 5 }, 1.0)).toBe(true);
    expect(line.hitTest({ x: 10, y: 5 }, 1.0)).toBe(false);
  });
});
