import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { makeTestEngine } from "../testUtils/fakeEngine";
import { Line } from "../entities/line";

const mockListParts = vi.fn();
const mockFetchPart = vi.fn();

vi.mock("../io/cloudParts", () => ({
  listParts: (...args: unknown[]) => mockListParts(...args),
  fetchPart: (...args: unknown[]) => mockFetchPart(...args),
}));

const { InsertLibCommand } = await import("./insertLib");

function bracketSnapshot() {
  return { entities: [new Line({ x: 100, y: 100 }, { x: 110, y: 100 }).serialize()], constraints: [] };
}

beforeEach(() => {
  mockListParts.mockReset();
  mockFetchPart.mockReset();
  // InsertLibCommand checks isSupabaseConfigured() before doing anything --
  // stub it present regardless of whether this machine/CI actually has a
  // .env.local (a real local dev file, gitignored, that a fresh CI
  // checkout never has -- these tests must not depend on it either way).
  vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("InsertLibCommand", () => {
  it("inserts immediately when the typed text matches exactly one part", async () => {
    const engine = makeTestEngine();
    mockListParts.mockResolvedValue({ ok: true, value: [{ id: "1", name: "Bracket" }] });
    mockFetchPart.mockResolvedValue({ ok: true, value: { id: "1", name: "Bracket", snapshot: bracketSnapshot() } });

    const cmd = new InsertLibCommand(engine);
    cmd.start();
    await vi.waitFor(() => expect(mockListParts).toHaveBeenCalled());

    cmd.textInput("Bracket");
    await vi.waitFor(() => expect(mockFetchPart).toHaveBeenCalledWith("1"));
    await vi.waitFor(() => expect(engine.document.entities.filter((e) => e instanceof Line)).toHaveLength(1));
  });

  it("a substring match also resolves to the single part it identifies", async () => {
    const engine = makeTestEngine();
    mockListParts.mockResolvedValue({ ok: true, value: [{ id: "1", name: "Bracket" }] });
    mockFetchPart.mockResolvedValue({ ok: true, value: { id: "1", name: "Bracket", snapshot: bracketSnapshot() } });

    const cmd = new InsertLibCommand(engine);
    cmd.start();
    await vi.waitFor(() => expect(mockListParts).toHaveBeenCalled());
    cmd.textInput("brack");

    await vi.waitFor(() => expect(mockFetchPart).toHaveBeenCalledWith("1"));
  });

  it("does not insert on an ambiguous match, and leaves it unresolved for more typing", async () => {
    const engine = makeTestEngine();
    mockListParts.mockResolvedValue({
      ok: true,
      value: [
        { id: "1", name: "Bracket Small" },
        { id: "2", name: "Bracket Large" },
      ],
    });

    const cmd = new InsertLibCommand(engine);
    cmd.start();
    await vi.waitFor(() => expect(mockListParts).toHaveBeenCalled());
    cmd.textInput("Bracket");

    expect(mockFetchPart).not.toHaveBeenCalled();
    expect(engine.document.entities).toHaveLength(0);
  });

  it("reports no match for text that identifies nothing", async () => {
    const engine = makeTestEngine();
    mockListParts.mockResolvedValue({ ok: true, value: [{ id: "1", name: "Bracket" }] });

    const cmd = new InsertLibCommand(engine);
    cmd.start();
    await vi.waitFor(() => expect(mockListParts).toHaveBeenCalled());
    cmd.textInput("nonexistent");

    expect(mockFetchPart).not.toHaveBeenCalled();
  });

  it("places the incoming part beside existing content when the document is non-empty", async () => {
    const engine = makeTestEngine();
    engine.document.addEntity(new Line({ x: 0, y: 0 }, { x: 10, y: 0 }));
    mockListParts.mockResolvedValue({ ok: true, value: [{ id: "1", name: "Bracket" }] });
    mockFetchPart.mockResolvedValue({ ok: true, value: { id: "1", name: "Bracket", snapshot: bracketSnapshot() } });

    const cmd = new InsertLibCommand(engine);
    cmd.start();
    await vi.waitFor(() => expect(mockListParts).toHaveBeenCalled());
    cmd.textInput("Bracket");
    await vi.waitFor(() => expect(engine.document.entities.filter((e) => e instanceof Line)).toHaveLength(2));

    const inserted = engine.document.entities.find((e) => e instanceof Line && e.startPoint.x > 50) as Line;
    expect(inserted).toBeDefined();
    // placeBeside offsets clear of the existing line's bounds (max x = 10) with a margin.
    expect(inserted.startPoint.x).toBeGreaterThan(10);
  });

  it("aligns the incoming part to the origin when the document starts empty", async () => {
    const engine = makeTestEngine();
    mockListParts.mockResolvedValue({ ok: true, value: [{ id: "1", name: "Bracket" }] });
    mockFetchPart.mockResolvedValue({ ok: true, value: { id: "1", name: "Bracket", snapshot: bracketSnapshot() } });

    const cmd = new InsertLibCommand(engine);
    cmd.start();
    await vi.waitFor(() => expect(mockListParts).toHaveBeenCalled());
    cmd.textInput("Bracket");
    await vi.waitFor(() => expect(engine.document.entities).toHaveLength(1));

    const line = engine.document.entities[0] as Line;
    // originAlign puts the bbox's left edge at x=0 and bottom (max Y) at y=0.
    expect(Math.min(line.startPoint.x, line.endPoint.x)).toBe(0);
    expect(Math.max(line.startPoint.y, line.endPoint.y)).toBe(0);
  });

  it("selects the newly-inserted entities, matching insert_library.py", async () => {
    const engine = makeTestEngine();
    mockListParts.mockResolvedValue({ ok: true, value: [{ id: "1", name: "Bracket" }] });
    mockFetchPart.mockResolvedValue({ ok: true, value: { id: "1", name: "Bracket", snapshot: bracketSnapshot() } });

    const cmd = new InsertLibCommand(engine);
    cmd.start();
    await vi.waitFor(() => expect(mockListParts).toHaveBeenCalled());
    cmd.textInput("Bracket");
    await vi.waitFor(() => expect(engine.document.entities).toHaveLength(1));

    expect(engine.selection.getEntities()).toEqual(engine.document.entities);
  });

  it("supports inserting multiple parts in a row without re-running the command", async () => {
    const engine = makeTestEngine();
    mockListParts.mockResolvedValue({ ok: true, value: [{ id: "1", name: "Bracket" }] });
    mockFetchPart.mockResolvedValue({ ok: true, value: { id: "1", name: "Bracket", snapshot: bracketSnapshot() } });

    const cmd = new InsertLibCommand(engine);
    cmd.start();
    await vi.waitFor(() => expect(mockListParts).toHaveBeenCalled());

    cmd.textInput("Bracket");
    await vi.waitFor(() => expect(engine.document.entities).toHaveLength(1));

    cmd.textInput("Bracket");
    await vi.waitFor(() => expect(engine.document.entities).toHaveLength(2));
  });

  it("an empty library disables input without crashing", async () => {
    const engine = makeTestEngine();
    mockListParts.mockResolvedValue({ ok: true, value: [] });

    const cmd = new InsertLibCommand(engine);
    cmd.start();
    await vi.waitFor(() => expect(mockListParts).toHaveBeenCalled());

    expect(engine.document.entities).toHaveLength(0);
  });

  describe("suggestion popup wiring (commandBar.showSuggestions/textChanged/suggestionAcceptedContinue)", () => {
    it("shows the full list once loaded, then live-filters as textChanged fires", async () => {
      const engine = makeTestEngine();
      const showSuggestions = vi.spyOn(engine.commandBar, "showSuggestions");
      mockListParts.mockResolvedValue({
        ok: true,
        value: [
          { id: "1", name: "Bracket Small" },
          { id: "2", name: "Bracket Large" },
          { id: "3", name: "Hinge" },
        ],
      });

      const cmd = new InsertLibCommand(engine);
      engine.commandManager.currentCommand = cmd;
      cmd.start();
      await vi.waitFor(() => expect(mockListParts).toHaveBeenCalled());

      expect(showSuggestions).toHaveBeenLastCalledWith(["Bracket Small", "Bracket Large", "Hinge"]);

      engine.commandBar.dispatchEvent(new CustomEvent("textChanged", { detail: "hin" }));
      expect(showSuggestions).toHaveBeenLastCalledWith(["Hinge"]);
    });

    it("does not react to popup events while a different command is active", async () => {
      const engine = makeTestEngine();
      const showSuggestions = vi.spyOn(engine.commandBar, "showSuggestions");
      mockListParts.mockResolvedValue({ ok: true, value: [{ id: "1", name: "Bracket" }] });

      const cmd = new InsertLibCommand(engine);
      // Deliberately never assigned as currentCommand -- simulates the shared
      // commandBar firing textChanged for some other active command.
      cmd.start();
      await vi.waitFor(() => expect(mockListParts).toHaveBeenCalled());
      showSuggestions.mockClear();

      engine.commandBar.dispatchEvent(new CustomEvent("textChanged", { detail: "brack" }));
      expect(showSuggestions).not.toHaveBeenCalled();
    });

    it("suggestionAcceptedContinue inserts the named part and re-shows the full list for another", async () => {
      const engine = makeTestEngine();
      const showSuggestions = vi.spyOn(engine.commandBar, "showSuggestions");
      mockListParts.mockResolvedValue({
        ok: true,
        value: [
          { id: "1", name: "Bracket" },
          { id: "2", name: "Hinge" },
        ],
      });
      mockFetchPart.mockResolvedValue({ ok: true, value: { id: "1", name: "Bracket", snapshot: bracketSnapshot() } });

      const cmd = new InsertLibCommand(engine);
      engine.commandManager.currentCommand = cmd;
      cmd.start();
      await vi.waitFor(() => expect(mockListParts).toHaveBeenCalled());

      engine.commandBar.dispatchEvent(new CustomEvent("suggestionAcceptedContinue", { detail: "Bracket" }));
      await vi.waitFor(() => expect(mockFetchPart).toHaveBeenCalledWith("1"));
      await vi.waitFor(() => expect(engine.document.entities.filter((e) => e instanceof Line)).toHaveLength(1));

      // Loops back to the unfiltered list, ready for another comma-continue or Enter.
      expect(showSuggestions).toHaveBeenLastCalledWith(["Bracket", "Hinge"]);
    });
  });
});
