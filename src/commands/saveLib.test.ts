import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { makeTestEngine } from "../testUtils/fakeEngine";
import { Line } from "../entities/line";

const mockCreatePart = vi.fn();

vi.mock("../io/cloudParts", () => ({
  createPart: (...args: unknown[]) => mockCreatePart(...args),
}));

const { SaveLibCommand } = await import("./saveLib");

beforeEach(() => {
  mockCreatePart.mockReset();
  // SaveLibCommand checks isSupabaseConfigured() before doing anything --
  // stub it present regardless of whether this machine/CI actually has a
  // .env.local (a real local dev file, gitignored, that a fresh CI
  // checkout never has -- these tests must not depend on it either way).
  vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SaveLibCommand", () => {
  it("saves only the current selection when something is selected", async () => {
    const engine = makeTestEngine();
    const a = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
    const b = new Line({ x: 0, y: 0 }, { x: 0, y: 10 });
    engine.document.addEntity(a);
    engine.document.addEntity(b);
    engine.selection.select(a);
    mockCreatePart.mockResolvedValue({ ok: true, value: { id: "1", name: "Bracket" } });

    const cmd = new SaveLibCommand(engine);
    cmd.start();
    cmd.textInput("Bracket");

    await vi.waitFor(() => expect(mockCreatePart).toHaveBeenCalled());
    const [name, snapshot] = mockCreatePart.mock.calls[0]!;
    expect(name).toBe("Bracket");
    expect(snapshot.entities).toEqual([a.serialize()]);
  });

  it("saves the whole document when nothing is selected", async () => {
    const engine = makeTestEngine();
    engine.document.addEntity(new Line({ x: 0, y: 0 }, { x: 10, y: 0 }));
    engine.document.addEntity(new Line({ x: 0, y: 0 }, { x: 0, y: 10 }));
    mockCreatePart.mockResolvedValue({ ok: true, value: { id: "1", name: "Whole" } });

    const cmd = new SaveLibCommand(engine);
    cmd.start();
    cmd.textInput("Whole");

    await vi.waitFor(() => expect(mockCreatePart).toHaveBeenCalled());
    const [, snapshot] = mockCreatePart.mock.calls[0]!;
    expect(snapshot.entities).toHaveLength(2);
  });

  it("rejects an empty/whitespace name without calling createPart", () => {
    const engine = makeTestEngine();
    engine.document.addEntity(new Line({ x: 0, y: 0 }, { x: 10, y: 0 }));
    const cmd = new SaveLibCommand(engine);
    cmd.start();
    cmd.textInput("   ");
    expect(mockCreatePart).not.toHaveBeenCalled();
  });

  it("refuses to save when the document is empty (matches save_library.py's own check)", () => {
    const engine = makeTestEngine();
    const cmd = new SaveLibCommand(engine);
    cmd.start();
    cmd.textInput("Anything");
    expect(mockCreatePart).not.toHaveBeenCalled();
  });

  it("stays usable after a name-collision error, so a retry with a different name still works", async () => {
    const engine = makeTestEngine();
    engine.document.addEntity(new Line({ x: 0, y: 0 }, { x: 10, y: 0 }));
    mockCreatePart.mockResolvedValue({ ok: false, error: 'A part named "Bracket" already exists' });

    const cmd = new SaveLibCommand(engine);
    cmd.start();
    cmd.textInput("Bracket");
    await vi.waitFor(() => expect(mockCreatePart).toHaveBeenCalledTimes(1));

    mockCreatePart.mockResolvedValue({ ok: true, value: { id: "2", name: "Bracket2" } });
    cmd.textInput("Bracket2");
    await vi.waitFor(() => expect(mockCreatePart).toHaveBeenCalledTimes(2));
  });

  it("a stale in-flight save from a cancelled activation doesn't corrupt a later one", async () => {
    const engine = makeTestEngine();
    engine.document.addEntity(new Line({ x: 0, y: 0 }, { x: 10, y: 0 }));

    let resolveFirst: (v: { ok: true; value: { id: string; name: string } }) => void = () => {};
    mockCreatePart.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const cmd = new SaveLibCommand(engine);
    cmd.start();
    cmd.textInput("First");
    // Wait for the first save to actually be in flight before cancelling,
    // so this deterministically tests "cancelled while pending" rather than
    // racing the cancel against the dynamic import's own microtask.
    await vi.waitFor(() => expect(mockCreatePart).toHaveBeenCalledTimes(1));

    cmd.cancel();
    cmd.start();

    // Resolving the stale first call after cancellation must not throw or
    // leave the command in a broken state.
    resolveFirst({ ok: true, value: { id: "1", name: "First" } });
    await Promise.resolve();
    await Promise.resolve();

    mockCreatePart.mockResolvedValueOnce({ ok: true, value: { id: "2", name: "Second" } });
    cmd.textInput("Second");
    await vi.waitFor(() => expect(mockCreatePart).toHaveBeenCalledTimes(2));
  });
});
