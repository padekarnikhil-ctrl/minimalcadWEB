/**
 * MinimalCAD Web
 * ui/toast.ts
 *
 * Minimal transient message (e.g. "N unsupported entities were skipped" on
 * Load) -- a plain fading <div>, no dialog framework needed.
 */

let toastEl: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function ensureToastEl(): HTMLDivElement {
  if (toastEl !== null) return toastEl;
  toastEl = document.createElement("div");
  toastEl.id = "toast";
  document.body.appendChild(toastEl);
  return toastEl;
}

export function showToast(message: string, durationMs = 3500): void {
  const el = ensureToastEl();
  el.textContent = message;
  el.classList.add("visible");

  if (hideTimer !== null) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    el.classList.remove("visible");
  }, durationMs);
}
