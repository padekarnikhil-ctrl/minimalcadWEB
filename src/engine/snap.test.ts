import { describe, expect, it } from "vitest";
import { findSnap } from "./snap";
import { Line } from "../entities/line";
import { Circle } from "../entities/circle";
import { Arc } from "../entities/arc";
import { Polyline } from "../entities/polyline";

describe("findSnap", () => {
  it("Endpoint of a Line", () => {
    const line = new Line({ x: 0, y: 0 }, { x: 100, y: 0 });
    const match = findSnap({ x: 0.5, y: 0 }, [line], 5);
    expect(match?.snapType).toBe("ENDPOINT");
    expect(match?.point).toEqual({ x: 0, y: 0 });
  });

  it("Midpoint of a Line", () => {
    const line = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    const match = findSnap({ x: 5.2, y: 0 }, [line], 2);
    expect(match?.snapType).toBe("MIDPOINT");
    expect(match?.point).toEqual({ x: 5, y: 0 });
  });

  it("Center of a Circle", () => {
    const circle = new Circle({ x: 20, y: 20 }, 5);
    const match = findSnap({ x: 20.3, y: 19.8 }, [circle], 2);
    expect(match?.snapType).toBe("CENTER");
    expect(match?.point).toEqual({ x: 20, y: 20 });
  });

  it("Quadrant of a Circle", () => {
    const circle = new Circle({ x: 0, y: 0 }, 10);
    const match = findSnap({ x: 10.1, y: 0.1 }, [circle], 2);
    expect(match?.snapType).toBe("QUADRANT");
    expect(match?.point).toEqual({ x: 10, y: 0 });
  });

  it("Quadrant respects an Arc's own angular span (won't snap outside its sweep)", () => {
    const arc = new Arc({ x: 0, y: 0 }, 10, 0, Math.PI / 2); // east-to-south quarter only
    const withinSweep = findSnap({ x: 10, y: 0.2 }, [arc], 2);
    expect(withinSweep?.snapType).toBe("QUADRANT");

    const outsideSweep = findSnap({ x: -10, y: 0.2 }, [arc], 2); // west quadrant, not in sweep
    expect(outsideSweep).toBeNull();
  });

  it("Nearest falls back when no exact feature point is close enough", () => {
    const line = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    const match = findSnap({ x: 3, y: 0.3 }, [line], 1);
    expect(match?.snapType).toBe("NEAREST");
    expect(match?.point.x).toBeCloseTo(3, 6);
    expect(match?.point.y).toBeCloseTo(0, 6);
  });

  it("returns null when nothing is within tolerance", () => {
    const line = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(findSnap({ x: 500, y: 500 }, [line], 2)).toBeNull();
  });

  it("Intersection of two crossing lines", () => {
    const a = new Line({ x: -10, y: 0 }, { x: 10, y: 0 });
    const b = new Line({ x: 0, y: -10 }, { x: 0, y: 10 });
    const match = findSnap({ x: 0.2, y: 0.2 }, [a, b], 2);
    expect(match?.snapType).toBe("INTERSECTION");
    expect(match?.point).toEqual({ x: 0, y: 0 });
  });

  it("Intersection takes priority over Nearest when both are close", () => {
    const a = new Line({ x: -10, y: 0 }, { x: 10, y: 0 });
    const b = new Line({ x: 0, y: -10 }, { x: 0, y: 10 });
    // Click right at the crossing point -- both "nearest point on a" and the
    // real intersection resolve to the same spot, but Intersection must win
    // (checked first in priority order).
    const match = findSnap({ x: 0, y: 0 }, [a, b], 2);
    expect(match?.snapType).toBe("INTERSECTION");
  });

  it("Perpendicular foot from a reference point onto a Line", () => {
    const line = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    // Foot at (2.5,0) -- 2.5 away from both the (0,0) endpoint and the (5,0)
    // midpoint, safely outside a small tolerance so neither out-competes it.
    const reference = { x: 2.5, y: 10 };
    const match = findSnap({ x: 2.55, y: 0.05 }, [line], 0.5, reference);
    expect(match?.snapType).toBe("PERPENDICULAR");
    expect(match?.point).toEqual({ x: 2.5, y: 0 });
  });

  it("Perpendicular is null without a reference point", () => {
    const line = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    // Click well away from any endpoint/midpoint/nearest-within-tolerance
    // so Perpendicular would be the only thing that could match -- but with
    // no reference point it must resolve to null (falls through to NEAREST
    // instead, which always matches a Line, so check the type isn't PERPENDICULAR).
    const match = findSnap({ x: 5, y: 0.1 }, [line], 2, null);
    expect(match?.snapType).not.toBe("PERPENDICULAR");
  });

  it("Tangent point on a Circle from an external reference point", () => {
    const circle = new Circle({ x: 0, y: 0 }, 5);
    const reference = { x: 20, y: 0 }; // well outside the circle
    // The two tangent points from (20,0) to a radius-5 circle at the origin
    // are at angle +-acos(5/20) from the reference direction (which is 0).
    const alpha = Math.acos(5 / 20);
    const tangentPt = { x: 5 * Math.cos(alpha), y: 5 * Math.sin(alpha) };
    // Tolerance kept below this tangent point's ~1.26 distance to the nearest
    // quadrant point (0,5), so QUADRANT (checked first) doesn't out-compete it.
    const match = findSnap(tangentPt, [circle], 0.5, reference);
    expect(match?.snapType).toBe("TANGENT");
    expect(match?.point.x).toBeCloseTo(tangentPt.x, 6);
    expect(match?.point.y).toBeCloseTo(tangentPt.y, 6);
  });

  it("Tangent is null when the reference point is inside the circle", () => {
    const circle = new Circle({ x: 0, y: 0 }, 5);
    const match = findSnap({ x: 5, y: 0.1 }, [circle], 2, { x: 1, y: 1 });
    expect(match?.snapType).not.toBe("TANGENT");
  });

  it("Center-via-curve-hover: hovering anywhere on the circle's edge resolves to CENTER", () => {
    const circle = new Circle({ x: 50, y: 50 }, 20);
    // Click on the circle's own drawn edge at a non-quadrant angle (45deg),
    // far from the exact center point.
    const onEdge = { x: 50 + 20 * Math.cos(Math.PI / 4), y: 50 + 20 * Math.sin(Math.PI / 4) };
    const match = findSnap(onEdge, [circle], 2);
    expect(match?.snapType).toBe("CENTER");
    expect(match?.point).toEqual({ x: 50, y: 50 });
  });

  it("Polyline edges snap via their own expanded Line/Arc segments", () => {
    const pl = new Polyline([
      { point: { x: 0, y: 0 }, bulge: 0 },
      { point: { x: 10, y: 0 }, bulge: 0 },
    ]);
    const match = findSnap({ x: 0.2, y: 0 }, [pl], 2);
    expect(match?.snapType).toBe("ENDPOINT");
    expect(match?.point).toEqual({ x: 0, y: 0 });
  });
});
