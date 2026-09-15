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

  enableInput(): void {
    this.inputField.disabled = false;
    this.inputField.focus();
    this.fieldLocked = false;
  }

  disableInput(): void {
    this.inputField.disabled = true;
    this.inputField.blur();
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
  }

  enableDualInput(distanceDefault = "0.00", angleDefault = "0.0"): void {
    this.enableInput();
    this.inputField.value = distanceDefault;

    this.angleField.value = angleDefault;
    this.angleField.disabled = false;
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
    if (e.key === "Escape") {
      this.dispatchEvent(new CustomEvent("escapePressed"));
      e.preventDefault();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      this.submit();
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      this.handleTab(field);
      return;
    }
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
