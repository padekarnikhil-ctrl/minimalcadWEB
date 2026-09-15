/**
 * MinimalCAD Web
 * testUtils/fakeEngine.ts
 *
 * A real Engine wired to a minimal fake CommandBar (duck-typed to the
 * subset of methods commands actually call) -- lets command state machines
 * be driven and asserted on directly in vitest with no DOM/jsdom needed,
 * exactly the payoff engine/engine.ts's own doc comment calls out.
 */

import { Engine } from "../engine/engine";
import { Viewport } from "../engine/viewport";
import type { CommandBar } from "../ui/commandBar";

function makeFakeCommandBar(): CommandBar {
  const fake = {
    setStatus: () => {},
    enableInput: () => {},
    disableInput: () => {},
    clear: () => {},
    text: () => "",
    setValue: () => {},
    setReady: () => {},
    enableDualInput: () => {},
    disableDualInput: () => {},
    setLiveValue: () => {},
    setLiveAngle: () => {},
    setSnap: () => {},
    setTypedCommand: () => {},
    setOrtho: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  };
  return fake as unknown as CommandBar;
}

export function makeTestEngine(): Engine {
  const viewport = new Viewport(
    () => 800,
    () => 600,
  );
  return new Engine(viewport, makeFakeCommandBar(), () => {});
}
