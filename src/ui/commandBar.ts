/**
 * MinimalCAD Web
 * ui/commandBar.ts
 *
 * Ported from ui/command_bar.py's CommandBar as closely as possible --
 * including the dual-field Distance/Angle dynamic-input mode and the
 * two-stage Tab-freeze-then-select behavior (tuned in the desktop app this
 * same session), since the user explicitly wants that behavior carried over
 * faithfully rather than redesigned.
 *
 * Uses the DOM's native EventTarget/CustomEvent as the zero-dependency
 * analogue of Qt's Signals.
 */

const SELECT_DEFER_MS = 0; // JS equivalent of QTimer.singleShot(0, ...)

/** "numeric": the field holds a coordinate/distance/angle value ("12.5",
 *  "3,4", "10<45") -- the vast majority of enableInput() call sites. Sets
 *  the field's `inputmode` to "none", a real HTML attribute whose entire
 *  purpose is telling a touch device's OS "don't show your own virtual
 *  keyboard for this field, the page provides its own input UI" (see
 *  ui/mobileNumpad.ts) -- it has no effect at all on a physical keyboard.
 *  "text": free-form text (TextCommand's/LeaderCommand's own "Enter Text:"
 *  step) -- the one case that genuinely needs the system's normal keyboard. */
export type InputMode = "numeric" | "text";

export class CommandBar extends EventTarget {
  private root: HTMLElement;
  private promptLabel: HTMLSpanElement;
  private inputField: HTMLInputElement;
  private angleMarker: HTMLSpanElement;
  private angleField: HTMLInputElement;
  private snapLabel: HTMLSpanElement;
  private orthoLabel: HTMLSpanElement;

  private dualMode = false;
  private fieldLocked = false;
  private angleLocked = false;

  // Live-filtering suggestion popup (ui/command_bar.py's suggestions_list),
  // used by commands/insertLib.ts. Owned entirely here, same as every other
  // command-bar UI primitive -- a command only ever calls showSuggestions()/
  // hideSuggestions() and listens for the two events below; all keyboard
  // interception (arrows/Enter/comma) happens in onFieldKeyDown(), never
  // seen by the command itself, matching the desktop split exactly.
  private suggestionsList: HTMLDivElement;
  private suggestionNames: string[] = [];
  private suggestionIndex = -1;

  constructor(root: HTMLElement) {
    super();
    this.root = root;

    this.promptLabel = document.createElement("span");
    this.promptLabel.className = "prompt-label";

    this.inputField = document.createElement("input");
    this.inputField.type = "text";
    this.inputField.autocomplete = "off";

    this.angleMarker = document.createElement("span");
    this.angleMarker.className = "angle-marker";
    this.angleMarker.textContent = "∠"; // ∠

    this.angleField = document.createElement("input");
    this.angleField.type = "text";
    this.angleField.className = "angle-field";
    this.angleField.autocomplete = "off";

    this.snapLabel = document.createElement("span");
    this.snapLabel.className = "snap-label";

    this.orthoLabel = document.createElement("span");
    this.orthoLabel.className = "ortho-label";
    this.orthoLabel.textContent = "ORTHO";
    this.orthoLabel.title = "Toggle Ortho (F8)";
    this.orthoLabel.addEventListener("click", () => this.dispatchEvent(new CustomEvent("orthoClicked")));

    this.suggestionsList = document.createElement("div");
    this.suggestionsList.className = "suggestions-list";
    this.suggestionsList.hidden = true;
    this.root.append(this.suggestionsList);

    this.root.append(
      this.promptLabel,
      this.inputField,
      this.angleMarker,
      this.angleField,
      this.snapLabel,
      this.orthoLabel,
    );

    this.wireField(this.inputField, (text) => {
      this.fieldLocked = true;
      this.dispatchEvent(new CustomEvent("textChanged", { detail: text }));
    });
    this.wireField(this.angleField, () => {
      this.angleLocked = true;
    });

    this.setReady();
  }

  // --- Public API, mirroring ui/command_bar.py's CommandBar 1:1 ---

  setStatus(command: string, prompt = ""): void {
    const cmdUpper = command.trim().toUpperCase();
    if (cmdUpper && cmdUpper !== "READY") {
      this.promptLabel.textContent = prompt.trim() ? `${cmdUpper} | ${prompt.trim()}` : `${cmdUpper} |`;
    } else {
      this.promptLabel.textContent = "READY  —  Press ? for Help";
    }
  }

  enableInput(mode: InputMode = "numeric"): void {
    this.inputField.disabled = false;
    this.inputField.inputMode = mode === "text" ? "text" : "none";
    this.inputField.focus();
    this.fieldLocked = false;
    // Lets a touch-only numeric keypad overlay show/hide itself purely off
    // this, with no separate device/mode tracking of its own -- see
    // ui/mobileNumpad.ts.
    this.dispatchEvent(new CustomEvent("inputModeChanged", { detail: { mode } }));
  }

