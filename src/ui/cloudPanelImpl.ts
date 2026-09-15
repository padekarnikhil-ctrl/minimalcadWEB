/**
 * MinimalCAD Web
 * ui/cloudPanelImpl.ts
 *
 * Cloud account + drawings UI: a single toggleable panel (appended to
 * <body>, same pattern as ui/toast.ts's lazily-created element) that shows
 * an email/password sign-in form when signed out, or the signed-in user's
 * drawings list (open/save/rename/delete) when signed in. Entirely
 * additive -- local Save/Open (io/saveLoad.ts) and DXF Export/Import
 * (io/dxf.ts) are untouched; this only adds a "Cloud" toolbar button next
 * to them.
 *
 * All user-controlled strings (drawing names, email) are set via
 * `textContent`/`value`, never interpolated into innerHTML, so a drawing
 * named e.g. "<img onerror=...>" can't inject markup into this page.
 *
 * Split out from ui/cloudPanel.ts (the tiny shim toolbar.ts actually
 * imports) so this module -- and the @supabase/supabase-js dependency
 * graph it pulls in -- only ever loads via a dynamic import() behind
 * cloudPanel.ts's own env-var check. Two independent reasons: (1) a user
 * who never touches cloud features shouldn't pay for downloading
 * auth/postgrest/realtime client code at all, and (2) a Vite 5.4.21/Rollup
 * production build was observed to mis-tree-shake toolbar.ts's *unrelated*
 * call sites (clearCurrentCloudDrawing()/initCloudUi()) down to nothing --
 * confirmed by bisection to appear only once supabase-js's ~46-module
 * dependency graph was statically reachable from the same chunk -- and
 * disappear once it was isolated behind a dynamic import() chunk boundary
 * instead. Revisit this split if a future Vite/Rollup upgrade is confirmed
 * to no longer need it.
 */

import type { Engine } from "../engine/engine";
import { signUp, signIn, signOut, onAuthStateChange } from "../lib/auth";
import type { AuthUser } from "../lib/auth";
import { listDrawings, fetchDrawing, createDrawing, updateDrawing, renameDrawing, deleteDrawing } from "../io/cloudDrawings";
import type { CloudDrawingSummary } from "../io/cloudDrawings";
import { listParts, fetchPart, createPart, renamePart, deletePart } from "../io/cloudParts";
import type { CloudPartSummary } from "../io/cloudParts";
import { parseEntities, placeBeside } from "../core/document";
import { showToast } from "./toast";
import { drawIcon } from "./toolIcons";

let currentUser: AuthUser | null = null;
let currentDrawingId: string | null = null;
let currentDrawingName = "Untitled";

let panelEl: HTMLDivElement | null = null;
let cloudButtonEl: HTMLButtonElement | null = null;
let engineRef: Engine | null = null;
let requestRedrawRef: (() => void) | null = null;

/** Called by ui/toolbar.ts whenever the document is replaced by something
 *  other than opening this exact cloud drawing (local Open, DXF Import) --
 *  so a subsequent cloud Save can't silently overwrite an unrelated cloud
 *  drawing's content under its old id. */
export function clearCurrentCloudDrawing(): void {
  currentDrawingId = null;
  currentDrawingName = "Untitled";
}

/** Adds a "Cloud" button to the toolbar and builds the (initially hidden)
 *  panel. Called by cloudPanel.ts's shim only after it has already
 *  confirmed Supabase is configured -- see this module's own header
 *  comment for why that check lives there instead of here. */
export function mountCloudUi(toolbarRoot: HTMLElement, engine: Engine, requestRedraw: () => void): void {
  engineRef = engine;
  requestRedrawRef = requestRedraw;

  const gapEl = document.createElement("div");
  gapEl.className = "toolbar-gap";
  toolbarRoot.appendChild(gapEl);

  const btn = document.createElement("button");
  btn.className = "icon-btn";
  btn.title = "Cloud";
  btn.setAttribute("aria-label", "Cloud");
  const canvas = document.createElement("canvas");
  drawIcon("cloud", canvas);
  btn.appendChild(canvas);
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", () => {
    if (panelEl === null) return;
    panelEl.hidden = !panelEl.hidden;
    if (!panelEl.hidden) refreshAndRender();
  });
  toolbarRoot.appendChild(btn);
  cloudButtonEl = btn;

  panelEl = document.createElement("div");
  panelEl.id = "cloud-panel";
  panelEl.hidden = true;
  document.body.appendChild(panelEl);

  // Auto-close on any tap/click outside the panel (and outside the toggle
  // button itself, which already has its own open/close toggle above) --
  // on a narrow/tablet layout the toolbar can wrap enough rows that this
  // fixed-position panel (see style.css) visually covers the Cloud button
  // that opened it, leaving no way to close it otherwise. pointerdown
  // (not click) matches the immediate close-on-touch-down feel of a normal
  // dropdown/popover, and fires alongside -- never instead of -- whatever
  // canvasView.ts's own pointer handling does with that same touch, since
  // this listener never calls preventDefault()/stopPropagation().
  document.addEventListener("pointerdown", (e) => {
    if (panelEl === null || panelEl.hidden) return;
    const target = e.target;
    if (!(target instanceof Node)) return;
    if (panelEl.contains(target) || cloudButtonEl?.contains(target) === true) return;
    panelEl.hidden = true;
  });

  onAuthStateChange((user) => {
    currentUser = user;
    if (panelEl !== null && !panelEl.hidden) refreshAndRender();
  });
}

