/**
 * MinimalCAD Web
 * ui/cloudPanel.ts
 *
 * Thin, always-statically-imported shim in front of ui/cloudPanelImpl.ts --
 * see that module's header comment for the full reason (bundle size for
 * users who never touch cloud features, and a Rollup tree-shaking
 * correctness issue triggered by @supabase/supabase-js's dependency graph
 * being reachable from the same chunk as unrelated toolbar.ts code).
 *
 * Deliberately duplicates the tiny "is Supabase configured" check from
 * lib/supabaseClient.ts rather than importing it from there: importing
 * anything from that module -- even just this one boolean helper -- would
 * statically pull in its `import { createClient } from "@supabase/supabase-js"`
 * line too, defeating the point of this split. Two lines of duplication is
 * cheaper than depending on tree-shaking to prune it back out, especially
 * given the tree-shaking bug this split exists to route around.
 */

import type { Engine } from "../engine/engine";

function isSupabaseConfigured(): boolean {
  return (
    import.meta.env.VITE_SUPABASE_URL !== undefined &&
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY !== undefined || import.meta.env.VITE_SUPABASE_ANON_KEY !== undefined)
  );
}

let impl: typeof import("./cloudPanelImpl") | null = null;

/** No-ops if the cloud panel was never mounted (Supabase unconfigured, or
 *  called before initCloudUi's dynamic import has resolved -- which in
 *  practice never happens, since that import starts synchronously at app
 *  init and any user action fast enough to race it couldn't have a cloud
 *  drawing tracked yet regardless). */
export function clearCurrentCloudDrawing(): void {
  impl?.clearCurrentCloudDrawing();
}

/** Adds a "Cloud" button to the toolbar and lazily loads the real panel --
 *  a no-op if Supabase isn't configured, so an unconfigured/offline
 *  checkout shows no cloud UI at all rather than a broken one. */
export function initCloudUi(toolbarRoot: HTMLElement, engine: Engine, requestRedraw: () => void): void {
  if (!isSupabaseConfigured()) return;

  void import("./cloudPanelImpl").then((mod) => {
    impl = mod;
    mod.mountCloudUi(toolbarRoot, engine, requestRedraw);
  });
}
