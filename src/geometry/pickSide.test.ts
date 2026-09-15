import { describe, expect, it } from "vitest";
import { clickDirectionVector, infiniteLineIntersection, keptEndpoint } from "./pickSide";
import { Line } from "../entities/line";

describe("infiniteLineIntersection", () => {
  it("finds the intersection of two lines whose SEGMENTS don't actually overlap", () => {
    // Two short segments whose infinite extensions cross well beyond either's own span.
    const l1 = new Line({ x: 0, y: 0 }, { x: 1, y: 0 });
    const l2 = new Line({ x: 5, y: -1 }, { x: 5, y: 1 });
    expect(infiniteLineIntersection(l1, l2)).toEqual({ x: 5, y: 0 });
  });

  it("returns null for parallel lines", () => {
    const l1 = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    const l2 = new Line({ x: 0, y: 5 }, { x: 10, y: 5 });
    expect(infiniteLineIntersection(l1, l2)).toBeNull();
  });
});

describe("clickDirectionVector / keptEndpoint", () => {
  it("picks whichever endpoint the click is closer to, direction-wise", () => {
    const line = new Line({ x: -10, y: 0 }, { x: 10, y: 0 });
    const corner = { x: 0, y: 0 };
    const clickNearEnd = { x: 8, y: 0 };
    const dir = clickDirectionVector(line, corner, clickNearEnd)!;
    expect(dir.x).toBeCloseTo(1, 9); // points toward endPoint (10,0)

    expect(keptEndpoint(line, dir)).toEqual({ x: 10, y: 0 });
  });

  it("returns null when the corner coincides with an endpoint", () => {
    // Simplest genuine degenerate case: a zero-length line, where both
    // candidate direction vectors (toward start and toward end) collapse to
    // the same zero-length vector regardless of which the click favors.
    const degenerate = new Line({ x: 5, y: 5 }, { x: 5, y: 5 });
    expect(clickDirectionVector(degenerate, { x: 5, y: 5 }, { x: 6, y: 5 })).toBeNull();
  });
});
