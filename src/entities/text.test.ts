import { describe, expect, it } from "vitest";
import { Text } from "./text";

describe("Text", () => {
  it("serialize/fromDict round-trips field-for-field, with no fabricated id", () => {
    const text = new Text({ x: 1.5, y: -2.25 }, "Hello", 5, 45, "notes", 3);
    const serialized = text.serialize();
    expect(serialized).not.toHaveProperty("id");
    const restored = Text.fromDict(serialized);
    expect(restored.serialize()).toEqual(serialized);
  });

  it("fromDict fills in defaults for a minimal payload", () => {
    const restored = Text.fromDict({ position: [1, 2], text: "hi" });
    expect(restored.height).toBe(3.5);
    expect(restored.rotation).toBe(0);
    expect(restored.dxfLayer).toBe("0");
    expect(restored.dxfColor).toBeNull();
  });

  it("copy() produces an independent instance with the same fields", () => {
    const text = new Text({ x: 0, y: 0 }, "abc", 4, 90);
    const copy = text.copy();
    expect(copy).not.toBe(text);
    expect(copy.serialize()).toEqual(text.serialize());
  });

  it("move() translates the insertion point", () => {
    const text = new Text({ x: 0, y: 0 }, "abc");
    text.move(5, 3);
    expect(text.position).toEqual({ x: 5, y: 3 });
  });

  it("rotate() about a point matches the Y-down clockwise-positive convention and normalizes to [0,360)", () => {
    const text = new Text({ x: 10, y: 0 }, "abc", 3.5, 350);
    text.rotate(0, 0, Math.PI / 2);
    // +90deg rotation of (10,0) about origin, Y-down clockwise-positive => (0, 10)
    expect(text.position.x).toBeCloseTo(0, 9);
    expect(text.position.y).toBeCloseTo(10, 9);
    // 350 + 90 = 440 -> normalized to 80
    expect(text.rotation).toBeCloseTo(80, 9);
  });

  it("hitTest accepts a click within the (approximated) text bounding box and rejects far away", () => {
    const text = new Text({ x: 0, y: 0 }, "abc", 5);
    expect(text.hitTest({ x: 1, y: -1 })).toBe(true);
    expect(text.hitTest({ x: 1000, y: 1000 })).toBe(false);
  });

  it("getBounds widens as rotation is applied (corners sweep outward)", () => {
    const text = new Text({ x: 0, y: 0 }, "abc", 5, 0);
    const [, , unrotatedX1] = text.getBounds();
    text.rotation = 45;
    const [x0, y0, x1, y1] = text.getBounds();
    expect(x1 - x0).toBeGreaterThan(0);
    expect(y1 - y0).toBeGreaterThan(0);
    expect(x1).not.toBe(unrotatedX1);
  });
});
