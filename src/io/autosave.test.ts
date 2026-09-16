import { describe, expect, it, vi, beforeEach } from "vitest";

interface FakeResult<T> {
  data: T | null;
  error: { message: string } | null;
}

/** Same minimal chainable-and-thenable stand-in as io/cloudDrawings.test.ts's
 *  own makeChain -- see that file for why every method just returns the
 *  builder itself. */
function makeChain<T>(result: FakeResult<T>) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    insert: () => builder,
    update: () => builder,
    delete: () => builder,
    single: () => builder,
    maybeSingle: () => builder,
    then<TResult1 = FakeResult<T>, TResult2 = never>(
      onfulfilled?: ((value: FakeResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(result).then(onfulfilled, onrejected);
    },
  };
  return builder;
}

const mockFrom = vi.fn();

vi.mock("../lib/supabaseClient", () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));

const { loadAutosave, writeAutosave, clearAutosave, resetAutosaveSession } = await import("./autosave");

beforeEach(() => {
  mockFrom.mockReset();
  resetAutosaveSession();
});

describe("loadAutosave", () => {
  it("returns null (not an error) when the account has never autosaved", async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }));
    const result = await loadAutosave();
    expect(result).toEqual({ ok: true, value: null });
  });

  it("validates and returns the stored snapshot", async () => {
    mockFrom.mockReturnValue(
      makeChain({
        data: { id: "row-1", document: { entities: [], constraints: [] }, updated_at: "2026-01-02T00:00:00Z" },
        error: null,
      }),
    );
    const result = await loadAutosave();
    expect(result).toEqual({
      ok: true,
      value: { snapshot: { entities: [], constraints: [] }, updatedAt: "2026-01-02T00:00:00Z" },
    });
  });

  it("rejects a malformed stored document", async () => {
    mockFrom.mockReturnValue(
      makeChain({ data: { id: "row-1", document: "garbage", updated_at: "2026-01-01T00:00:00Z" }, error: null }),
    );
    const result = await loadAutosave();
    expect(result.ok).toBe(false);
  });

  it("propagates a query error", async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: "network error" } }));
    const result = await loadAutosave();
    expect(result).toEqual({ ok: false, error: "network error" });
  });
});

describe("writeAutosave", () => {
  it("inserts a new row the first time it's called", async () => {
    mockFrom.mockReturnValue(makeChain({ data: { id: "new-row" }, error: null }));
    const result = await writeAutosave({ entities: [], constraints: [] });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(mockFrom).toHaveBeenCalledWith("drawings");
  });

  it("updates the same row on subsequent calls instead of inserting again", async () => {
    mockFrom.mockReturnValueOnce(makeChain({ data: { id: "row-1" }, error: null }));
    await writeAutosave({ entities: [], constraints: [] });

    // The cached row id from the first call means this second write should
    // resolve via a single update/eq/select/maybeSingle chain -- exactly one
    // more mockFrom call, with no separate insert-fallback chain needed.
    mockFrom.mockReturnValueOnce(makeChain({ data: { id: "row-1" }, error: null }));
    const result = await writeAutosave({ entities: [{ type: "line" }], constraints: [] });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it("re-creates the row if the cached one was deleted elsewhere", async () => {
    mockFrom.mockReturnValueOnce(makeChain({ data: { id: "row-1" }, error: null }));
    await writeAutosave({ entities: [], constraints: [] });

    // The update against the now-missing row resolves with no row (RLS/PostgREST
    // returns null data rather than an error for a vanished match).
    mockFrom.mockReturnValueOnce(makeChain({ data: null, error: null }));
    mockFrom.mockReturnValueOnce(makeChain({ data: { id: "row-2" }, error: null }));

    const result = await writeAutosave({ entities: [], constraints: [] });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(mockFrom).toHaveBeenCalledTimes(3);
  });

  it("surfaces the underlying error on failure", async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: "permission denied" } }));
    const result = await writeAutosave({ entities: [], constraints: [] });
    expect(result).toEqual({ ok: false, error: "permission denied" });
  });
});

describe("clearAutosave", () => {
  it("is a no-op (ok) when nothing has been written yet this session", async () => {
    const result = await clearAutosave();
    expect(result).toEqual({ ok: true, value: undefined });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("deletes the cached row", async () => {
    mockFrom.mockReturnValueOnce(makeChain({ data: { id: "row-1" }, error: null }));
    await writeAutosave({ entities: [], constraints: [] });

    mockFrom.mockReturnValueOnce(makeChain({ data: null, error: null }));
    const result = await clearAutosave();
    expect(result).toEqual({ ok: true, value: undefined });
  });
});
