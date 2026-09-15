import { describe, expect, it } from "vitest";
import { circleOfRadiusThrough2Points, circumcircleThrough3Points } from "./fit";

describe("circumcircleThrough3Points", () => {
  it("fits the known unit circle through 3 points on it", () => {
    const fit = circumcircleThrough3Points({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 })!;
    expect(fit).not.toBeNull();
    expect(fit.center.x).toBeCloseTo(0, 9);
    expect(fit.center.y).toBeCloseTo(0, 9);
    expect(fit.radius).toBeCloseTo(1, 9);
  });

  it("the sweep from startAngle to endAngle passes through the third point", () => {
    const p1 = { x: 1, y: 0 };
    const p2 = { x: 0, y: 1 };
    const p3 = { x: -1, y: 0 };
    const fit = circumcircleThrough3Points(p1, p2, p3)!;
    const p3Angle = Math.atan2(p3.y - fit.center.y, p3.x - fit.center.x);
    const twoPi = 2 * Math.PI;
    const relOffset = ((p3Angle - fit.startAngle) % twoPi + twoPi) % twoPi;
    const sweep = ((fit.endAngle - fit.startAngle) % twoPi + twoPi) % twoPi;
    expect(relOffset).toBeLessThanOrEqual(sweep + 1e-9);
  });

  it("returns null for collinear points", () => {
    expect(circumcircleThrough3Points({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull();
  });
});

describe("circleOfRadiusThrough2Points", () => {
  it("fits a semicircle when radius equals half the chord", () => {
    const fit = circleOfRadiusThrough2Points({ x: -5, y: 0 }, { x: 5, y: 0 }, 5, { x: 0, y: 5 })!;
    expect(fit).not.toBeNull();
    expect(fit.center.x).toBeCloseTo(0, 9);
    expect(fit.center.y).toBeCloseTo(0, 9);
    expect(fit.radius).toBeCloseTo(5, 9);
  });

  it("bulges away from the side hint", () => {
    const p1 = { x: -5, y: 0 };
    const p2 = { x: 5, y: 0 };
    const above = circleOfRadiusThrough2Points(p1, p2, 10, { x: 0, y: -1 })!; // hint below -> center above
    expect(above.center.y).toBeGreaterThan(0);

    const below = circleOfRadiusThrough2Points(p1, p2, 10, { x: 0, y: 1 })!; // hint above -> center below
    expect(below.center.y).toBeLessThan(0);
  });

  it("returns null when the radius is too small to span the chord", () => {
    expect(circleOfRadiusThrough2Points({ x: -5, y: 0 }, { x: 5, y: 0 }, 3, { x: 0, y: 1 })).toBeNull();
  });

  it("returns null for coincident points", () => {
    expect(circleOfRadiusThrough2Points({ x: 1, y: 1 }, { x: 1, y: 1 }, 5, { x: 0, y: 0 })).toBeNull();
  });
});
