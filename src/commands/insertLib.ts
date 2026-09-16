/**
 * MinimalCAD Web
 * commands/insertLib.ts
 *
 * Ported from commands/insert_library.py's core workflow: type a saved
 * part's name to merge it into the current canvas, repeating to insert
 * several without re-running the command, Escape to finish.
 *
 * Deliberately simpler than the desktop source's exact UI: insert_library.py
 * drives a live-filtering suggestion dropdown (arrow keys to navigate,
 * Enter accepts the highlighted row, comma inserts-and-continues) built on
 * a QListWidget popup ui/command_bar.py owns. This port has no such
 * dropdown primitive (nor, arguably, much use for one on a touch-first
 * tablet UI, where the existing cloud-panel Parts Library list -- tap a
 * row's own Insert button -- already covers that exact interaction more
 * naturally than a keyboard-driven autocomplete would). Typing a name (or
 * enough of one to match exactly one part) and pressing Enter is the same
 * core gesture with none of that new UI surface: unambiguous substring
 * matches insert immediately, an ambiguous one lists the candidates so the
 * user can type more, matching the same information the dropdown would
 * have shown, just via the status line instead of a popup list.
 *
 * @supabase/supabase-js is NEVER statically imported here -- see
 * commands/saveLib.ts's header comment for why (this file mirrors that
 * exact dynamic-import approach for io/cloudParts.ts).
 */

import type { Engine } from "../engine/engine";
import { BaseCommand } from "./base";
import { parseEntities, placeBeside, originAlign } from "../core/document";
import type { CloudPartSummary } from "../io/cloudParts";

function isSupabaseConfigured(): boolean {
  return (
    import.meta.env.VITE_SUPABASE_URL !== undefined &&
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY !== undefined || import.meta.env.VITE_SUPABASE_ANON_KEY !== undefined)
  );
}

export class InsertLibCommand extends BaseCommand {
  private names: CloudPartSummary[] = [];
  private busy = false;
  // See commands/saveLib.ts's identical field for why this exists --
  // CommandManager reuses one singleton instance per registered command name.
  private generation = 0;

  constructor(engine: Engine) {
    super(engine);
  }

  start(): void {
    this.generation++;
    const generation = this.generation;
    this.busy = true;
    this.names = [];

    if (!isSupabaseConfigured()) {
      this.commandBar.setStatus("INSERT FROM LIBRARY", "Cloud isn't configured");
      this.commandBar.disableInput();
      return;
    }

    this.commandBar.setStatus("INSERT FROM LIBRARY", "Loading your Parts Library...");
    this.commandBar.disableInput();

    void import("../io/cloudParts").then(({ listParts }) => {
      void listParts().then((result) => {
        if (generation !== this.generation) return; // cancelled/restarted meanwhile
        this.busy = false;
        if (!result.ok) {
          this.commandBar.setStatus("INSERT FROM LIBRARY", `Could not load library: ${result.error}`);
          return;
        }
        this.names = result.value;
        this.showPrompt();
      });
    });
  }

  private showPrompt(): void {
    if (this.names.length === 0) {
      this.commandBar.setStatus("INSERT FROM LIBRARY", "Library is empty - see Save to Library");
      this.commandBar.disableInput();
      return;
    }
    this.commandBar.setStatus("INSERT FROM LIBRARY", "Type a part name (Enter to insert, Escape to finish)");
    this.commandBar.enableInput("text");
  }

  textInput(text: string): void {
    if (this.busy) return;
    const query = text.trim().toLowerCase();
    if (query === "") {
      const available = this.names.map((p) => p.name).join(", ");
      this.commandBar.setStatus("INSERT FROM LIBRARY", `Available: ${available}`);
      return;
    }

    const matches = this.names.filter((p) => p.name.toLowerCase().includes(query));
    if (matches.length === 0) {
      this.commandBar.setStatus("INSERT FROM LIBRARY", `No part matches "${text.trim()}"`);
      return;
    }
    if (matches.length > 1) {
      const shown = matches
        .slice(0, 5)
        .map((p) => p.name)
        .join(", ");
      const extra = matches.length > 5 ? `, +${matches.length - 5} more` : "";
      this.commandBar.setStatus("INSERT FROM LIBRARY", `Multiple matches: ${shown}${extra} - type more of the name`);
      return;
    }

    this.insertPart(matches[0]!);
  }

  private insertPart(part: CloudPartSummary): void {
    this.busy = true;
    this.commandBar.disableInput();
    const generation = this.generation;

    void import("../io/cloudParts").then(({ fetchPart }) => {
      void fetchPart(part.id).then((result) => {
        if (generation !== this.generation) return;
        this.busy = false;

        if (!result.ok) {
          this.commandBar.setStatus("INSERT FROM LIBRARY", `Could not insert part: ${result.error}`);
          this.showPrompt();
          return;
        }

        const { entities: incoming, skippedCount } = parseEntities(result.value.snapshot.entities);
        if (incoming.length === 0) {
          this.showPrompt();
          return;
        }

        // Matches insert_library.py exactly: place beside the existing
        // content if there is any, otherwise align to the origin for the
        // very first thing in an empty drawing.
        if (this.document.getEntities().length > 0) {
          placeBeside(this.document.getBounds(), incoming);
        } else {
          originAlign(incoming);
        }

        this.undo.push(this.document.toDict());
        this.engine.selection.clear();
        for (const entity of incoming) {
          this.document.addEntity(entity);
          this.engine.selection.select(entity);
        }
        this.engine.zoomExtents();

        const skippedNote = skippedCount > 0 ? ` (${skippedCount} unsupported entity type(s) skipped)` : "";
        this.commandBar.setStatus(
          "INSERT FROM LIBRARY",
          `Inserted "${part.name}"${skippedNote} - next part name (Enter), or Escape to finish`,
        );
        this.commandBar.enableInput("text");
        this.engine.requestRedraw();
      });
    });
  }

  cancel(): void {
    this.generation++;
    this.busy = false;
    this.names = [];
    this.commandBar.setReady();
  }
}
