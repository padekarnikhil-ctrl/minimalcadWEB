import { describe, expect, it } from "vitest";
import { Selection } from "./selection";
import { Line } from "../entities/line";

describe("Selection", () => {
  it("select/deselect/isSelected/clear", () => {
    const sel = new Selection();
    const a = new Line({ x: 0, y: 0 }, { x: 1, y: 1 });
    const b = new Line({ x: 1, y: 1 }, { x: 2, y: 2 });

    expect(sel.isSelected(a)).toBe(false);
    sel.select(a);
    sel.select(b);
    expect(sel.isSelected(a)).toBe(true);
    expect(sel.getEntities()).toHaveLength(2);

    sel.deselect(a);
    expect(sel.isSelected(a)).toBe(false);
    expect(sel.getEntities()).toEqual([b]);

    sel.clear();
    expect(sel.getEntities()).toEqual([]);
  });

  it("selecting the same entity twice is idempotent (it's a Set)", () => {
    const sel = new Selection();
    const a = new Line({ x: 0, y: 0 }, { x: 1, y: 1 });
    sel.select(a);
    sel.select(a);
    expect(sel.getEntities()).toEqual([a]);
  });
});
