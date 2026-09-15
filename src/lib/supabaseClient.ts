/**
 * MinimalCAD Web
 * lib/supabaseClient.ts
 *
 * Singleton Supabase client for cloud drawings + auth. Configured entirely
 * from Vite env vars (VITE_-prefixed ones are the only ones Vite inlines
 * into the built bundle) -- there is no backend in this app to keep a
 * secret behind, so this MUST only ever hold the browser-safe key:
 *
 *   - VITE_SUPABASE_URL: the project's API URL.
 *   - VITE_SUPABASE_PUBLISHABLE_KEY: Supabase's current browser-safe key
 *     (sb_publishable_...), OR VITE_SUPABASE_ANON_KEY as a fallback for
 *     projects that only expose the legacy anon (JWT) key -- createClient()
 *     accepts either format unchanged, only the dashboard label differs.
 *
 * NEVER read a service-role/secret key here (or anywhere in src/) -- that
 * key bypasses Row Level Security entirely and must never reach a browser
 * bundle. RLS (see supabase/migrations/0001_drawings.sql) is this app's
 * entire data-access boundary given it's a static SPA with no server.
 */

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

function requiredConfig(): { url: string; key: string } {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (url === undefined || key === undefined) {
    throw new Error(
      "Supabase isn't configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY " +
        "(or VITE_SUPABASE_ANON_KEY) -- see .env.local.example.",
    );
  }
  return { url, key };
}

let client: SupabaseClient | null = null;

/** Lazily creates the client on first use (not at module load) so importing
 *  this module never throws in a build/test that doesn't touch cloud
 *  features -- only actually calling into Supabase requires configuration. */
export function getSupabaseClient(): SupabaseClient {
  if (client === null) {
    const { url, key } = requiredConfig();
    client = createClient(url, key);
  }
  return client;
}

/** True once VITE_SUPABASE_URL/KEY are present -- lets UI code hide cloud
 *  features entirely rather than surfacing a runtime error when this app is
 *  run without Supabase configured (e.g. a plain local/offline checkout). */
export function isSupabaseConfigured(): boolean {
  return (
    import.meta.env.VITE_SUPABASE_URL !== undefined &&
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY !== undefined || import.meta.env.VITE_SUPABASE_ANON_KEY !== undefined)
  );
}