let cachedDrawings: CloudDrawingSummary[] = [];
let cachedParts: CloudPartSummary[] = [];

function refreshAndRender(): void {
  if (currentUser === null) {
    render();
    return;
  }
  void Promise.all([listDrawings(), listParts()]).then(([drawingsResult, partsResult]) => {
    if (drawingsResult.ok) cachedDrawings = drawingsResult.value;
    else showToast(`Could not load drawings: ${drawingsResult.error}`);
    if (partsResult.ok) cachedParts = partsResult.value;
    else showToast(`Could not load parts library: ${partsResult.error}`);
    render();
  });
}

function render(): void {
  if (panelEl === null) return;
  panelEl.replaceChildren();

  const header = document.createElement("div");
  header.className = "cloud-panel-header";
  header.textContent = "Cloud Drawings";
  panelEl.appendChild(header);

  if (currentUser === null) {
    panelEl.appendChild(buildAuthForm());
    return;
  }

  panelEl.appendChild(buildAccountBar(currentUser));
  panelEl.appendChild(buildSaveBar());
  panelEl.appendChild(buildDrawingsList());

  const partsHeader = document.createElement("div");
  partsHeader.className = "cloud-panel-header";
  partsHeader.textContent = "Parts Library";
  panelEl.appendChild(partsHeader);

  panelEl.appendChild(buildSavePartBar());
  panelEl.appendChild(buildPartsList());
}

function buildAuthForm(): HTMLElement {
  const form = document.createElement("div");
  form.className = "cloud-panel-section";

  const emailInput = document.createElement("input");
  emailInput.type = "email";
  emailInput.placeholder = "Email";
  emailInput.autocomplete = "email";

  const passwordInput = document.createElement("input");
  passwordInput.type = "password";
  passwordInput.placeholder = "Password";
  passwordInput.autocomplete = "current-password";

  const statusEl = document.createElement("div");
  statusEl.className = "cloud-panel-status";

  const buttonRow = document.createElement("div");
  buttonRow.className = "cloud-panel-row";

  const signInBtn = document.createElement("button");
  signInBtn.textContent = "Sign In";
  signInBtn.addEventListener("mousedown", (e) => e.preventDefault());
  signInBtn.addEventListener("click", () => {
    void signIn(emailInput.value, passwordInput.value).then((result) => {
      statusEl.textContent = result.ok ? "" : result.error;
    });
  });

  const signUpBtn = document.createElement("button");
  signUpBtn.textContent = "Sign Up";
  signUpBtn.addEventListener("mousedown", (e) => e.preventDefault());
  signUpBtn.addEventListener("click", () => {
    void signUp(emailInput.value, passwordInput.value).then((result) => {
      statusEl.textContent = result.ok
        ? "Account created -- check your email to confirm, then sign in."
        : result.error;
    });
  });

  buttonRow.append(signInBtn, signUpBtn);
  form.append(emailInput, passwordInput, buttonRow, statusEl);
  return form;
}

function buildAccountBar(user: AuthUser): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "cloud-panel-section cloud-panel-row";

  const emailEl = document.createElement("span");
  emailEl.className = "cloud-panel-email";
  emailEl.textContent = user.email ?? "Signed in";

  const signOutBtn = document.createElement("button");
  signOutBtn.textContent = "Sign Out";
  signOutBtn.addEventListener("mousedown", (e) => e.preventDefault());
  signOutBtn.addEventListener("click", () => {
    void signOut().then(() => {
      clearCurrentCloudDrawing();
      cachedDrawings = [];
    });
  });

  bar.append(emailEl, signOutBtn);
  return bar;
}

