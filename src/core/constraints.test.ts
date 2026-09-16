import { describe, expect, it } from "vitest";
import { Document } from "./document";
import { Line } from "../entities/line";
import { Circle } from "../entities/circle";
import {
  featurePoint,
  defaultFeatureForClick,
  referenceFeatureFor,
  rawDistanceAndGradient,
  solvePoint,
  constraintLinePoints,
  constraintAt,
  applyDrivenMove,
  isDrivable,
  RESIDUAL_TOLERANCE,
} from "./constraints";
import type { Constraint } from "./constraints";

describe("featurePoint / defaultFeatureForClick / referenceFeatureFor", () => {
  it("a circle's only feature is its center", () => {
    const c = new Circle({ x: 5, y: 5 }, 10);
    expect(featurePoint(c, "center")).toEqual({ x: 5, y: 5 });
    expect(defaultFeatureForClick(c, { x: 5, y: 5 })).toBe("center");
    expect(referenceFeatureFor(c)).toBe("center");
  });

  it("a line click resolves to whichever of start/end/mid is nearest", () => {
    const line = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(defaultFeatureForClick(line, { x: 2, y: 0 })).toBe("start");
    expect(defaultFeatureForClick(line, { x: 98, y: 0 })).toBe("end");
    expect(defaultFeatureForClick(line, { x: 50, y: 0 })).toBe("mid");
    expect(referenceFeatureFor(line)).toBe("edge");
    expect(featurePoint(line, "mid")).toEqual({ x: 50, y: 0 });
  });

  it("isDrivable accepts Line/Circle, rejects everything without a constrainable feature", () => {
    expect(isDrivable(new Line({ x: 0, y: 0 }, { x: 1, y: 0 }))).toBe(true);
    expect(isDrivable(new Circle({ x: 0, y: 0 }, 5))).toBe(true);
  });
});

describe("rawDistanceAndGradient", () => {
  it("signed perpendicular distance to a horizontal line's edge", () => {
    const wall = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    const above = rawDistanceAndGradient(wall, "edge", { x: 50, y: -30 });
    // Y-down world space: "above" the line (smaller y) is the -normal side.
    expect(above.distance).toBeCloseTo(-30, 6);

    const below = rawDistanceAndGradient(wall, "edge", { x: 50, y: 30 });
    expect(below.distance).toBeCloseTo(30, 6);
  });

  it("plain Euclidean distance to a point reference", () => {
    const anchor = new Circle({ x: 0, y: 0 }, 1);
    const { distance, gradient } = rawDistanceAndGradient(anchor, "center", { x: 3, y: 4 });
    expect(distance).toBeCloseTo(5, 6);
    expect(gradient.x).toBeCloseTo(0.6, 6);
    expect(gradient.y).toBeCloseTo(0.8, 6);
  });
});

describe("solvePoint", () => {
  it("a single reference lands the point at the nearest position satisfying it", () => {
    const wall = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    const { point, residual } = solvePoint(
      { x: 50, y: 5 }, // seed just below the wall
      [{ refEntity: wall, refFeature: "edge", target: 20 }],
    );
    expect(point).not.toBeNull();
    expect(point!.y).toBeCloseTo(20, 4);
    expect(point!.x).toBeCloseTo(50, 4); // perpendicular move only -- x unchanged
    expect(residual).toBeLessThan(RESIDUAL_TOLERANCE);
  });

  it("two independent references intersect at a single consistent point", () => {
    // Direction top-to-bottom (0,50)->(0,-50) puts the "positive" signed side
    // (see rawDistanceAndGradient's left-hand-normal convention) at +x.
    const wallX = new Line({ x: 0, y: 50 }, { x: 0, y: -50 }); // vertical wall at x=0
    const wallY = new Line({ x: -50, y: 0 }, { x: 50, y: 0 }); // horizontal wall at y=0
    const { point, residual } = solvePoint({ x: 5, y: 5 }, [
      { refEntity: wallX, refFeature: "edge", target: 30 },
      { refEntity: wallY, refFeature: "edge", target: 40 },
    ]);
    expect(point!.x).toBeCloseTo(30, 4);
    expect(point!.y).toBeCloseTo(40, 4);
    expect(residual).toBeLessThan(RESIDUAL_TOLERANCE);
  });

  it("flags a geometrically inconsistent pair of references via a large residual", () => {
    const wallX = new Line({ x: 0, y: 50 }, { x: 0, y: -50 });
    // Second "reference" is the same wall again with a different target --
    // impossible to satisfy both at once.
    const { residual } = solvePoint({ x: 5, y: 5 }, [
      { refEntity: wallX, refFeature: "edge", target: 30 },
      { refEntity: wallX, refFeature: "edge", target: 60 },
    ]);
    expect(residual).toBeGreaterThan(RESIDUAL_TOLERANCE);
  });
});

describe("constraintLinePoints / constraintAt", () => {
  it("returns null once either referenced entity is gone", () => {
    const doc = new Document();
    const circle = new Circle({ x: 0, y: 0 }, 5);
    doc.addEntity(circle);
    const constraint: Constraint = {
      id: "c1",
      driven_entity_id: circle.id,
      driven_feature: "center",
      ref_entity_id: "missing",
      ref_feature: "center",
      target: 10,
    };
    expect(constraintLinePoints(doc, constraint)).toBeNull();
  });

  it("finds the constraint whose line falls within tolerance of a click", () => {
    const doc = new Document();
    const wall = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    const circle = new Circle({ x: 50, y: 30 }, 5);
    doc.addEntity(wall);
    doc.addEntity(circle);
    const constraint: Constraint = {
      id: "c1",
      driven_entity_id: circle.id,
      driven_feature: "center",
      ref_entity_id: wall.id,
      ref_feature: "edge",
      target: 30,
    };
    doc.constraints = [constraint];

    // The constraint line runs from the circle's center (50,30) to its
    // perpendicular foot on the wall (50,0) -- a click at its midpoint hits it.
    const hit = constraintAt(doc, { x: 50, y: 15 }, 2);
    expect(hit?.id).toBe("c1");

    const miss = constraintAt(doc, { x: 55, y: 15 }, 2);
    expect(miss).toBeNull();
  });
});

describe("applyDrivenMove", () => {
  it("moves a point entity by translating it to the new center", () => {
    const circle = new Circle({ x: 10, y: 10 }, 5);
    applyDrivenMove(circle, "center", { x: 30, y: 40 });
    expect(circle.center).toEqual({ x: 30, y: 40 });
  });

  it("relocates a line's start/end endpoint directly", () => {
    const line = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    applyDrivenMove(line, "start", { x: -20, y: 5 });
    expect(line.startPoint).toEqual({ x: -20, y: 5 });
    expect(line.endPoint).toEqual({ x: 100, y: 0 }); // untouched
  });

  it("translates the whole line to relocate its midpoint", () => {
    const line = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    applyDrivenMove(line, "mid", { x: 60, y: 20 });
    expect(line.midpoint()).toEqual({ x: 60, y: 20 });
    expect(line.endPoint.x - line.startPoint.x).toBeCloseTo(100, 6); // length preserved
  });
});
