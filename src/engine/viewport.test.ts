import { describe, expect, it } from "vitest";
import { Viewport } from "./viewport";

function makeViewport(width = 800, height = 600): Viewport {
  return new Viewport(
    () => width,
    () => height,
  );
}

describe("Viewport: screen/world round-trip", () => {
  it("worldToScreen and screenToWorld are exact inverses at any zoom/pan", () => {
    const vp = makeViewport();
    vp.zoom = 3.7;
    vp.panOffset = { x: 42, y: -17 };

    const world = { x: 123.456, y: -78.9 };
    const screen = vp.worldToScreen(world);
    const roundTripped = vp.screenToWorld(screen);

    expect(roundTripped.x).toBeCloseTo(world.x, 9);
    expect(roundTripped.y).toBeCloseTo(world.y, 9);
  });
});

describe("Viewport: zoomByFactor / zoomAtCursor", () => {
  it("keeps the cursor's world point fixed under the cursor after zooming", () => {
    const vp = makeViewport();
    const cursor = { x: 300, y: 200 };
    const worldUnderCursorBefore = vp.screenToWorld(cursor);

    vp.zoomByFactor(cursor, 2.0);

    const worldUnderCursorAfter = vp.screenToWorld(cursor);
    expect(worldUnderCursorAfter.x).toBeCloseTo(worldUnderCursorBefore.x, 9);
    expect(worldUnderCursorAfter.y).toBeCloseTo(worldUnderCursorBefore.y, 9);
  });

  it("repeated pinch-style zoomByFactor calls stay pinned to a moving cursor without drift", () => {
    // Mirrors what a real pinch gesture does: many small factor updates in a
    // row, each anchored at the gesture's current (slightly different)
    // midpoint -- the exact scenario the user originally reported drift in
    // (repeated wheel-equivalent zoom operations "keep getting worse").
    const vp = makeViewport();
    let cursor = { x: 400, y: 300 };
    for (let i = 0; i < 20; i++) {
      const worldBefore = vp.screenToWorld(cursor);
      vp.zoomByFactor(cursor, 1.05);
      const worldAfter = vp.screenToWorld(cursor);
      expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
      expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
      cursor = { x: cursor.x + 1, y: cursor.y - 1 }; // gesture midpoint drifts slightly each step
    }
  });

  it("zoomAtCursor with a negative wheel delta zooms in (matches the existing wheel convention)", () => {
    const vp = makeViewport();
    const before = vp.zoom;
    vp.zoomAtCursor({ x: 0, y: 0 }, -100);
    expect(vp.zoom).toBeGreaterThan(before);
  });

  it("zoomAtCursor with a positive wheel delta zooms out", () => {
    const vp = makeViewport();
    const before = vp.zoom;
    vp.zoomAtCursor({ x: 0, y: 0 }, 100);
    expect(vp.zoom).toBeLessThan(before);
  });

  it("refuses to zoom past MIN_ZOOM/MAX_ZOOM, leaving zoom/pan unchanged", () => {
    const vp = makeViewport();
    vp.zoom = 0.011; // just above MIN_ZOOM
    const pan = { ...vp.panOffset };
    vp.zoomByFactor({ x: 10, y: 10 }, 0.5); // would push it below MIN_ZOOM
    expect(vp.zoom).toBeCloseTo(0.011, 9);
    expect(vp.panOffset).toEqual(pan);
  });
});

describe("Viewport: pan", () => {
  it("pan() translates panOffset by exactly the given screen delta", () => {
    const vp = makeViewport();
    vp.panOffset = { x: 10, y: 20 };
    vp.pan({ x: 5, y: -3 });
    expect(vp.panOffset).toEqual({ x: 15, y: 17 });
  });
});