function buildSaveBar(): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "cloud-panel-section cloud-panel-row";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = currentDrawingName;
  nameInput.placeholder = "Drawing name";

  const saveBtn = document.createElement("button");
  saveBtn.textContent = currentDrawingId === null ? "Save to Cloud" : "Save";
  saveBtn.addEventListener("mousedown", (e) => e.preventDefault());
  saveBtn.addEventListener("click", () => {
    if (engineRef === null) return;
    const snapshot = engineRef.document.toDict();
    const name = nameInput.value.trim() || "Untitled";

    const afterSave = () => {
      currentDrawingName = name;
      showToast(`Saved "${name}" to the cloud.`);
      refreshAndRender();
    };

    if (currentDrawingId === null) {
      void createDrawing(name, snapshot).then((result) => {
        if (!result.ok) {
          showToast(`Could not save: ${result.error}`);
          return;
        }
        currentDrawingId = result.value.id;
        afterSave();
      });
    } else {
      const id = currentDrawingId;
      void updateDrawing(id, snapshot).then((result) => {
        if (!result.ok) {
          showToast(`Could not save: ${result.error}`);
          return;
        }
        // The name field may have been edited since this drawing was opened
        // -- treat a changed name here as a rename, not a silent no-op.
        if (name !== currentDrawingName) {
          void renameDrawing(id, name).then(() => afterSave());
        } else {
          afterSave();
        }
      });
    }
  });

  const saveAsNewBtn = document.createElement("button");
  saveAsNewBtn.textContent = "Save As New";
  saveAsNewBtn.title = "Create a new cloud drawing instead of overwriting the current one";
  saveAsNewBtn.addEventListener("mousedown", (e) => e.preventDefault());
  saveAsNewBtn.addEventListener("click", () => {
    if (engineRef === null) return;
    const snapshot = engineRef.document.toDict();
    const name = nameInput.value.trim() || "Untitled";
    void createDrawing(name, snapshot).then((result) => {
      if (!result.ok) {
        showToast(`Could not save: ${result.error}`);
        return;
      }
      currentDrawingId = result.value.id;
      currentDrawingName = name;
      showToast(`Saved "${name}" as a new cloud drawing.`);
      refreshAndRender();
    });
  });

  bar.append(nameInput, saveBtn, saveAsNewBtn);
  return bar;
}

function buildDrawingsList(): HTMLElement {
  const list = document.createElement("div");
  list.className = "cloud-panel-section cloud-panel-list";

  if (cachedDrawings.length === 0) {
    const empty = document.createElement("div");
    empty.className = "cloud-panel-status";
    empty.textContent = "No cloud drawings yet.";
    list.appendChild(empty);
    return list;
  }

  for (const drawing of cachedDrawings) {
    list.appendChild(buildDrawingRow(drawing));
  }
  return list;
}