  disableInput(): void {
    this.inputField.disabled = true;
    this.inputField.blur();
    // blur() alone hands focus to <body> (nothing else claims it), silently
    // breaking canvas keyboard routing -- Escape-to-cancel, Delete, and
    // single-letter typed commands -- until the next canvas click. Kept as
    // an event (like escapePressed/orthoClicked) rather than a direct
    // canvas reference, matching this class's canvas-agnostic design; see
    // main.ts's listener.
    this.dispatchEvent(new CustomEvent("inputDisabled"));
  }

  clear(): void {
    this.inputField.value = "";
  }

  text(): string {
    return this.inputField.value.trim();
  }

  setValue(text: string): void {
    this.inputField.value = text;
  }

  setReady(): void {
    this.setStatus("READY");
    this.clear();
    this.disableInput();
    this.disableDualInput();
    this.hideSuggestions();
  }

  /**
   * Live-filtering popup (ui/command_bar.py's show_suggestions), rebuilt from
   * scratch on every call -- a command re-calls this on every textChanged
   * with its own filtered list. Row 0 is always pre-highlighted, matching
   * desktop (a bare Enter with an untouched/cleared field resolves to the
   * first suggestion, not to empty text).
   */
  showSuggestions(names: string[]): void {
    this.suggestionNames = names;
    this.suggestionIndex = names.length > 0 ? 0 : -1;
    this.suggestionsList.replaceChildren();
    for (const name of names) {
      const row = document.createElement("div");
      row.className = "suggestion-row";
      row.textContent = name;
      // Keep focus (and the caret) on the input field; a click on the row
      // must not blur it first.
      row.addEventListener("mousedown", (e) => e.preventDefault());
      row.addEventListener("click", () => this.acceptSuggestion(name));
      this.suggestionsList.appendChild(row);
    }
    this.suggestionsList.hidden = names.length === 0;
    this.renderSuggestionHighlight();
  }

  hideSuggestions(): void {
    this.suggestionsList.hidden = true;
    this.suggestionsList.replaceChildren();
    this.suggestionNames = [];
    this.suggestionIndex = -1;
  }

  enableDualInput(distanceDefault = "0.00", angleDefault = "0.0"): void {
    this.enableInput(); // always numeric -- distance/angle, never free text
    this.inputField.value = distanceDefault;

    this.angleField.value = angleDefault;
    this.angleField.disabled = false;
    this.angleField.inputMode = "none"; // see enableInput()'s own doc comment
    this.angleField.classList.add("visible");
    this.angleMarker.classList.add("visible");
    this.angleLocked = false;
    this.dualMode = true;
  }

  disableDualInput(): void {
    this.dualMode = false;
    this.angleField.classList.remove("visible");
    this.angleMarker.classList.remove("visible");
    this.angleField.value = "";
  }

  // --- Mobile numeric keypad support (ui/mobileNumpad.ts) ---
  //
  // The keypad has no idea which of the two fields (distance/angle) is
  // logically "active" -- it just knows a key was tapped. These three
  // methods do exactly what the corresponding real keystroke would: insert/
  // delete at the focused field's own caret position and fire the same
  // 'input'/'keydown' events wireField()'s own listeners already handle, so
  // live-preview dispatch, fieldLocked marking, and Tab's field-switching
  // all keep working unchanged -- there is nothing keypad-specific to keep
  // in sync in either of those.

  private activeField(): HTMLInputElement {
    return document.activeElement === this.angleField ? this.angleField : this.inputField;
  }

  // Whether `field`'s current value is still the live-computed default (mouse-
  // /finger-driven, via setLiveValue()/setLiveAngle()) rather than something
  // the user actually typed -- same distinction fieldLocked/angleLocked
  // already track for the physical-keyboard path. Read here instead of the
  // field's own selectionStart/selectionEnd because those get silently reset
  // to a collapsed caret every time setLiveValue() overwrites `.value` while
  // the user's finger is still moving, which made the *numpad's* first tap
  // insert at the end (append) instead of replacing the stale default --
  // exactly backwards from a real keypress hitting a select-all'd field.
  private isFieldLocked(field: HTMLInputElement): boolean {
    return field === this.angleField ? this.angleLocked : this.fieldLocked;
  }

