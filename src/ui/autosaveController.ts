/**
 * MinimalCAD Web
 * ui/autosaveController.ts
 *
 * Wires the "one reserved Autosave slot" (io/autosave.ts) into the app
 * lifecycle: offers to restore it once at startup, then keeps it updated
 * with the current Document every ~30s and whenever the tab is hidden, for
 * as long as the user stays signed in.
 *
 * A no-op entirely when Supabase isn't configured, and never statically
 * imports lib/auth.ts or io/autosave.ts (both reach @supabase/supabase-js)
 * -- see ui/cloudPanel.ts's header comment for why that split matters for
 * the main bundle.
 */

import type { Engine } from "../engine/engine";
import { showRestorePrompt } from "./restorePrompt";
import { showToast } from "./toast";
import { clearCurrentCloudDrawing } from "./cloudPanel";

const AUTOSAVE_INTERVAL_MS = 30_000;

function isSupabaseConfigured(): boolean {
  return (
    import.meta.env.VITE_SUPABASE_URL !== undefined &&
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY !== undefined || import.meta.env.VITE_SUPABASE_ANON_KEY !== undefined)
  );
}

export function initAutosave(engine: Engine, requestRedraw: () => void): void {
  if (!isSupabaseConfigured()) return;

  void Promise.all([import("../lib/auth"), import("../io/autosave")]).then(([auth, autosave]) => {
    let signedIn = false;
    let saving = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let offeredRestore = false;

    function documentIsEmpty(): boolean {
      return engine.document.entities.length === 0 && engine.document.constraints.length === 0;
    }

    function runAutosave(): void {
      if (!signedIn || saving || documentIsEmpty()) return;
      saving = true;
      void autosave.writeAutosave(engine.document.toDict()).finally(() => {
        saving = false;
      });
    }

    function startTimer(): void {
      if (timer !== null) return;
      timer = setInterval(runAutosave, AUTOSAVE_INTERVAL_MS);
    }

    function stopTimer(): void {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    }

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") runAutosave();
    });

    function offerRestoreIfAny(): void {
      if (offeredRestore || !documentIsEmpty()) return;
      offeredRestore = true;
      void autosave.loadAutosave().then((result) => {
        if (!result.ok || result.value === null) return;
        if (!documentIsEmpty()) return; // the user started drawing while this was loading

        showRestorePrompt(
          () => {
            const parseResult = engine.document.restoreFromDict(result.value!.snapshot);
            engine.undo.clear();
            engine.zoomExtents();
            clearCurrentCloudDrawing();
            requestRedraw();
            if (parseResult.skippedCount > 0) {
              showToast(`${parseResult.skippedCount} unsupported entity type(s) were skipped.`);
            }
          },
          () => {
            void autosave.clearAutosave();
          },
        );
      });
    }

    auth.onAuthStateChange((user) => {
      signedIn = user !== null;
      if (!signedIn) {
        stopTimer();
        autosave.resetAutosaveSession();
        return;
      }
      startTimer();
      offerRestoreIfAny();
    });
  });
}
