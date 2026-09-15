import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockGetUser = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock("./supabaseClient", () => ({
  getSupabaseClient: () => ({
    auth: {
      signUp: mockSignUp,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      getUser: mockGetUser,
      onAuthStateChange: mockOnAuthStateChange,
    },
  }),
}));

const { signUp, signIn, signOut, getCurrentUser, onAuthStateChange } = await import("./auth");

beforeEach(() => {
  mockSignUp.mockReset();
  mockSignInWithPassword.mockReset();
  mockSignOut.mockReset();
  mockGetUser.mockReset();
  mockOnAuthStateChange.mockReset();
});

describe("signUp / signIn", () => {
  it("resolve ok on success", async () => {
    mockSignUp.mockResolvedValue({ error: null });
    expect(await signUp("a@example.com", "hunter2")).toEqual({ ok: true });
    expect(mockSignUp).toHaveBeenCalledWith({ email: "a@example.com", password: "hunter2" });

    mockSignInWithPassword.mockResolvedValue({ error: null });
    expect(await signIn("a@example.com", "hunter2")).toEqual({ ok: true });
  });

  it("surface the Supabase error message on failure, never throwing", async () => {
    mockSignUp.mockResolvedValue({ error: { message: "Email already registered" } });
    expect(await signUp("a@example.com", "hunter2")).toEqual({ ok: false, error: "Email already registered" });

    mockSignInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    expect(await signIn("a@example.com", "wrong")).toEqual({ ok: false, error: "Invalid login credentials" });
  });
});

describe("signOut", () => {
  it("calls through to supabase auth.signOut()", async () => {
    mockSignOut.mockResolvedValue({ error: null });
    await signOut();
    expect(mockSignOut).toHaveBeenCalled();
  });
});

describe("getCurrentUser", () => {
  it("maps a signed-in session to an AuthUser", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@example.com" } } });
    expect(await getCurrentUser()).toEqual({ id: "u1", email: "a@example.com" });
  });

  it("returns null when signed out", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("onAuthStateChange", () => {
  it("forwards session changes as AuthUser | null and returns an unsubscribe function", () => {
    const unsubscribe = vi.fn();
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      cb("SIGNED_IN", { user: { id: "u1", email: "a@example.com" } });
      return { data: { subscription: { unsubscribe } } };
    });

    const received: (unknown | null)[] = [];
    const stop = onAuthStateChange((user) => received.push(user));

    expect(received).toEqual([{ id: "u1", email: "a@example.com" }]);
    stop();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
