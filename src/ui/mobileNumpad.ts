/**
 * MinimalCAD Web
 * ui/mobileNumpad.ts
 *
 * The touch-only numeric keypad's wiring: shows/hides #mobile-numpad purely
 * off CommandBar's own "inputModeChanged"/"inputDisabled" events (see
 * commandBar.ts's enableInput() doc comment) -- there is no separate device
 * or command-state tracking here at all. Each key just calls
 * CommandBar.insertChar()/backspace()/pressTab(), which do exactly what the
 * corresponding real keystroke would (including firing the same events
 * wireField()'s own listeners handle), so live-preview updates and the
 * existing Tab-switches-fields behavior both keep working unchanged.
 */

import type { CommandBar } from "./commandBar";

export function buildMobileNumpad(root: HTMLElement, commandBar: CommandBar): void {
  for (const btn of root.querySelectorAll<HTMLButtonElement>("button[data-key]")) {
    // Same focus-steal prevention as every other touch control in this app
    // (see ui/toolbar.ts's preventFocusSteal() doc comment) -- critical here
    // specifically, since CommandBar.insertChar()/backspace() target
    // whichever field document.activeElement says is focused; a numpad
    // button stealing that focus for itself would break the very next tap.
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      const key = btn.dataset.key!;
      if (key === "Backspace") commandBar.backspace();
      else if (key === "Tab") commandBar.pressTab();
      else commandBar.insertChar(key);
    });
  }

  commandBar.addEventListener("inputModeChanged", (e) => {
    const { mode } = (e as CustomEvent<{ mode: "numeric" | "text" }>).detail;
    root.classList.toggle("visible", mode === "numeric");
  });
  commandBar.addEventListener("inputDisabled", () => root.classList.remove("visible"));
}
