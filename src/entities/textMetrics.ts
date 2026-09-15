/**
 * MinimalCAD Web
 * entities/textMetrics.ts
 *
 * Shared world-space text measurement, used by both Text (entities/text.ts)
 * and Dimension (entities/dimension.ts, for its own label/gap layout --
 * ported from entities/dimension.py's `painter.fontMetrics()` calls, which
 * work the same way: build a font at a given point size and treat the
 * resulting metrics as world units directly, since the painter's own
 * world->screen transform is what actually scales it on screen).
 *
 * Backed by Canvas 2D's measureText() via a lazily-created, module-level
 * offscreen canvas -- reused across every caller rather than spinning one up
 * per call. In a non-browser environment (Vitest's "node" test environment
 * has no `document`), measurement falls back to a fixed-pitch approximation
 * so geometry (bounds/hit-test/serialize) stays fully testable without a
 * real canvas.
 */

export const FONT_FAMILY = "sans-serif";

export interface TextMetricsLite {
  width: number;
  ascent: number;
  descent: number;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx === undefined) {
    measureCtx =
      typeof document === "undefined" ? null : (document.createElement("canvas").getContext("2d") ?? null);
  }
  return measureCtx;
}

/** Text metrics at a given world-unit font size. Falls back to a fixed-pitch
 *  approximation (no real font/canvas involved) when no canvas is available. */
export function measureText(text: string, sizeUnits: number): TextMetricsLite {
  const ctx = getMeasureCtx();
  if (ctx !== null) {
    ctx.font = `${sizeUnits}px ${FONT_FAMILY}`;
    const m = ctx.measureText(text);
    const ascent = m.actualBoundingBoxAscent || sizeUnits * 0.8;
    const descent = m.actualBoundingBoxDescent || sizeUnits * 0.2;
    return { width: m.width, ascent, descent };
  }
  return { width: text.length * sizeUnits * 0.6, ascent: sizeUnits * 0.8, descent: sizeUnits * 0.2 };
}
