import { describe, expect, it } from "vitest";
import { Ellipse } from "./ellipse";

describe("Ellipse", () => {
  it("serialize/fromDict round-trips field-for-field", () => {
    const ellipse = new Ellipse({ x: 5, y: -3 }, 12, 6, Math.PI / 6, 0, Math.PI, { dxfColor: 3 });
    const serialized = ellipse.serialize();
    expect(Ellipse.fromDict(serialized).serialize()).toEqual(serialized);
  });

  it("defaults to a full ellipse (0..2*PI sweep)", () => {
    const ellipse = new Ellipse({ x: 0, y: 0 }, 10, 5);
    expect(ellipse.isFull()).toBe(true);
  });

  it("isFull is false for a genuine partial sweep", () => {
    const ellipse = new Ellipse({ x: 0, y: 0 }, 10, 5, 0, 0, Math.PI / 2);
    expect(ellipse.isFull()).toBe(false);
  });

  it("axisPoints returns the 4 major/minor endpoints, rotated", () => {
    const ellipse = new Ellipse({ x: 0, y: 0 }, 10, 5, 0);
    const [east, west, south, north] = ellipse.axisPoints();
    expect(east).toEqual({ x: 10, y: 0 });
    expect(west).toEqual({ x: -10, y: 0 });
    expect(south.y).toBeCloseTo(5);
    expect(north.y).toBeCloseTo(-5);
  });

  it("move translates the center only", () => {
    const ellipse = new Ellipse({ x: 0, y: 0 }, 10, 5);
    ellipse.move(3, 4);
    expect(ellipse.center).toEqual({ x: 3, y: 4 });
    expect(ellipse.radiusX).toBe(10);
  });

  it("rotate spins both the center (about the pivot) and the ellipse's own rotation", () => {
    const ellipse = new Ellipse({ x: 10, y: 0 }, 10, 5, 0);
    ellipse.rotate(0, 0, Math.PI / 2);
    expect(ellipse.center.x).toBeCloseTo(0);
    expect(ellipse.center.y).toBeCloseTo(10);
    expect(ellipse.rotation).toBeCloseTo(Math.PI / 2);
  });

  it("getBounds for an unrotated full ellipse is the plain axis-aligned box", () => {
    const ellipse = new Ellipse({ x: 5, y: 5 }, 10, 4);
    const [x0, y0, x1, y1] = ellipse.getBounds();
    expect(x0).toBeCloseTo(-5);
    expect(y0).toBeCloseTo(1);
    expect(x1).toBeCloseTo(15);
    expect(y1).toBeCloseTo(9);
  });

  it("getBounds for a partial sweep is tighter than the full parent ellipse's box", () => {
    const full = new Ellipse({ x: 0, y: 0 }, 10, 10, 0, 0, 2 * Math.PI);
    const quarter = new Ellipse({ x: 0, y: 0 }, 10, 10, 0, 0, Math.PI / 2);
    const fullBounds = full.getBounds();
    const quarterBounds = quarter.getBounds();
    expect(quarterBounds[2] - quarterBounds[0]).toBeLessThan(fullBounds[2] - fullBounds[0]);
  });

  it("hitTest is edge-only (flat world-unit tolerance, not radius-normalized)", () => {
    const ellipse = new Ellipse({ x: 0, y: 0 }, 10, 5);
    expect(ellipse.hitTest({ x: 10, y: 0 }, 0.5)).toBe(true); // on the major axis edge
    expect(ellipse.hitTest({ x: 0, y: 5 }, 0.5)).toBe(true); // on the minor axis edge
    expect(ellipse.hitTest({ x: 0, y: 0 }, 0.5)).toBe(false); // dead center
    expect(ellipse.hitTest({ x: 5, y: 0 }, 0.5)).toBe(false); // interior
  });

  it("hitTest respects a partial sweep's angular range", () => {
    const ellipse = new Ellipse({ x: 0, y: 0 }, 10, 10, 0, 0, Math.PI / 2); // quarter, first quadrant only
    expect(ellipse.hitTest({ x: 0, y: -10 }, 0.5)).toBe(false); // on the full circle but outside this sweep
  });

  it("nearestBoundaryPoint is self-consistent: a point already on the boundary maps to itself", () => {
    const ellipse = new Ellipse({ x: 2, y: -1 }, 10, 4, Math.PI / 5);
    const [east] = ellipse.axisPoints();
    const boundary = ellipse.nearestBoundaryPoint(east)!;
    expect(boundary.x).toBeCloseTo(east.x);
    expect(boundary.y).toBeCloseTo(east.y);
  });

  it("nearestBoundaryPoint returns null exactly at the center", () => {
    const ellipse = new Ellipse({ x: 3, y: 3 }, 10, 4);
    expect(ellipse.nearestBoundaryPoint({ x: 3, y: 3 })).toBeNull();
  });

  it("copy() gets a fresh id", () => {
    const ellipse = new Ellipse({ x: 0, y: 0 }, 10, 5);
    expect(ellipse.copy().id).not.toBe(ellipse.id);
  });
});
