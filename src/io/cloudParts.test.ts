import { describe, expect, it, vi, beforeEach } from "vitest";

interface FakeError {
  message: string;
  code?: string;
}

interface FakeResult<T> {
  data: T | null;
  error: FakeError | null;
}

/** Same chainable-and-thenable Postgrest stand-in as io/cloudDrawings.test.ts. */
function makeChain<T>(result: FakeResult<T>) {
  const builder = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    insert: () => builder,
    update: () => builder,
    delete: () => builder,
    single: () => builder,
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

const { listParts, fetchPart, createPart, renamePart, deletePart } = await import("./cloudParts");

beforeEach(() => {
  mockFrom.mockReset();
});

describe("listParts", () => {
  it("maps rows to CloudPartSummary[]", async () => {
    mockFrom.mockReturnValue(
      makeChain({
        data: [
          { id: "1", name: "Bracket" },
          { id: "2", name: "Washer" },
        ],
        error: null,
      }),
    );

    const result = await listParts();
    expect(result).toEqual({
      ok: true,
      value: [
        { id: "1", name: "Bracket" },
        { id: "2", name: "Washer" },
      ],
    });
    expect(mockFrom).toHaveBeenCalledWith("parts");
  });

  it("treats a null data response as an empty list", async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }));
    expect(await listParts()).toEqual({ ok: true, value: [] });
  });
});

describe("fetchPart", () => {
  it("validates the jsonb document column the same way a local file is validated", async () => {
    mockFrom.mockReturnValue(
      makeChain({
        data: { id: "1", name: "Bracket", document: { entities: [{ type: "circle" }], constraints: [] } },
        error: null,
      }),
    );

    const result = await fetchPart("1");
    expect(result).toEqual({
      ok: true,
      value: { id: "1", name: "Bracket", snapshot: { entities: [{ type: "circle" }], constraints: [] } },
    });
  });

  it("rejects a malformed document payload", async () => {
    mockFrom.mockReturnValue(makeChain({ data: { id: "1", name: "Bad", document: "not an object" }, error: null }));
    const result = await fetchPart("1");
    expect(result.ok).toBe(false);
  });
});

describe("createPart", () => {
  it("returns the new row's id/name on success", async () => {
    mockFrom.mockReturnValue(makeChain({ data: { id: "new-id", name: "Bracket" }, error: null }));
    const result = await createPart("Bracket", { entities: [], constraints: [] });
    expect(result).toEqual({ ok: true, value: { id: "new-id", name: "Bracket" } });
  });

  it("translates a unique-constraint violation into a friendly 'already exists' error", async () => {
    mockFrom.mockReturnValue(
      makeChain({ data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "parts_owner_id_name_key"' } }),
    );
    const result = await createPart("Bracket", { entities: [], constraints: [] });
    expect(result).toEqual({ ok: false, error: 'A part named "Bracket" already exists' });
  });

  it("surfaces any other error message unchanged", async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: "network error" } }));
    const result = await createPart("Bracket", { entities: [], constraints: [] });
    expect(result).toEqual({ ok: false, error: "network error" });
  });
});

describe("renamePart / deletePart", () => {
  it("resolve ok on success", async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }));
    expect(await renamePart("1", "New name")).toEqual({ ok: true, value: undefined });
    expect(await deletePart("1")).toEqual({ ok: true, value: undefined });
  });

  it("translates a rename's unique-constraint violation the same way create does", async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { code: "23505", message: "duplicate key" } }));
    const result = await renamePart("1", "Washer");
    expect(result).toEqual({ ok: false, error: 'A part named "Washer" already exists' });
  });
});
