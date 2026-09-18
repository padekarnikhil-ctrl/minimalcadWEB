import { describe, expect, it } from "vitest";
import { findIntersections, inAngularSpan, lineLineIntersection } from "./intersect";
import { Line } from "../entities/line";
import { Circle } from "../entities/circle";
import { Arc } from "../entities/arc";
import { Ellipse } from "../entities/ellipse";

describe("lineLineIntersection", () => {
  it("finds the crossing point of two intersecting segments", () => {
    const a = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    const b = new Line({ x: 5, y: -5 }, { x: 5, y: 5 });
    const pt = lineLineIntersection(a, b, 0);
    expect(pt).toEqual({ x: 5, y: 0 });
  });

  it("returns null for genuinely non-intersecting segments even with gap tolerance", () => {
    const a = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    const b = new Line({ x: 100, y: 100 }, { x: 200, y: 200 });
    expect(lineLineIntersection(a, b, 5)).toBeNull();
  });

  it("gap tolerance recognizes a near-touch that falls just short of the segment", () => {
    const a = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    const b = new Line({ x: 50, y: 0.02 }, { x: 50, y: 50 }); // endpoint 0.02 above the line
    expect(lineLineIntersection(a, b, 0)).toBeNull(); // no gap tolerance -> genuinely doesn't touch
    const withTolerance = lineLineIntersection(a, b, 3.0);
    expect(withTolerance).not.toBeNull();
    expect(withTolerance!.x).toBeCloseTo(50, 6);
  });

  it("returns null for parallel lines", () => {
    const a = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    const b = new Line({ x: 0, y: 5 }, { x: 10, y: 5 });
    expect(lineLineIntersection(a, b, 5)).toBeNull();
  });
});

describe("findIntersections", () => {
  it("Line vs Circle: two crossing points", () => {
    const line = new Line({ x: -20, y: 0 }, { x: 20, y: 0 });
    const circle = new Circle({ x: 0, y: 0 }, 10);
    const pts = findIntersections(line, circle, 0);
    expect(pts).toHaveLength(2);
    expect(pts.some((p) => Math.abs(p.x - -10) < 1e-6)).toBe(true);
    expect(pts.some((p) => Math.abs(p.x - 10) < 1e-6)).toBe(true);
  });

  it("Line vs Arc: intersection outside the arc's own span is excluded", () => {
    const line = new Line({ x: -20, y: 0 }, { x: 20, y: 0 }); // crosses circle at (+-10, 0)
    const arc = new Arc({ x: 0, y: 0 }, 10, Math.PI / 4, (3 * Math.PI) / 4); // top quarter only, doesn't include (+-10,0)
    expect(findIntersections(line, arc, 0)).toHaveLength(0);
  });

  it("Circle vs Circle: two intersection points for overlapping circles", () => {
    const c1 = new Circle({ x: -3, y: 0 }, 5);
    const c2 = new Circle({ x: 3, y: 0 }, 5);
    expect(findIntersections(c1, c2, 0)).toHaveLength(2);
  });

  it("Circle vs Circle: no intersection when far apart, even accounting for gap", () => {
    const c1 = new Circle({ x: 0, y: 0 }, 5);
    const c2 = new Circle({ x: 100, y: 100 }, 5);
    expect(findIntersections(c1, c2, 5)).toHaveLength(0);
  });

  it("Line vs Ellipse: two crossing points on an axis-aligned ellipse", () => {
    const line = new Line({ x: -30, y: 0 }, { x: 30, y: 0 });
    const ellipse = new Ellipse({ x: 0, y: 0 }, 20, 10);
    const pts = findIntersections(line, ellipse, 0);
    expect(pts).toHaveLength(2);
    expect(pts.some((p) => Math.abs(p.x - -20) < 1e-6 && Math.abs(p.y) < 1e-6)).toBe(true);
    expect(pts.some((p) => Math.abs(p.x - 20) < 1e-6 && Math.abs(p.y) < 1e-6)).toBe(true);
  });

  it("Line vs Ellipse: intersection outside a partial ellipse's own span is excluded", () => {
    const line = new Line({ x: -30, y: 0 }, { x: 30, y: 0 }); // crosses full ellipse at (+-20, 0)
    const ellipse = new Ellipse({ x: 0, y: 0 }, 20, 10, 0, Math.PI / 4, (3 * Math.PI) / 4); // top only
    expect(findIntersections(line, ellipse, 0)).toHaveLength(0);
  });

  it("Circle vs Ellipse: finds the crossing points of an overlapping pair", () => {
    const circle = new Circle({ x: 0, y: 0 }, 15);
    const ellipse = new Ellipse({ x: 0, y: 0 }, 20, 10);
    const pts = findIntersections(circle, ellipse, 0);
    expect(pts.length).toBeGreaterThanOrEqual(2);
    for (const p of pts) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(15, 2);
      expect((p.x / 20) ** 2 + (p.y / 10) ** 2).toBeCloseTo(1, 2);
    }
  });

  it("Ellipse vs Ellipse: finds crossing points of two overlapping ellipses", () => {
    const e1 = new Ellipse({ x: -5, y: 0 }, 15, 8);
    const e2 = new Ellipse({ x: 5, y: 0 }, 15, 8);
    const pts = findIntersections(e1, e2, 0);
    expect(pts.length).toBeGreaterThanOrEqual(2);
    for (const p of pts) {
      expect(e1.implicitValue(p)).toBeCloseTo(0, 2);
      expect(e2.implicitValue(p)).toBeCloseTo(0, 2);
    }
  });

  it("Ellipse vs Ellipse: no intersection when far apart", () => {
    const e1 = new Ellipse({ x: 0, y: 0 }, 5, 3);
    const e2 = new Ellipse({ x: 500, y: 500 }, 5, 3);
    expect(findIntersections(e1, e2, 0)).toHaveLength(0);
  });
});

describe("inAngularSpan", () => {
  it("a point within a simple (non-wrapping) span", () => {
    expect(inAngularSpan(Math.PI / 2, 0, Math.PI)).toBe(true);
    expect(inAngularSpan((3 * Math.PI) / 2, 0, Math.PI)).toBe(false);
  });

  it("handles a wrapping span (end < start)", () => {
    // span from 3pi/2 wrapping through 0 to pi/2
    expect(inAngularSpan(0, (3 * Math.PI) / 2, Math.PI / 2)).toBe(true);
    expect(inAngularSpan(Math.PI, (3 * Math.PI) / 2, Math.PI / 2)).toBe(false);
  });

  it("forgives a hair outside the boundary via eps", () => {
    expect(inAngularSpan(-1e-9, 0, Math.PI, 1e-6)).toBe(true);
  });
});
