import { describe, it, expect, vi, afterEach } from "vitest";
import { startPartyIdleAnim } from "./party-idle-anim";

describe("startPartyIdleAnim", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not register rAF when prefers-reduced-motion is reduce", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      })
    );
    const raf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    const root = document.createElement("div");
    root.innerHTML = `<div class="party-sprite-tile--anim" data-cls="Fighter"><img /></div>`;
    const handle = startPartyIdleAnim(root);
    expect(raf).not.toHaveBeenCalled();
    handle.stop();
  });

  it("registers rAF when reduced motion is off", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      })
    );
    const raf = vi.fn().mockReturnValue(1);
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const root = document.createElement("div");
    root.innerHTML = `<div class="party-sprite-tile--anim" data-cls="Fighter"><img /></div>`;
    const handle = startPartyIdleAnim(root);
    expect(raf).toHaveBeenCalled();
    handle.stop();
  });
});
