/**
 * MinimalCAD Web
 * ui/restorePrompt.ts
 *
 * A plain, dismissible banner asking "Restore your last session?" -- shown
 * once at startup when io/autosave.ts finds an existing autosave slot.
 * Deliberately not a modal/overlay (nothing blocks the canvas): the user can
 * ignore it and keep working on a blank drawing, and it just goes away.
 */

let bannerEl: HTMLDivElement | null = null;

export function showRestorePrompt(onRestore: () => void, onDiscard: () => void): void {
  hideRestorePrompt();

  const el = document.createElement("div");
  el.id = "restore-prompt";

  const message = document.createElement("span");
  message.textContent = "Restore your last unsaved session?";
  el.appendChild(message);

  const restoreBtn = document.createElement("button");
  restoreBtn.textContent = "Restore";
  restoreBtn.addEventListener("click", () => {
    hideRestorePrompt();
    onRestore();
  });
  el.appendChild(restoreBtn);

  const discardBtn = document.createElement("button");
  discardBtn.textContent = "Discard";
  discardBtn.addEventListener("click", () => {
    hideRestorePrompt();
    onDiscard();
  });
  el.appendChild(discardBtn);

  document.body.appendChild(el);
  bannerEl = el;
}

export function hideRestorePrompt(): void {
  bannerEl?.remove();
  bannerEl = null;
}