function buildDrawingRow(drawing: CloudDrawingSummary): HTMLElement {
  const row = document.createElement("div");
  row.className = "cloud-panel-row cloud-panel-drawing-row";
  if (drawing.id === currentDrawingId) row.classList.add("active");

  const nameEl = document.createElement("span");
  nameEl.className = "cloud-panel-drawing-name";
  nameEl.textContent = drawing.name;
  nameEl.title = new Date(drawing.updatedAt).toLocaleString();

  const openBtn = document.createElement("button");
  openBtn.textContent = "Open";
  openBtn.addEventListener("mousedown", (e) => e.preventDefault());
  openBtn.addEventListener("click", () => {
    if (engineRef === null || requestRedrawRef === null) return;
    void fetchDrawing(drawing.id).then((result) => {
      if (!result.ok) {
        showToast(`Could not open drawing: ${result.error}`);
        return;
      }
      const engine = engineRef!;
      const parseResult = engine.document.restoreFromDict(result.value.snapshot);
      engine.undo.clear();
      engine.zoomExtents();
      currentDrawingId = result.value.id;
      currentDrawingName = result.value.name;
      requestRedrawRef!();
      render();
      if (parseResult.skippedCount > 0) {
        showToast(`${parseResult.skippedCount} unsupported entity type(s) were skipped.`);
      }
    });
  });

  const renameBtn = document.createElement("button");
  renameBtn.textContent = "Rename";
  renameBtn.addEventListener("mousedown", (e) => e.preventDefault());
  renameBtn.addEventListener("click", () => {
    const nextName = window.prompt("Rename drawing", drawing.name);
    if (nextName === null) return;
    const trimmed = nextName.trim();
    if (trimmed === "" || trimmed === drawing.name) return;
    void renameDrawing(drawing.id, trimmed).then((result) => {
      if (!result.ok) {
        showToast(`Could not rename: ${result.error}`);
        return;
      }
      if (drawing.id === currentDrawingId) currentDrawingName = trimmed;
      refreshAndRender();
    });
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("mousedown", (e) => e.preventDefault());
  deleteBtn.addEventListener("click", () => {
    if (!window.confirm(`Delete "${drawing.name}"? This cannot be undone.`)) return;
    void deleteDrawing(drawing.id).then((result) => {
      if (!result.ok) {
        showToast(`Could not delete: ${result.error}`);
        return;
      }
      if (drawing.id === currentDrawingId) clearCurrentCloudDrawing();
      refreshAndRender();
    });
  });

  row.append(nameEl, openBtn, renameBtn, deleteBtn);
  return row;
}

// --- Parts Library --- ported concept from the desktop app's
// commands/save_library.py/insert_library.py, which store each part as a
// standalone .jcad file in a filesystem folder; this port stores the same
// Document JSON shape as rows in the `parts` table instead (see
// io/cloudParts.ts and supabase/migrations/0003_parts.sql), since the
// browser has no filesystem and this app supports multiple accounts.

function buildSavePartBar(): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "cloud-panel-section cloud-panel-row";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Part name";

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save Selection as Part";
  saveBtn.title = "Saves the current selection, or the whole drawing if nothing is selected";
  saveBtn.addEventListener("mousedown", (e) => e.preventDefault());
  saveBtn.addEventListener("click", () => {
    if (engineRef === null) return;
    const name = nameInput.value.trim();
    if (name === "") {
      showToast("Enter a name for the part first.");
      return;
    }

    // Matches commands/save_library.py: the current selection if there is
    // one, otherwise the whole document.
    const selected = engineRef.selection.getEntities();
    const source = selected.length > 0 ? selected : engineRef.document.getEntities();
    if (source.length === 0) {
      showToast("Nothing to save -- the drawing is empty.");
      return;
    }
    const snapshot = { entities: source.map((e) => e.serialize()), constraints: [] };

    void createPart(name, snapshot).then((result) => {
      if (!result.ok) {
        showToast(`Could not save part: ${result.error}`);
        return;
      }
      nameInput.value = "";
      showToast(`Saved "${name}" to your Parts Library.`);
      refreshAndRender();
    });
  });

  bar.append(nameInput, saveBtn);
  return bar;
}

function buildPartsList(): HTMLElement {
  const list = document.createElement("div");
  list.className = "cloud-panel-section cloud-panel-list";

  if (cachedParts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "cloud-panel-status";
    empty.textContent = "No saved parts yet.";
    list.appendChild(empty);
    return list;
  }

  for (const part of cachedParts) {
    list.appendChild(buildPartRow(part));
  }
  return list;
}

function buildPartRow(part: CloudPartSummary): HTMLElement {
  const row = document.createElement("div");
  row.className = "cloud-panel-row cloud-panel-drawing-row";

  const nameEl = document.createElement("span");
  nameEl.className = "cloud-panel-drawing-name";
  nameEl.textContent = part.name;

  const insertBtn = document.createElement("button");
  insertBtn.textContent = "Insert";
  insertBtn.title = "Merges this part into the current canvas beside the existing drawing";
  insertBtn.addEventListener("mousedown", (e) => e.preventDefault());
  insertBtn.addEventListener("click", () => {
    if (engineRef === null) return;
    void fetchPart(part.id).then((result) => {
      if (!result.ok) {
        showToast(`Could not insert part: ${result.error}`);
        return;
      }
      const engine = engineRef!;
      const { entities: incoming, skippedCount } = parseEntities(result.value.snapshot.entities);
      if (incoming.length === 0) return;

      // Same placement logic as Insert Drawing (ui/toolbar.ts) -- offset
      // clear of the existing content so a repeated Insert click (the
      // desktop app's "comma to insert & continue" flow) drops each copy
      // beside the last instead of stacking them on top of each other.
      if (engine.document.getEntities().length > 0) {
        placeBeside(engine.document.getBounds(), incoming);
      }

      engine.undo.push(engine.document.toDict());
      for (const entity of incoming) engine.document.addEntity(entity);
      engine.selection.clear();
      engine.zoomExtents();
      requestRedrawRef?.();
      if (skippedCount > 0) {
        showToast(`${skippedCount} unsupported entity type(s) were skipped.`);
      }
    });
  });

  const renameBtn = document.createElement("button");
  renameBtn.textContent = "Rename";
  renameBtn.addEventListener("mousedown", (e) => e.preventDefault());
  renameBtn.addEventListener("click", () => {
    const nextName = window.prompt("Rename part", part.name);
    if (nextName === null) return;
    const trimmed = nextName.trim();
    if (trimmed === "" || trimmed === part.name) return;
    void renamePart(part.id, trimmed).then((result) => {
      if (!result.ok) {
        showToast(`Could not rename: ${result.error}`);
        return;
      }
      refreshAndRender();
    });
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("mousedown", (e) => e.preventDefault());
  deleteBtn.addEventListener("click", () => {
    if (!window.confirm(`Delete "${part.name}" from your Parts Library? This cannot be undone.`)) return;
    void deletePart(part.id).then((result) => {
      if (!result.ok) {
        showToast(`Could not delete: ${result.error}`);
        return;
      }
      refreshAndRender();
    });
  });

  row.append(nameEl, insertBtn, renameBtn, deleteBtn);
  return row;
}
