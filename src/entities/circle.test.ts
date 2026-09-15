import { describe, expect, it } from "vitest";
import { Circle } from "./circle";

describe("Circle", () => {
  it("serialize/fromDict round-trips field-for-field", () => {
    const circle = new Circle({ x: 5, y: -3 }, 12.5, { lineType: "dashed", dxfColor: 7 });
    const serialized = circle.serialize();
    expect(Circle.fromDict(serialized).serialize()).toEqual(serialized);
  });

  it("hitTest is edge-only, not filled-interior", () => {
    const circle = new Circle({ x: 0, y: 0 }, 10);
    expect(circle.hitTest({ x: 10, y: 0 }, 0.5)).toBe(true); // on the edge
    expect(circle.hitTest({ x: 0, y: 0 }, 0.5)).toBe(false); // dead center, not the edge
    expect(circle.hitTest({ x: 5, y: 0 }, 0.5)).toBe(false); // inside, not the edge
  });

  it("move translates the center only", () => {
    const circle = new Circle({ x: 0, y: 0 }, 5);
    circle.move(3, 4);
    expect(circle.center).toEqual({ x: 3, y: 4 });
    expect(circle.radius).toBe(5);
  });

  it("rotate is a no-op on radius, only moves the center", () => {
    const circle = new Circle({ x: 10, y: 0 }, 5);
    circle.rotate(0, 0, Math.PI / 2);
    expect(circle.center.x).toBeCloseTo(0, 9);
    expect(circle.center.y).toBeCloseTo(10, 9);
    expect(circle.radius).toBe(5);
  });

  it("getBounds is the axis-aligned box of radius r around center", () => {
    const circle = new Circle({ x: 5, y: 5 }, 2);
    expect(circle.getBounds()).toEqual([3, 3, 7, 7]);
  });

  it("copy() gets a fresh id", () => {
    const circle = new Circle({ x: 0, y: 0 }, 1);
    expect(circle.copy().id).not.toBe(circle.id);
  });
});
