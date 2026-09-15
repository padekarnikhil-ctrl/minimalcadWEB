/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  // Supabase's current API key terminology: the browser-safe "publishable"
  // key (sb_publishable_...) replacing the older JWT-based "anon" key.
  // Either name works with createClient() unchanged -- only the dashboard
  // label/format differs -- so both are accepted here for projects that
  // still only expose the legacy anon key.
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
