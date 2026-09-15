import { describe, expect, it } from "vitest";
import { mirrorEntity, mirrorPoint } from "./reflect";
import { Line } from "../entities/line";
import { Circle } from "../entities/circle";
import { Arc } from "../entities/arc";
import { Polyline, bulgeToArc } from "../entities/polyline";

describe("mirrorPoint", () => {
  it("reflects across the X axis", () => {
    const result = mirrorPoint({ x: 3, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(result.x).toBeCloseTo(3, 9);
    expect(result.y).toBeCloseTo(-5, 9);
  });

  it("a point already on the axis is unchanged", () => {
    const result = mirrorPoint({ x: 4, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(result).toEqual({ x: 4, y: 0 });
  });

  it("degenerate (zero-length) axis returns the point unchanged", () => {
    const p = { x: 3, y: 5 };
    expect(mirrorPoint(p, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual(p);
  });
});

describe("mirrorEntity", () => {
  it("Line: both endpoints reflected", () => {
    const line = new Line({ x: 0, y: 2 }, { x: 5, y: 8 });
    const result = mirrorEntity(line, { x: 0, y: 0 }, { x: 10, y: 0 }) as Line;
    expect(result.startPoint.y).toBeCloseTo(-2, 9);
    expect(result.endPoint.y).toBeCloseTo(-8, 9);
  });

  it("Circle: center reflected, radius unchanged", () => {
    const circle = new Circle({ x: 3, y: 7 }, 4);
    const result = mirrorEntity(circle, { x: 0, y: 0 }, { x: 10, y: 0 }) as Circle;
    expect(result.center.y).toBeCloseTo(-7, 9);
    expect(result.radius).toBe(4);
  });

  it("Arc: the resulting sweep is the true geometric mirror of the original (sampled oracle)", () => {
    const arc = new Arc({ x: 0, y: 0 }, 5, 0, Math.PI / 2); // east-to-south quarter
    const axisP1 = { x: 0, y: 0 };
    const axisP2 = { x: 10, y: 0 }; // mirror across the X axis
    const result = mirrorEntity(arc, axisP1, axisP2) as Arc;

    expect(result.center.x).toBeCloseTo(0, 9);
    expect(result.center.y).toBeCloseTo(0, 9);
    expect(result.radius).toBeCloseTo(5, 9);

    // Sample points along the ORIGINAL arc's own sweep, mirror each one
    // directly, and check every mirrored point actually lands on the
    // resulting arc's own swept angular range -- a general correctness
    // oracle that doesn't depend on hand-deriving the expected angles.
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const angle = arc.startAngle + t * (arc.endAngle - arc.startAngle);
      const worldPt = arc.pointAt(angle);
      const mirrored = mirrorPoint(worldPt, axisP1, axisP2);
      const distFromNewCenter = Math.hypot(mirrored.x - result.center.x, mirrored.y - result.center.y);
      expect(distFromNewCenter).toBeCloseTo(result.radius, 6);
      const mirroredAngle = Math.atan2(mirrored.y - result.center.y, mirrored.x - result.center.x);
      expect(result.angleInSweep(mirroredAngle)).toBe(true);
    }
  });

  it("Polyline: vertices reflected and each bulge negated, not reordered", () => {
    const pl = new Polyline([
      { point: { x: 0, y: 0 }, bulge: 0.5 },
      { point: { x: 10, y: 0 }, bulge: 0 },
    ]);
    const result = mirrorEntity(pl, { x: 0, y: 0 }, { x: 0, y: 10 }) as Polyline; // mirror across the Y axis

    expect(result.vertices[0]!.point.x).toBeCloseTo(0, 9); // on the axis, unchanged
    expect(result.vertices[1]!.point.x).toBeCloseTo(-10, 9);
    expect(result.vertices[0]!.bulge).toBeCloseTo(-0.5, 9);
    expect(result.vertices[1]!.bulge).toBe(-0); // negating 0 -> -0 in JS; -0 === 0 for all arithmetic purposes

    // Sampled oracle: points along the original bulge-arc, mirrored, should
    // land on the resulting polyline's own (bulge-negated) arc segment.
    const originalArc = bulgeToArc(pl.vertices[0]!.point, pl.vertices[1]!.point, pl.vertices[0]!.bulge);
    const resultArc = bulgeToArc(result.vertices[0]!.point, result.vertices[1]!.point, result.vertices[0]!.bulge);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const angle = originalArc.startAngle + t * (originalArc.endAngle - originalArc.startAngle);
      const worldPt = originalArc.pointAt(angle);
      const mirrored = mirrorPoint(worldPt, { x: 0, y: 0 }, { x: 0, y: 10 });
      const dist = Math.hypot(mirrored.x - resultArc.center.x, mirrored.y - resultArc.center.y);
      expect(dist).toBeCloseTo(resultArc.radius, 5);
    }
  });

  it("returns null for an unsupported entity type", () => {
    const fake = { notAnEntity: true } as unknown as Line;
    expect(mirrorEntity(fake, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
  });
});
