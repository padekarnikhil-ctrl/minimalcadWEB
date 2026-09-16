/**
 * MinimalCAD Web
 * commands/insertLib.ts
 *
 * Ported from commands/insert_library.py's workflow, now including the
 * desktop's actual live-filtering suggestion popup (arrow keys to navigate,
 * Enter accepts the highlighted row, comma inserts-and-continues) via
 * ui/commandBar.ts's showSuggestions()/hideSuggestions() primitive and its
 * textChanged/suggestionAcceptedContinue events -- the CommandBar owns all
 * keyboard interception for the popup; this command only ever tells it what
 * list to show and reacts to the two events it emits.
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

    // Attached once, for the lifetime of this singleton instance -- guarded
    // by "am I the currently active command" instead of connect/disconnect,
    // since CommandManager never constructs a second InsertLibCommand.
    this.commandBar.addEventListener("textChanged", (e) => {
      this.onTextChanged((e as CustomEvent<string>).detail);
    });
    this.commandBar.addEventListener("suggestionAcceptedContinue", (e) => {
      this.onSuggestionAcceptedContinue((e as CustomEvent<string>).detail);
    });
  }

  private isActive(): boolean {
    return this.engine.commandManager.currentCommand === this;
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
    this.commandBar.setStatus(
      "INSERT FROM LIBRARY",
      "Type a part name (Enter to insert, , to insert & continue, Escape to finish)",
    );
    this.commandBar.enableInput("text");
    this.commandBar.showSuggestions(this.names.map((p) => p.name));
  }

  // Live-filters the popup as the user types -- this is what makes it a
  // suggestion list rather than a static one. Left alone while a fetch is in
  // flight so a stray keystroke can't fight the async insert/reload path.
  private onTextChanged(text: string): void {
    if (!this.isActive() || this.busy) return;
    const query = text.trim().toLowerCase();
    const pool = query === "" ? this.names : this.names.filter((p) => p.name.toLowerCase().includes(query));
    this.commandBar.showSuggestions(pool.map((p) => p.name));
  }

  // Comma on a highlighted popup row: identical effect to typing that exact
  // name and pressing Enter, just without the popup blinking closed first.
  private onSuggestionAcceptedContinue(name: string): void {
    if (!this.isActive() || this.busy) return;
    const part = this.names.find((p) => p.name === name);
    if (part === undefined) return;
    this.insertPart(part);
  }

  textInput(text: string): void {
    if (this.busy) return;
    const trimmed = text.trim();
    if (trimmed === "") {
      const available = this.names.map((p) => p.name).join(", ");
      this.commandBar.setStatus("INSERT FROM LIBRARY", `Available: ${available}`);
      return;
    }

    // The popup always resolves Enter to one exact row's name -- check that
    // first so a part whose name is a substring of another's (e.g.
    // "Bracket" vs. "Bracket Large") can't be rejected as "ambiguous" when
    // the user in fact picked the unambiguous row.
    const exact = this.names.find((p) => p.name === trimmed);
    if (exact !== undefined) {
      this.insertPart(exact);
      return;
    }

    const query = trimmed.toLowerCase();
    const matches = this.names.filter((p) => p.name.toLowerCase().includes(query));
    if (matches.length === 0) {
      this.commandBar.setStatus("INSERT FROM LIBRARY", `No part matches "${trimmed}"`);
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
        this.commandBar.showSuggestions(this.names.map((p) => p.name));
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
