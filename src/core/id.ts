/**
 * MinimalCAD Web
 * core/id.ts
 *
 * Stable short entity ids, matching the Python source's `uuid.uuid4().hex[:8]`
 * convention closely enough for cross-file compatibility (an opaque short
 * string token, not interpreted structurally anywhere) -- generated once at
 * construction, never regenerated on load except for entities loaded from a
 * file that predates this field.
 */

export function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  }
  // Fallback for environments without crypto.randomUUID (older browsers, some test runners).
  return Math.random().toString(16).slice(2, 10).padEnd(8, "0");
}
