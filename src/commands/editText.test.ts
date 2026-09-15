import { describe, expect, it } from "vitest";
import { makeTestEngine } from "../testUtils/fakeEngine";
import { EditTextCommand } from "./editText";
import { Text } from "../entities/text";
import { Dimension } from "../entities/dimension";
import { Line } from "../entities/line";

describe("EditTextCommand", () => {
  it("edits a Text entity's string in place", () => {
    const engine = makeTestEngine();
    const text = new Text({ x: 0, y: 0 }, "Old Label");
    engine.document.addEntity(text);

    const cmd = new EditTextCommand(engine);
    cmd.start();
    cmd.begin(text);
    cmd.textInput("New Label");

    expect(text.text).toBe("New Label");
    expect(engine.document.entities).toHaveLength(1); // same entity, mutated not replaced
  });

  it("trims whitespace from the submitted text", () => {
    const engine = makeTestEngine();
    const text = new Text({ x: 0, y: 0 }, "Old");
    engine.document.addEntity(text);

    const cmd = new EditTextCommand(engine);
    cmd.start();
    cmd.begin(text);
    cmd.textInput("  Trimmed  ");

    expect(text.text).toBe("Trimmed");
  });

  it("rejects an empty submission for a Text entity, leaving it unchanged", () => {
    const engine = makeTestEngine();
    const text = new Text({ x: 0, y: 0 }, "Keep Me");
    engine.document.addEntity(text);

    const cmd = new EditTextCommand(engine);
    cmd.start();
    cmd.begin(text);
    cmd.textInput("   ");

    expect(text.text).toBe("Keep Me");
  });

  it("overrides a Dimension's displayed text via setTextOverride, not raw text mutation", () => {
    const engine = makeTestEngine();
    const dim = new Dimension("linear", {
      p1: { x: 0, y: 0 },
      p2: { x: 50, y: 0 },
      text_position: { x: 25, y: 20 },
    });
    engine.document.addEntity(dim);

    const cmd = new EditTextCommand(engine);
    cmd.start();
    cmd.begin(dim);
    cmd.textInput("TYP");

    expect(dim.data.text_override).toBe("TYP");
  });

  it("overrides a Leader's free-form text via the 'text' data field (not text_override)", () => {
    const engine = makeTestEngine();
    const leader = new Dimension("leader", {
      point: { x: 0, y: 0 },
      text_position: { x: 20, y: -10 },
      text: "Note",
    });
    engine.document.addEntity(leader);

    const cmd = new EditTextCommand(engine);
    cmd.start();
    cmd.begin(leader);
    cmd.textInput("Updated Note");

    expect(leader.data.text).toBe("Updated Note");
    expect(leader.data.text_override).toBeUndefined();
  });

  it("ignores begin() for an entity type it doesn't handle (e.g. Line)", () => {
    const engine = makeTestEngine();
    const line = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    engine.document.addEntity(line);

    const cmd = new EditTextCommand(engine);
    cmd.start();
    cmd.begin(line);
    cmd.textInput("Should be ignored");

    // No crash, no mutation -- begin() silently declined the unsupported type.
    expect(engine.document.entities).toEqual([line]);
  });

  it("pushes exactly one undo snapshot per successful edit", () => {
    const engine = makeTestEngine();
    const text = new Text({ x: 0, y: 0 }, "A");
    engine.document.addEntity(text);

    const cmd = new EditTextCommand(engine);
    cmd.start();
    cmd.begin(text);
    cmd.textInput("B");

    expect(engine.undo.canUndo()).toBe(true);
    const snapshot = engine.document.toDict();
    engine.undoAction();
    expect(engine.document.entities[0]).toBeInstanceOf(Text);
    expect((engine.document.entities[0] as Text).text).toBe("A");
    // Redo restores the edit.
    engine.redoAction();
    expect(engine.document.toDict()).toEqual(snapshot);
  });
});