  insertChar(char: string): void {
    const field = this.activeField();
    const locked = this.isFieldLocked(field);
    const start = locked ? (field.selectionStart ?? field.value.length) : 0;
    const end = locked ? (field.selectionEnd ?? field.value.length) : field.value.length;
    field.value = field.value.slice(0, start) + char + field.value.slice(end);
    const caret = start + char.length;
    field.setSelectionRange(caret, caret);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  backspace(): void {
    const field = this.activeField();
    const locked = this.isFieldLocked(field);
    const start = locked ? (field.selectionStart ?? field.value.length) : 0;
    const end = locked ? (field.selectionEnd ?? field.value.length) : field.value.length;
    const deleteFrom = start === end ? Math.max(0, start - 1) : start;
    field.value = field.value.slice(0, deleteFrom) + field.value.slice(end);
    field.setSelectionRange(deleteFrom, deleteFrom);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  pressTab(): void {
    this.activeField().dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  }

  setLiveValue(text: string): void {
    if (!this.fieldLocked) this.inputField.value = text;
  }

  setLiveAngle(text: string): void {
    if (this.dualMode && !this.angleLocked) this.angleField.value = text;
  }

  setSnap(snapType: string | null): void {
    this.snapLabel.textContent = snapType ?? "";
  }

  setTypedCommand(buffer: string): void {
    if (buffer) {
      this.promptLabel.textContent = `> ${buffer.toUpperCase()}`;
    } else {
      this.setStatus("READY");
    }
  }

  setOrtho(enabled: boolean): void {
    this.orthoLabel.classList.toggle("enabled", enabled);
  }

  // --- Private wiring ---

  private wireField(field: HTMLInputElement, onEdited: (text: string) => void): void {
    // Select-all-on-focus: lets the user immediately overtype a live-mouse-driven
    // value instead of landing a caret mid-text. Deferred via setTimeout(0) so the
    // browser's own click-driven cursor placement resolves first, then gets
    // overridden -- the JS equivalent of QTimer.singleShot(0, selectAll).
    field.addEventListener("focus", () => {
      setTimeout(() => field.select(), SELECT_DEFER_MS);
    });
    field.addEventListener("mousedown", () => {
      setTimeout(() => field.select(), SELECT_DEFER_MS);
    });

    field.addEventListener("input", () => onEdited(field.value));

    field.addEventListener("keydown", (e) => this.onFieldKeyDown(field, e));
  }

  private onFieldKeyDown(field: HTMLInputElement, e: KeyboardEvent): void {
    const suggestionsVisible =
      field === this.inputField && !this.suggestionsList.hidden && this.suggestionNames.length > 0;

    if (suggestionsVisible) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.moveSuggestionHighlight(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        this.moveSuggestionHighlight(-1);
        return;
      }
      if (e.key === "," && this.suggestionIndex >= 0) {
        e.preventDefault();
        this.acceptSuggestionContinue(this.suggestionNames[this.suggestionIndex]!);
        return;
      }
    }

    if (e.key === "Escape") {
      this.dispatchEvent(new CustomEvent("escapePressed"));
      e.preventDefault();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestionsVisible && this.suggestionIndex >= 0) {
        this.acceptSuggestion(this.suggestionNames[this.suggestionIndex]!);
      } else {
        this.submit();
      }
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      this.handleTab(field);
      return;
    }
  }

  private moveSuggestionHighlight(delta: number): void {
    if (this.suggestionNames.length === 0) return;
    this.suggestionIndex = Math.max(0, Math.min(this.suggestionNames.length - 1, this.suggestionIndex + delta));
    this.renderSuggestionHighlight();
  }

  private renderSuggestionHighlight(): void {
    const rows = this.suggestionsList.children;
    for (let i = 0; i < rows.length; i++) {
      rows[i]!.classList.toggle("active", i === this.suggestionIndex);
    }
  }

  // Enter (or a click) on a highlighted row: hide the popup and submit it
  // exactly as if the user had typed it and pressed Enter -- mirrors
  // command_bar.py's _accept_suggestion.
  private acceptSuggestion(name: string): void {
    this.hideSuggestions();
    this.inputField.value = name;
    this.submit();
  }

  // Comma on a highlighted row: matches ui/command_bar.py's
  // _accept_suggestion_continue -- clears the field and tells the command
  // which row was picked via a dedicated event, but deliberately leaves the
  // popup showing (the command re-populates it once it knows the next state,
  // e.g. back to the full unfiltered list) so the user can keep picking
  // without retyping or re-opening anything.
  private acceptSuggestionContinue(name: string): void {
    this.inputField.value = "";
    this.dispatchEvent(new CustomEvent("suggestionAcceptedContinue", { detail: name }));
  }

  /**
   * Two-stage per field, always starting on whichever field Tab was pressed
   * in: the FIRST Tab while a field is still live-updating (not yet locked)
   * just grabs it -- freezes further mouse-driven overwrites and selects its
   * text for overtyping, without moving focus away. Only a SECOND Tab
   * (pressed once that field is already locked) advances to the other
   * field. Without this two-stage split, Tab jumps straight from Distance to
   * Angle on the very first press, with no chance to grab/overtype Distance.
   */
  private handleTab(field: HTMLInputElement): void {
    if (!this.dualMode) {
      this.fieldLocked = true;
      field.select();
      return;
    }

    const onDistance = field === this.inputField;
    const thisLocked = onDistance ? this.fieldLocked : this.angleLocked;

    if (!thisLocked) {
      if (onDistance) this.fieldLocked = true;
      else this.angleLocked = true;
      field.select();
    } else {
      const other = onDistance ? this.angleField : this.inputField;
      if (onDistance) this.angleLocked = true;
      else this.fieldLocked = true;
      other.focus();
      other.select();
    }
  }

  private submit(): void {
    if (this.dualMode) {
      const combined = `${this.inputField.value.trim()}<${this.angleField.value.trim()}`;
      this.dispatchEvent(new CustomEvent("inputSubmitted", { detail: combined }));
      this.clear();
      this.angleField.value = "";
    } else {
      const raw = this.text();
      this.dispatchEvent(new CustomEvent("inputSubmitted", { detail: raw }));
      this.clear();
    }
  }
}
